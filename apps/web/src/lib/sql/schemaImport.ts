// ── SQL Schema (DDL) Import ─────────────────────────────────────
//
// Lets a user paste real `CREATE TABLE` statements from their own database
// and have them turned into the app's table/row data model, so they can
// visualize and optimize queries against their *actual* schema instead of
// only the built-in sample datasets.
//
// The app's internal data model has no separate "schema" concept — a table
// is just an array of plain row objects, and columns are inferred from the
// keys of those objects (see buildDatabase() in runner.ts, which also
// requires at least one row to know a table's columns at all). So importing
// DDL alone isn't enough to produce a usable table: we also generate a
// handful of plausible sample rows per column type.

export interface ParsedColumn {
  name: string;
  type: string;
}

export interface ParsedForeignKey {
  /** Column in THIS table that holds the reference. */
  column: string;
  /** Table being referenced. */
  refTable: string;
  /** Column in the referenced table (usually its primary key). */
  refColumn: string;
}

export interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
  foreignKeys: ParsedForeignKey[];
}

export interface SchemaImportResult {
  /** Table name -> generated sample rows, ready to merge into tableData. */
  tables: Record<string, Record<string, string | number | null>[]>;
  /** Names of tables that were successfully parsed, in source order. */
  tableNames: string[];
  /** Non-fatal problems encountered (e.g. a block that couldn't be parsed). */
  errors: string[];
}

const CONSTRAINT_LINE = /^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i;

/** Strips -- line comments and /* block comments *­/ so they can't confuse the parser. */
function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Splits `str` on commas that are NOT nested inside parentheses, e.g. `DECIMAL(10,2)`. */
function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function unquoteIdentifier(raw: string): string {
  return raw.replace(/^[`"'\[]/, "").replace(/[`"'\]]$/, "");
}

const IDENT = "[`\"'\\[]?[A-Za-z_][A-Za-z0-9_]*[`\"'\\]]?";
// A REFERENCES target may be schema-qualified (e.g. `dbo.employee`,
// `public."Employee"`) — capture the optional `schema.` prefix but keep only
// the bare table name, since that's what this app's flat table-name map uses.
const REF_TABLE = `(?:${IDENT}\\s*\\.\\s*)?(${IDENT})`;

// Table-level form: FOREIGN KEY (col) REFERENCES table(col)
const TABLE_LEVEL_FK = new RegExp(
  `^FOREIGN\\s+KEY\\s*\\(\\s*(${IDENT})\\s*\\)\\s*REFERENCES\\s+${REF_TABLE}\\s*\\(\\s*(${IDENT})\\s*\\)`,
  "i"
);

// Inline form: col_name TYPE ... REFERENCES table(col)  (e.g. as part of a column def)
const INLINE_FK = new RegExp(
  `REFERENCES\\s+${REF_TABLE}\\s*\\(\\s*(${IDENT})\\s*\\)`,
  "i"
);

/**
 * Extracts a foreign key relationship from one top-level comma-separated
 * piece of a CREATE TABLE body, whether it's a standalone table-level
 * constraint (`FOREIGN KEY (col) REFERENCES tbl(col)`) or an inline
 * `REFERENCES` clause tacked onto a column definition
 * (`col_id INTEGER REFERENCES tbl(col)`).
 */
function extractForeignKey(def: string): ParsedForeignKey | null {
  const trimmed = def.trim();

  const tableLevel = trimmed.match(TABLE_LEVEL_FK);
  if (tableLevel) {
    return {
      column: unquoteIdentifier(tableLevel[1]),
      refTable: unquoteIdentifier(tableLevel[2]),
      refColumn: unquoteIdentifier(tableLevel[3]),
    };
  }

  // Inline REFERENCES only makes sense on an actual column definition line
  // (not on other constraint lines like UNIQUE/CHECK), and the column name
  // is whatever parseColumnDef would extract from the same string.
  if (CONSTRAINT_LINE.test(trimmed)) return null;
  const inline = trimmed.match(INLINE_FK);
  if (!inline) return null;

  const col = parseColumnDef(trimmed);
  if (!col) return null;

  return {
    column: col.name,
    refTable: unquoteIdentifier(inline[1]),
    refColumn: unquoteIdentifier(inline[2]),
  };
}

function parseColumnDef(def: string): ParsedColumn | null {
  const trimmed = def.trim();
  if (!trimmed || CONSTRAINT_LINE.test(trimmed)) return null;

  // First token is the (possibly quoted) column name; second token
  // (if present) is the type, which may itself have a parenthesized
  // size/precision like VARCHAR(255) or DECIMAL(10,2).
  const match = trimmed.match(
    /^([`"'\[][^`"'\]]+[`"'\]]|[A-Za-z_][A-Za-z0-9_]*)\s*(\w+(?:\s*\([^)]*\))?)?/
  );
  if (!match) return null;

  const name = unquoteIdentifier(match[1]);
  const type = (match[2] || "TEXT").toUpperCase();
  return { name, type };
}

/**
 * Finds every `CREATE TABLE [IF NOT EXISTS] name ( ... )` block in `sql`,
 * correctly matching the closing parenthesis even when column types contain
 * their own parens (e.g. `DECIMAL(10,2)`).
 */
export function parseCreateTableStatements(sqlText: string): {
  tables: ParsedTable[];
  errors: string[];
} {
  const sql = stripComments(sqlText);
  const tables: ParsedTable[] = [];
  const errors: string[] = [];

  const headerRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"'\[]?[A-Za-z_][A-Za-z0-9_]*[`"'\]]?)\s*\(/gi;

  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(sql))) {
    const tableName = unquoteIdentifier(match[1]);
    const openParenIdx = headerRe.lastIndex - 1;

    // Walk forward counting paren depth to find the true matching close.
    let depth = 0;
    let i = openParenIdx;
    for (; i < sql.length; i++) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }

    if (depth !== 0) {
      errors.push(`Unbalanced parentheses in CREATE TABLE "${tableName}" — skipped.`);
      break; // rest of the string can't be reliably parsed either
    }

    const body = sql.slice(openParenIdx + 1, i);
    const parts = splitTopLevel(body);
    const columns = parts
      .map(parseColumnDef)
      .filter((c): c is ParsedColumn => c !== null);
    const foreignKeys = parts
      .map(extractForeignKey)
      .filter((fk): fk is ParsedForeignKey => fk !== null);

    if (columns.length === 0) {
      errors.push(`No columns found in CREATE TABLE "${tableName}" — skipped.`);
    } else {
      tables.push({ name: tableName, columns, foreignKeys });
    }

    headerRe.lastIndex = i + 1;
  }

  if (tables.length === 0 && errors.length === 0) {
    errors.push("No CREATE TABLE statements found.");
  }

  return { tables, errors };
}

const SAMPLE_COUNTRIES = ["US", "UK", "IN", "DE", "FR", "CA", "AU", "JP"];
const SAMPLE_WORDS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];

/** Generates a plausible value for one column, for sample row `rowIndex` (0-based). */
function sampleValue(col: ParsedColumn, rowIndex: number): string | number | null {
  const type = col.type.toUpperCase();
  const lowerName = col.name.toLowerCase();

  if (/INT|SERIAL|BIGINT|SMALLINT/.test(type)) {
    if (lowerName === "id" || lowerName.endsWith("_id")) return rowIndex + 1;
    return rowIndex + 1;
  }
  if (/BOOL/.test(type)) return rowIndex % 2;
  if (/REAL|FLOA|DOUB|DEC|NUMERIC|MONEY/.test(type)) {
    return Math.round((rowIndex + 1) * 19.99 * 100) / 100;
  }
  if (/DATE|TIME/.test(type)) {
    const d = new Date(Date.UTC(2024, 0, 1 + rowIndex));
    return d.toISOString().slice(0, 10);
  }

  // Text-like types — try to make something semantically plausible from the
  // column name so the data doesn't look completely arbitrary.
  if (lowerName.includes("email")) return `user${rowIndex + 1}@example.com`;
  if (lowerName.includes("country")) return SAMPLE_COUNTRIES[rowIndex % SAMPLE_COUNTRIES.length];
  if (lowerName.includes("name")) return `${SAMPLE_WORDS[rowIndex % SAMPLE_WORDS.length]} ${col.name}`;
  return `${col.name}_${rowIndex + 1}`;
}

const SAMPLE_ROWS_PER_TABLE = 5;

/**
 * Parses one or more CREATE TABLE statements and returns ready-to-use
 * sample table data in the app's row-object format.
 */
export function importSchemaFromSQL(sqlText: string): SchemaImportResult {
  const { tables: parsedTables, errors } = parseCreateTableStatements(sqlText);

  const tables: SchemaImportResult["tables"] = {};
  const tableNames: string[] = [];

  for (const table of parsedTables) {
    const rows: Record<string, string | number | null>[] = [];
    for (let i = 0; i < SAMPLE_ROWS_PER_TABLE; i++) {
      const row: Record<string, string | number | null> = {};
      for (const col of table.columns) {
        row[col.name] = sampleValue(col, i);
      }
      rows.push(row);
    }
    tables[table.name] = rows;
    tableNames.push(table.name);
  }

  // ── FK alignment pass ──────────────────────────────────────
  // sampleValue() above generates every column's placeholder values in
  // isolation, so a foreign-key column (e.g. Lead_Employee_ID) and the
  // primary key it references (Employee_ID) end up as independently
  // generated strings/numbers that never equal each other — any JOIN
  // between them would silently return zero rows. Now that every table's
  // base rows exist, overwrite each FK column with real values pulled from
  // its referenced table, so joins actually have matches to find.
  //
  // Table name lookups are case-insensitive since REFERENCES clauses don't
  // always match the referenced table's declared case exactly.
  const tableNameByLower = new Map<string, string>();
  for (const name of tableNames) tableNameByLower.set(name.toLowerCase(), name);

  for (const table of parsedTables) {
    if (!table.foreignKeys.length) continue;
    const rows = tables[table.name];

    for (const fk of table.foreignKeys) {
      const refTableName = tableNameByLower.get(fk.refTable.toLowerCase());
      if (!refTableName) continue; // references a table we never parsed — leave placeholder value
      const refRows = tables[refTableName];
      if (!refRows || refRows.length === 0) continue;

      // Column casing in a REFERENCES clause doesn't always match the
      // declared casing of the referenced column exactly, so resolve it
      // case-insensitively against the referenced table's actual columns.
      const refColumnKey =
        Object.keys(refRows[0]).find(
          (k) => k.toLowerCase() === fk.refColumn.toLowerCase()
        ) ?? fk.refColumn;

      const refValues = refRows.map((r) => r[refColumnKey]).filter((v) => v !== undefined);
      if (refValues.length === 0) continue; // referenced column doesn't exist on that table

      rows.forEach((row, i) => {
        if (!(fk.column in row)) return; // FK column wasn't actually declared as a column
        row[fk.column] = refValues[i % refValues.length];
      });
    }
  }

  return { tables, tableNames, errors };
}