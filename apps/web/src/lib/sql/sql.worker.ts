import initSqlJs from "sql.js";
import type { Database } from "sql.js";

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSqlJs() {
  if (SQL) return SQL;
  SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`,
  });
  return SQL;
}

type Row = Record<string, string | number | null>;
type Data = Record<string, Row[]>;

function buildDatabase(sqlModule: Awaited<ReturnType<typeof initSqlJs>>, data: Data) {
  const db = new sqlModule.Database();
  db.run("PRAGMA foreign_keys = OFF;");

  for (const [tbl, rows] of Object.entries(data)) {
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    db.run(`CREATE TABLE IF NOT EXISTS "${tbl}" (${cols.map((c) => `"${c}"`).join(",")})`);

    const placeholders = cols.map(() => "?").join(",");
    const stmt = db.prepare(
      `INSERT INTO "${tbl}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${placeholders})`
    );
    try {
      for (const row of rows) {
        stmt.run(cols.map((c) => row[c] ?? null));
      }
    } finally {
      stmt.free();
    }
  }
  return db;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, sql, data, indexDdl, volumes } = e.data;

  try {
    const sqlModule = await getSqlJs();

    switch (type) {
      case "runQuery": {
        const db = buildDatabase(sqlModule, data);
        const results = db.exec(sql);
        db.close();
        self.postMessage({
          id,
          result: results.length ? { columns: results[0].columns, values: results[0].values } : null,
        });
        break;
      }

      case "explainQueryPlan": {
        const db = buildDatabase(sqlModule, data);
        const res = db.exec(`EXPLAIN QUERY PLAN ${sql}`);
        db.close();
        const raw = res.length
          ? (res[0].values as (string | number)[][]).map((v) => ({
              id: Number(v[0]),
              parent: Number(v[1]),
              detail: String(v[3]),
            }))
          : [];
        const detailText = raw.map((r) => r.detail).join(" | ");
        self.postMessage({
          id,
          result: {
            raw,
            usesIndex: /USING\s+(?:COVERING\s+)?INDEX/i.test(detailText),
            usesSeqScan: /SCAN\s+/i.test(detailText) && !/USING\s+(?:COVERING\s+)?INDEX/i.test(detailText),
            summary: detailText || "(no plan rows returned)",
          },
        });
        break;
      }

      case "benchmark": {
        const out: { rows: number; seqMs: number; idxMs: number }[] = [];
        for (const rowCount of volumes) {
          const syntheticData = (e.data.buildData as (rows: number) => Data)(rowCount);

          const dbSeq = buildDatabase(sqlModule, syntheticData);
          const t0 = performance.now();
          try { dbSeq.exec(sql); } catch { }
          const seqMs = performance.now() - t0;
          dbSeq.close();

          const dbIdx = buildDatabase(sqlModule, syntheticData);
          for (const ddl of indexDdl || []) {
            try { dbIdx.run(ddl); } catch { }
          }
          const t1 = performance.now();
          try { dbIdx.exec(sql); } catch { }
          const idxMs = performance.now() - t1;
          dbIdx.close();

          out.push({ rows: rowCount, seqMs, idxMs });
        }
        self.postMessage({ id, result: out });
        break;
      }

      default:
        self.postMessage({ id, error: "Unknown worker message type" });
    }
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message });
  }
};