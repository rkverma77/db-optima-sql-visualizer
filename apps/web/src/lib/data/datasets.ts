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
        { id: 1, name: "Laptop", price: 1200, category: "Electronics", brand: "Nova", stock: 34, rating: 4.5 },
        { id: 2, name: "Mouse", price: 25, category: "Peripherals", brand: "Clickr", stock: 210, rating: 4.2 },
        { id: 3, name: "Monitor", price: 300, category: "Electronics", brand: "Visio", stock: 58, rating: 4.6 },
        { id: 4, name: "Keyboard", price: 75, category: "Peripherals", brand: "Clickr", stock: 140, rating: 4.3 },
        { id: 5, name: "Webcam", price: 60, category: "Peripherals", brand: "Focalis", stock: 95, rating: 3.9 },
        { id: 6, name: "Headset", price: 90, category: "Audio", brand: "SonicWave", stock: 76, rating: 4.4 },
        { id: 7, name: "Desk Lamp", price: 35, category: "Office", brand: "Lumen", stock: 120, rating: 4.1 },
        { id: 8, name: "USB Hub", price: 20, category: "Peripherals", brand: "Clickr", stock: 260, rating: 4.0 },
      ],
      Customers: [
        { id: 1, name: "Alice", country: "US", city: "Austin", signup_date: "2023-01-14", loyalty_points: 420 },
        { id: 2, name: "Bob", country: "UK", city: "Leeds", signup_date: "2023-03-02", loyalty_points: 150 },
        { id: 3, name: "Carol", country: "US", city: "Denver", signup_date: "2023-05-19", loyalty_points: 980 },
        { id: 4, name: "David", country: "DE", city: "Berlin", signup_date: "2023-06-27", loyalty_points: 60 },
        { id: 5, name: "Elena", country: "ES", city: "Madrid", signup_date: "2023-08-11", loyalty_points: 310 },
        { id: 6, name: "Farid", country: "US", city: "Chicago", signup_date: "2024-01-05", loyalty_points: 25 },
      ],
      Orders: [
        { id: 101, customer_id: 1, product_id: 1, quantity: 1, status: "delivered", order_date: "2024-01-10" },
        { id: 102, customer_id: 2, product_id: 2, quantity: 2, status: "delivered", order_date: "2024-01-12" },
        { id: 103, customer_id: 1, product_id: 3, quantity: 1, status: "shipped", order_date: "2024-02-03" },
        { id: 104, customer_id: 3, product_id: 4, quantity: 3, status: "delivered", order_date: "2024-02-15" },
        { id: 105, customer_id: 2, product_id: 1, quantity: 1, status: "cancelled", order_date: "2024-02-20" },
        { id: 106, customer_id: 4, product_id: 5, quantity: 2, status: "delivered", order_date: "2024-03-01" },
        { id: 107, customer_id: 5, product_id: 6, quantity: 1, status: "shipped", order_date: "2024-03-09" },
        { id: 108, customer_id: 3, product_id: 7, quantity: 4, status: "delivered", order_date: "2024-03-18" },
        { id: 109, customer_id: 6, product_id: 8, quantity: 2, status: "pending", order_date: "2024-03-25" },
        { id: 110, customer_id: 1, product_id: 6, quantity: 1, status: "delivered", order_date: "2024-04-02" },
      ],
    },
  },

  streaming: {
    label: "Streaming Service",
    description: "Users, Shows, WatchHistory — session-analytics style joins",
    data: {
      Users: [
        { id: 1, name: "Priya", plan: "premium", country: "IN", signup_date: "2023-02-11" },
        { id: 2, name: "Sam", plan: "basic", country: "US", signup_date: "2023-04-22" },
        { id: 3, name: "Devon", plan: "premium", country: "CA", signup_date: "2023-05-30" },
        { id: 4, name: "Mika", plan: "basic", country: "JP", signup_date: "2023-07-09" },
        { id: 5, name: "Lars", plan: "family", country: "SE", signup_date: "2023-09-14" },
      ],
      Shows: [
        { id: 1, title: "Nebula Drift", genre: "Sci-Fi", minutes: 42, release_year: 2021, rating: 8.4 },
        { id: 2, title: "Kitchen Wars", genre: "Reality", minutes: 55, release_year: 2019, rating: 6.9 },
        { id: 3, title: "Static Hours", genre: "Drama", minutes: 48, release_year: 2022, rating: 7.8 },
        { id: 4, title: "Loop City", genre: "Sci-Fi", minutes: 38, release_year: 2023, rating: 8.1 },
        { id: 5, title: "The Long Table", genre: "Comedy", minutes: 30, release_year: 2020, rating: 7.2 },
      ],
      WatchHistory: [
        { id: 1, user_id: 1, show_id: 1, watched_minutes: 42, device: "TV" },
        { id: 2, user_id: 1, show_id: 3, watched_minutes: 20, device: "Mobile" },
        { id: 3, user_id: 2, show_id: 2, watched_minutes: 55, device: "TV" },
        { id: 4, user_id: 3, show_id: 1, watched_minutes: 10, device: "Tablet" },
        { id: 5, user_id: 3, show_id: 3, watched_minutes: 48, device: "TV" },
        { id: 6, user_id: 4, show_id: 4, watched_minutes: 38, device: "Mobile" },
        { id: 7, user_id: 5, show_id: 5, watched_minutes: 30, device: "TV" },
        { id: 8, user_id: 2, show_id: 4, watched_minutes: 15, device: "Mobile" },
      ],
    },
  },

  saas: {
    label: "SaaS Billing",
    description: "Accounts, Invoices, Payments — finance-report style joins",
    data: {
      Accounts: [
        { id: 1, company: "Acme Co", tier: "enterprise", industry: "Manufacturing", seats: 250, created_at: "2022-03-01" },
        { id: 2, company: "Bramble Inc", tier: "starter", industry: "Retail", seats: 8, created_at: "2023-01-19" },
        { id: 3, company: "Circuit LLC", tier: "growth", industry: "Software", seats: 42, created_at: "2022-11-05" },
        { id: 4, company: "Delta Freight", tier: "growth", industry: "Logistics", seats: 30, created_at: "2023-04-17" },
        { id: 5, company: "Everline Media", tier: "starter", industry: "Media", seats: 5, created_at: "2023-08-02" },
      ],
      Invoices: [
        { id: 1, account_id: 1, amount: 4200, status: "paid", issued_date: "2024-01-01" },
        { id: 2, account_id: 2, amount: 99, status: "paid", issued_date: "2024-01-01" },
        { id: 3, account_id: 1, amount: 4200, status: "overdue", issued_date: "2024-02-01" },
        { id: 4, account_id: 3, amount: 850, status: "paid", issued_date: "2024-02-01" },
        { id: 5, account_id: 4, amount: 620, status: "paid", issued_date: "2024-02-01" },
        { id: 6, account_id: 5, amount: 99, status: "overdue", issued_date: "2024-02-01" },
        { id: 7, account_id: 3, amount: 850, status: "paid", issued_date: "2024-03-01" },
        { id: 8, account_id: 1, amount: 4200, status: "paid", issued_date: "2024-03-01" },
      ],
      Payments: [
        { id: 1, invoice_id: 1, amount: 4200, method: "card", paid_date: "2024-01-03" },
        { id: 2, invoice_id: 2, amount: 99, method: "ach", paid_date: "2024-01-04" },
        { id: 3, invoice_id: 4, amount: 850, method: "card", paid_date: "2024-02-05" },
        { id: 4, invoice_id: 5, amount: 620, method: "ach", paid_date: "2024-02-06" },
        { id: 5, invoice_id: 7, amount: 850, method: "card", paid_date: "2024-03-04" },
        { id: 6, invoice_id: 8, amount: 4200, method: "wire", paid_date: "2024-03-05" },
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
        const lowerCol = col.toLowerCase();
        if (lowerCol === "id") {
          row[col] = i + 1;
        } else if (lowerCol.endsWith("_id")) {
          // Reference another (guessed) table by pluralizing the FK prefix.
          // Comparisons are case-insensitive so PascalCase/UPPER_ID naming
          // (e.g. "Lead_Employee_ID") is still recognized as a key column
          // instead of falling through to the generic numeric-noise branch
          // below, which would corrupt it into random decimals.
          const refTableGuess = tableNames.find(
            (t) => t.toLowerCase() === lowerCol.replace(/_id$/, "") + "s"
          );
          if (refTableGuess === tbl) {
            // The guess resolved to THIS table (e.g. "Project_ID" on the
            // "Projects" table) — that's the table's own primary key, not a
            // foreign key pointing elsewhere, so it must stay unique and
            // sequential rather than a randomly repeated reference.
            row[col] = i + 1;
          } else {
            const refCount = refTableGuess ? idCounts[refTableGuess] : n;
            row[col] = 1 + Math.floor(rand() * Math.max(1, refCount));
          }
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