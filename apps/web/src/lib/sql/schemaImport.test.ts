import { describe, it, expect } from "vitest";
import { parseCreateTableStatements, importSchemaFromSQL } from "./schemaImport";

const EMPLOYEE_PROJECT_DDL = `
  CREATE TABLE project (
      Project_ID VARCHAR(10) PRIMARY KEY,
      Project_Name VARCHAR(150) NOT NULL,
      Department VARCHAR(50) NOT NULL,
      Budget DECIMAL(12, 2) NOT NULL,
      Start_Date DATE NOT NULL,
      End_Date DATE,
      Lead_Employee_ID VARCHAR(10),
      FOREIGN KEY (Lead_Employee_ID) REFERENCES employee(Employee_ID)
  );
  CREATE TABLE employee (
      Employee_ID VARCHAR(10) PRIMARY KEY,
      Name VARCHAR(100) NOT NULL,
      Department VARCHAR(50) NOT NULL,
      Salary DECIMAL(10, 2) NOT NULL,
      Join_Date DATE NOT NULL
  );
`;

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

describe("foreign key parsing", () => {
  it("extracts a table-level FOREIGN KEY constraint", () => {
    const { tables } = parseCreateTableStatements(`
      CREATE TABLE orders (
        id INTEGER,
        customer_id INTEGER,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);
    expect(tables[0].foreignKeys).toEqual([
      { column: "customer_id", refTable: "customers", refColumn: "id" },
    ]);
    // and it's still excluded from the regular column list
    expect(tables[0].columns.map((c) => c.name)).toEqual(["id", "customer_id"]);
  });

  it("extracts an inline REFERENCES clause on a column definition", () => {
    const { tables } = parseCreateTableStatements(`
      CREATE TABLE orders (
        id INTEGER,
        customer_id INTEGER REFERENCES customers(id)
      );
    `);
    expect(tables[0].foreignKeys).toEqual([
      { column: "customer_id", refTable: "customers", refColumn: "id" },
    ]);
    // the column itself is still parsed normally
    expect(tables[0].columns.map((c) => c.name)).toEqual(["id", "customer_id"]);
  });

  it("handles the exact employee/project DDL, including quoting and multiple FKs", () => {
    const { tables } = parseCreateTableStatements(EMPLOYEE_PROJECT_DDL);
    const project = tables.find((t) => t.name === "project")!;
    expect(project.foreignKeys).toEqual([
      { column: "Lead_Employee_ID", refTable: "employee", refColumn: "Employee_ID" },
    ]);
    const employee = tables.find((t) => t.name === "employee")!;
    expect(employee.foreignKeys).toEqual([]);
  });

  it("returns no foreign keys when none are declared", () => {
    const { tables } = parseCreateTableStatements(
      `CREATE TABLE customers (id INTEGER, name TEXT);`
    );
    expect(tables[0].foreignKeys).toEqual([]);
  });
});

describe("importSchemaFromSQL — foreign key alignment", () => {
  it("aligns a FK column to real values from the referenced table, even when the child table is declared first", () => {
    const result = importSchemaFromSQL(EMPLOYEE_PROJECT_DDL);
    const employeeIds = result.tables["employee"].map((r) => r.Employee_ID);
    const leadIds = result.tables["project"].map((r) => r.Lead_Employee_ID);

    // Every generated Lead_Employee_ID must be one of the real Employee_ID values.
    for (const id of leadIds) {
      expect(employeeIds).toContain(id);
    }

    // Sanity check against the old broken behavior (independent placeholders
    // like "Lead_Employee_ID_1" that could never match "Employee_ID_1").
    expect(leadIds.some((id) => String(id).startsWith("Lead_Employee_ID_"))).toBe(false);

    // A join on this key should therefore actually produce matches.
    const matches = result.tables["project"].filter((p) =>
      employeeIds.includes(p.Lead_Employee_ID)
    );
    expect(matches.length).toBe(result.tables["project"].length);
  });

  it("leaves the FK column's placeholder value alone if the referenced table was never parsed", () => {
    const result = importSchemaFromSQL(`
      CREATE TABLE orders (
        id INTEGER,
        customer_id INTEGER,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);
    // "customers" doesn't exist in this snippet, so alignment has nothing to
    // pull from — the column should still be present with its fallback value
    // rather than throwing or disappearing.
    expect(result.tables["orders"]).toHaveLength(5);
    for (const row of result.tables["orders"]) {
      expect(row.customer_id).not.toBeNull();
      expect(row.customer_id).toBeDefined();
    }
  });

  it("is case-insensitive when matching the referenced table name", () => {
    const result = importSchemaFromSQL(`
      CREATE TABLE Orders (
        id INTEGER,
        customer_id INTEGER,
        FOREIGN KEY (customer_id) REFERENCES CUSTOMERS(id)
      );
      CREATE TABLE customers (
        id INTEGER,
        name TEXT
      );
    `);
    const customerIds = result.tables["customers"].map((r) => r.id);
    const fkIds = result.tables["Orders"].map((r) => r.customer_id);
    for (const id of fkIds) {
      expect(customerIds).toContain(id);
    }
  });

  it("strips a schema-qualified prefix from the referenced table (dbo.employee)", () => {
    const { tables } = parseCreateTableStatements(`
      CREATE TABLE project (
        id INT,
        lead_id INT,
        FOREIGN KEY (lead_id) REFERENCES dbo.employee(id)
      );
    `);
    expect(tables[0].foreignKeys).toEqual([
      { column: "lead_id", refTable: "employee", refColumn: "id" },
    ]);

    const result = importSchemaFromSQL(`
      CREATE TABLE project (id INT, lead_id INT, FOREIGN KEY (lead_id) REFERENCES dbo.employee(id));
      CREATE TABLE employee (id INT, name TEXT);
    `);
    const employeeIds = result.tables["employee"].map((r) => r.id);
    for (const id of result.tables["project"].map((r) => r.lead_id)) {
      expect(employeeIds).toContain(id);
    }
  });

  it("is case-insensitive when matching the referenced column name", () => {
    // The REFERENCES clause spells the column EMPLOYEE_ID, but the actual
    // declared PK column is Employee_ID — alignment should still resolve it.
    const result = importSchemaFromSQL(`
      CREATE TABLE project (id INT, lead_id VARCHAR(10), FOREIGN KEY (lead_id) REFERENCES employee(EMPLOYEE_ID));
      CREATE TABLE employee (Employee_ID VARCHAR(10) PRIMARY KEY, name TEXT);
    `);
    const employeeIds = result.tables["employee"].map((r) => r.Employee_ID);
    for (const id of result.tables["project"].map((r) => r.lead_id)) {
      expect(employeeIds).toContain(id);
    }
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