import type { TableData } from "@/types";

// ── Sample datasets ─────────────────────────────────────────────
// Each entry gives visitors a working demo in one click instead of
// starting from a blank schema editor.

export const SAMPLE_DATASETS: Record<string, { label: string; description: string; data: TableData; query: string }> = {
  ecommerce: {
    label: "E-commerce",
    description: "Products, Customers, Orders — the classic join demo",
    query: `SELECT
  o.id AS order_id,
  c.name AS customer,
  p.name AS product,
  o.quantity,
  p.price,
  (o.quantity * p.price) AS total_amount,
  o.status
FROM Orders o
JOIN Customers c ON o.customer_id = c.id
JOIN Products p ON o.product_id = p.id
WHERE o.quantity > 0
ORDER BY o.id;`,
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

  salesPipeline: {
    label: "Sales Pipeline",
    description: "Orders, Customers, Products, Categories, Employees, Addresses — a deep 6-table join demo",
    query: `SELECT
  o.id AS order_id,
  c.name AS customer,
  c.email AS customer_email,
  p.name AS product,
  cat.name AS category,
  o.quantity,
  p.price,
  (o.quantity * p.price) AS total_amount,
  e.name AS sales_rep,
  a.city AS shipping_city
FROM Orders o
JOIN Customers c ON o.customer_id = c.id
JOIN Products p ON o.product_id = p.id
JOIN Categories cat ON p.category_id = cat.id
JOIN Employees e ON o.sales_rep_id = e.id
LEFT JOIN Addresses a ON o.address_id = a.id
WHERE o.quantity > 0
ORDER BY o.id;`,
    data: {
      Categories: [
        { id: 1, name: "Electronics", description: "Computers, laptops, and gadgets" },
        { id: 2, name: "Peripherals", description: "Keyboards, mice, hubs, and accessories" },
        { id: 3, name: "Audio", description: "Headsets, speakers, and microphones" },
        { id: 4, name: "Office", description: "Desk and workspace equipment" },
        { id: 5, name: "Software", description: "Licenses and subscriptions" },
      ],
      Products: [
        { id: 1, name: "Laptop Pro 14", price: 1200, category_id: 1, brand: "Nova", stock: 34, rating: 4.5 },
        { id: 2, name: "Wireless Mouse", price: 25, category_id: 2, brand: "Clickr", stock: 210, rating: 4.2 },
        { id: 3, name: "4K Monitor", price: 300, category_id: 1, brand: "Visio", stock: 58, rating: 4.6 },
        { id: 4, name: "Mechanical Keyboard", price: 75, category_id: 2, brand: "Clickr", stock: 140, rating: 4.3 },
        { id: 5, name: "HD Webcam", price: 60, category_id: 2, brand: "Focalis", stock: 95, rating: 3.9 },
        { id: 6, name: "Noise-Cancel Headset", price: 90, category_id: 3, brand: "SonicWave", stock: 76, rating: 4.4 },
        { id: 7, name: "LED Desk Lamp", price: 35, category_id: 4, brand: "Lumen", stock: 120, rating: 4.1 },
        { id: 8, name: "Project Mgmt License", price: 150, category_id: 5, brand: "Flowly", stock: 500, rating: 4.7 },
        { id: 9, name: "USB-C Hub", price: 20, category_id: 2, brand: "Clickr", stock: 260, rating: 4.0 },
      ],
      Customers: [
        { id: 1, name: "Alice Turner", email: "alice.turner@example.com", country: "US", city: "Austin", signup_date: "2023-01-14", loyalty_points: 420 },
        { id: 2, name: "Bob Whitfield", email: "bob.whitfield@example.com", country: "UK", city: "Leeds", signup_date: "2023-03-02", loyalty_points: 150 },
        { id: 3, name: "Carol Nguyen", email: "carol.nguyen@example.com", country: "US", city: "Denver", signup_date: "2023-05-19", loyalty_points: 980 },
        { id: 4, name: "David Krause", email: "david.krause@example.com", country: "DE", city: "Berlin", signup_date: "2023-06-27", loyalty_points: 60 },
        { id: 5, name: "Elena Ruiz", email: "elena.ruiz@example.com", country: "ES", city: "Madrid", signup_date: "2023-08-11", loyalty_points: 310 },
        { id: 6, name: "Farid Haidari", email: "farid.haidari@example.com", country: "US", city: "Chicago", signup_date: "2024-01-05", loyalty_points: 25 },
        { id: 7, name: "Grace Lin", email: "grace.lin@example.com", country: "SG", city: "Singapore", signup_date: "2024-02-18", loyalty_points: 540 },
        { id: 8, name: "Hassan Malik", email: "hassan.malik@example.com", country: "AE", city: "Dubai", signup_date: "2024-03-22", loyalty_points: 190 },
        { id: 9, name: "Ines Costa", email: "ines.costa@example.com", country: "PT", city: "Lisbon", signup_date: "2024-04-09", loyalty_points: 75 },
      ],
      Employees: [
        { id: 1, name: "Maria Chen", department: "Sales", region: "West", hire_date: "2021-04-12" },
        { id: 2, name: "James Okafor", department: "Sales", region: "East", hire_date: "2020-09-01" },
        { id: 3, name: "Sofia Rossi", department: "Sales", region: "Europe", hire_date: "2022-01-20" },
        { id: 4, name: "Liam O'Brien", department: "Sales", region: "APAC", hire_date: "2022-07-15" },
        { id: 5, name: "Aisha Bello", department: "Sales", region: "Central", hire_date: "2023-02-28" },
      ],
      Addresses: [
        { id: 1, city: "Austin", state: "TX", zip_code: "73301", country: "US" },
        { id: 2, city: "Leeds", state: "West Yorkshire", zip_code: "LS1", country: "UK" },
        { id: 3, city: "Denver", state: "CO", zip_code: "80014", country: "US" },
        { id: 4, city: "Berlin", state: "BE", zip_code: "10115", country: "DE" },
        { id: 5, city: "Madrid", state: "MD", zip_code: "28001", country: "ES" },
        { id: 6, city: "Chicago", state: "IL", zip_code: "60601", country: "US" },
        { id: 7, city: "Singapore", state: "SG", zip_code: "018956", country: "SG" },
        { id: 8, city: "Dubai", state: "DU", zip_code: "00000", country: "AE" },
        { id: 9, city: "Lisbon", state: "LI", zip_code: "1000", country: "PT" },
      ],
      Orders: [
        { id: 101, customer_id: 1, product_id: 1, quantity: 1, sales_rep_id: 1, address_id: 1, status: "delivered", order_date: "2024-01-10" },
        { id: 102, customer_id: 2, product_id: 2, quantity: 2, sales_rep_id: 2, address_id: 2, status: "delivered", order_date: "2024-01-12" },
        { id: 103, customer_id: 1, product_id: 3, quantity: 1, sales_rep_id: 1, address_id: 1, status: "shipped", order_date: "2024-02-03" },
        { id: 104, customer_id: 3, product_id: 4, quantity: 3, sales_rep_id: 1, address_id: 3, status: "delivered", order_date: "2024-02-15" },
        { id: 105, customer_id: 4, product_id: 5, quantity: 2, sales_rep_id: 3, address_id: 4, status: "delivered", order_date: "2024-03-01" },
        { id: 106, customer_id: 5, product_id: 6, quantity: 1, sales_rep_id: 3, address_id: 5, status: "shipped", order_date: "2024-03-09" },
        { id: 107, customer_id: 6, product_id: 7, quantity: 4, sales_rep_id: 2, address_id: 6, status: "delivered", order_date: "2024-03-18" },
        { id: 108, customer_id: 7, product_id: 8, quantity: 2, sales_rep_id: 4, address_id: 7, status: "pending", order_date: "2024-03-25" },
        { id: 109, customer_id: 8, product_id: 9, quantity: 5, sales_rep_id: 5, address_id: 8, status: "delivered", order_date: "2024-04-02" },
      ],
    },
  },

  streaming: {
    label: "Streaming Service",
    description: "Users, Shows, WatchHistory — session-analytics style joins",
    query: `SELECT
  w.id AS session_id,
  u.name AS viewer,
  u.plan,
  s.title AS show,
  s.genre,
  w.watched_minutes,
  s.minutes AS episode_length,
  w.device
FROM WatchHistory w
JOIN Users u ON w.user_id = u.id
JOIN Shows s ON w.show_id = s.id
WHERE w.watched_minutes > 0
ORDER BY w.id;`,
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
    query: `SELECT
  i.id AS invoice_id,
  a.company,
  a.tier,
  i.amount AS invoiced_amount,
  i.status AS invoice_status,
  p.amount AS paid_amount,
  p.method,
  p.paid_date
FROM Invoices i
JOIN Accounts a ON i.account_id = a.id
LEFT JOIN Payments p ON p.invoice_id = i.id
WHERE i.amount > 0
ORDER BY i.id;`,
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