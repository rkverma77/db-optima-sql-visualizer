import { describe, it, expect } from "vitest";
import { parseCreateTableStatements, importSchemaFromSQL } from "./schemaImport";

describe("parseCreateTableStatements", () => {
  it("parses a single simple table", () => {
    const { tables, errors } = parseCreateTableStatements(
      `CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, country TEXT);`
    );
    expect(errors).toEqual([]);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("customers");
    expect(tables[0].columns.map((c) => c.name)).toEqual(["id", "name", "country"]);
  });

  it("parses multiple CREATE TABLE statements", () => {
    const { tables, errors } = parseCreateTableStatements(`
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, quantity INTEGER);
    `);
    expect(errors).toEqual([]);
    expect(tables.map((t) => t.name)).toEqual(["customers", "orders"]);
  });

  it("handles IF NOT EXISTS and quoted identifiers", () => {
    const { tables, errors } = parseCreateTableStatements(
      `CREATE TABLE IF NOT EXISTS "Orders" ("id" INTEGER, "customer_id" INTEGER);`
    );
    expect(errors).toEqual([]);
    expect(tables[0].name).toBe("Orders");
    expect(tables[0].columns.map((c) => c.name)).toEqual(["id", "customer_id"]);
  });

  it("does not get confused by parens inside column types", () => {
    const { tables, errors } = parseCreateTableStatements(
      `CREATE TABLE products (id INTEGER, price DECIMAL(10,2), name VARCHAR(255));`
    );
    expect(errors).toEqual([]);
    expect(tables[0].columns.map((c) => c.name)).toEqual(["id", "price", "name"]);
    expect(tables[0].columns[1].type).toBe("DECIMAL(10,2)");
  });

  it("skips table-level constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE)", () => {
    const { tables, errors } = parseCreateTableStatements(`
      CREATE TABLE orders (
        id INTEGER,
        customer_id INTEGER,
        product_id INTEGER,
        PRIMARY KEY (id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        UNIQUE (customer_id, product_id)
      );
    `);
    expect(errors).toEqual([]);
    expect(tables[0].columns.map((c) => c.name)).toEqual(["id", "customer_id", "product_id"]);
  });

  it("ignores line and block comments", () => {
    const { tables, errors } = parseCreateTableStatements(`
      -- customer table
      CREATE TABLE customers (
        id INTEGER, /* primary key */
        name TEXT
      );
    `);
    expect(errors).toEqual([]);
    expect(tables[0].columns.map((c) => c.name)).toEqual(["id", "name"]);
  });

  it("reports an error and returns no tables when there's nothing to parse", () => {
    const { tables, errors } = parseCreateTableStatements("SELECT * FROM foo;");
    expect(tables).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("reports an error for a table with no parseable columns", () => {
    const { tables, errors } = parseCreateTableStatements(
      `CREATE TABLE empty_thing ();`
    );
    expect(tables).toEqual([]);
    expect(errors.some((e) => e.includes("empty_thing"))).toBe(true);
  });
});

describe("importSchemaFromSQL", () => {
  it("generates 5 sample rows per table with values for every column", () => {
    const result = importSchemaFromSQL(
      `CREATE TABLE customers (id INTEGER, name TEXT, country TEXT);`
    );
    expect(result.tableNames).toEqual(["customers"]);
    const rows = result.tables["customers"];
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(["id", "name", "country"]);
      expect(row.id).not.toBeNull();
      expect(row.name).not.toBeNull();
      expect(row.country).not.toBeNull();
    }
  });

  it("generates distinct sequential ids", () => {
    const result = importSchemaFromSQL(`CREATE TABLE t (id INTEGER, val TEXT);`);
    const ids = result.tables["t"].map((r) => r.id);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it("surfaces parser errors alongside any successfully parsed tables", () => {
    const result = importSchemaFromSQL(`
      CREATE TABLE good_table (id INTEGER, name TEXT);
      CREATE TABLE bad_table ();
    `);
    expect(result.tableNames).toEqual(["good_table"]);
    expect(result.errors.some((e) => e.includes("bad_table"))).toBe(true);
  });
});
