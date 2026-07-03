import type { TableData } from "@/types";

// ── Sample datasets ─────────────────────────────────────────────
// Each entry gives visitors a working demo in one click instead of
// starting from a blank schema editor.

export const SAMPLE_DATASETS: Record<string, { label: string; description: string; data: TableData }> = {
  ecommerce: {
    label: "E-commerce",
    description: "Products, Customers, Orders — the classic join demo",
    data: {
      Products: [
        { id: 1, name: "Laptop", price: 1200, category: "Electronics" },
        { id: 2, name: "Mouse", price: 25, category: "Peripherals" },
        { id: 3, name: "Monitor", price: 300, category: "Electronics" },
        { id: 4, name: "Keyboard", price: 75, category: "Peripherals" },
      ],
      Customers: [
        { id: 1, name: "Alice", country: "US" },
        { id: 2, name: "Bob", country: "UK" },
        { id: 3, name: "Carol", country: "US" },
      ],
      Orders: [
        { id: 101, customer_id: 1, product_id: 1, quantity: 1 },
        { id: 102, customer_id: 2, product_id: 2, quantity: 2 },
        { id: 103, customer_id: 1, product_id: 3, quantity: 1 },
        { id: 104, customer_id: 3, product_id: 4, quantity: 3 },
        { id: 105, customer_id: 2, product_id: 1, quantity: 1 },
      ],
    },
  },

  streaming: {
    label: "Streaming Service",
    description: "Users, Shows, WatchHistory — session-analytics style joins",
    data: {
      Users: [
        { id: 1, name: "Priya", plan: "premium" },
        { id: 2, name: "Sam", plan: "basic" },
        { id: 3, name: "Devon", plan: "premium" },
      ],
      Shows: [
        { id: 1, title: "Nebula Drift", genre: "Sci-Fi", minutes: 42 },
        { id: 2, title: "Kitchen Wars", genre: "Reality", minutes: 55 },
        { id: 3, title: "Static Hours", genre: "Drama", minutes: 48 },
      ],
      WatchHistory: [
        { id: 1, user_id: 1, show_id: 1, watched_minutes: 42 },
        { id: 2, user_id: 1, show_id: 3, watched_minutes: 20 },
        { id: 3, user_id: 2, show_id: 2, watched_minutes: 55 },
        { id: 4, user_id: 3, show_id: 1, watched_minutes: 10 },
        { id: 5, user_id: 3, show_id: 3, watched_minutes: 48 },
      ],
    },
  },

  saas: {
    label: "SaaS Billing",
    description: "Accounts, Invoices, Payments — finance-report style joins",
    data: {
      Accounts: [
        { id: 1, company: "Acme Co", tier: "enterprise" },
        { id: 2, company: "Bramble Inc", tier: "starter" },
        { id: 3, company: "Circuit LLC", tier: "growth" },
      ],
      Invoices: [
        { id: 1, account_id: 1, amount: 4200, status: "paid" },
        { id: 2, account_id: 2, amount: 99, status: "paid" },
        { id: 3, account_id: 1, amount: 4200, status: "overdue" },
        { id: 4, account_id: 3, amount: 850, status: "paid" },
      ],
      Payments: [
        { id: 1, invoice_id: 1, amount: 4200, method: "card" },
        { id: 2, invoice_id: 2, amount: 99, method: "ach" },
        { id: 3, invoice_id: 4, amount: 850, method: "card" },
      ],
    },
  },
};

// ── Synthetic data generator ────────────────────────────────────
// Scales a base dataset up to N total rows (roughly, spread across
// tables using the same proportions as the seed data), so the
// Performance tab benchmarks against data that mirrors the schema
// the user is actually working with, rather than a fixed formula.

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.min(seed ^ (seed >>> 15), 4294967295);
    t = Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a synthetic version of `base` scaled so the largest table
 * has approximately `targetRows` rows, preserving column shapes and
 * foreign-key-looking references (columns ending in `_id`) so JOINs
 * still produce matches at scale.
 */
export function generateSyntheticData(base: TableData, targetRows: number): TableData {
  const rand = mulberry32(targetRows + Object.keys(base).length);
  const tableNames = Object.keys(base);
  const maxBaseRows = Math.max(...tableNames.map((t) => base[t].length), 1);
  const scale = Math.max(1, Math.round(targetRows / maxBaseRows));

  const out: TableData = {};
  const idCounts: Record<string, number> = {};
  tableNames.forEach((t) => (idCounts[t] = Math.max(1, base[t].length * scale)));

  for (const tbl of tableNames) {
    const seedRows = base[tbl];
    const cols = seedRows[0] ? Object.keys(seedRows[0]) : ["id"];
    const n = idCounts[tbl];
    const rows: TableData[string] = [];

    for (let i = 0; i < n; i++) {
      const seedRow = seedRows[i % seedRows.length];
      const row: Record<string, string | number | null> = {};

      for (const col of cols) {
        if (col === "id") {
          row[col] = i + 1;
        } else if (col.endsWith("_id")) {
          // Reference another (guessed) table by pluralizing the FK prefix
          const refTableGuess = tableNames.find(
            (t) => t.toLowerCase() === col.replace(/_id$/, "").toLowerCase() + "s"
          );
          const refCount = refTableGuess ? idCounts[refTableGuess] : n;
          row[col] = 1 + Math.floor(rand() * Math.max(1, refCount));
        } else if (typeof seedRow[col] === "number") {
          const base = seedRow[col] as number;
          row[col] = Math.round(base * (0.5 + rand()) * 100) / 100;
        } else {
          const val = seedRow[col];
          row[col] = val == null ? null : `${val} #${i + 1}`;
        }
      }
      rows.push(row);
    }
    out[tbl] = rows;
  }

  return out;
}
