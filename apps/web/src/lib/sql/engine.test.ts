import { describe, it, expect } from "vitest";
import { parsePipeline, prefixRows, nestedLoopJoin, deriveIndexSuggestions } from "./engine";

describe("parsePipeline", () => {
  it("parses a simple FROM + WHERE", () => {
    const steps = parsePipeline("SELECT * FROM Orders WHERE quantity > 1");
    expect(steps.map((s) => s.type)).toEqual(["FROM", "WHERE", "SELECT"]);
    expect(steps[0].table).toBe("Orders");
  });

  it("parses FROM + JOIN with alias and ON condition", () => {
    const steps = parsePipeline(
      "SELECT * FROM Orders o JOIN Customers c ON o.customer_id = c.id"
    );
    expect(steps.map((s) => s.type)).toEqual(["FROM", "JOIN", "SELECT"]);
    expect(steps[0]).toMatchObject({ table: "Orders", alias: "o" });
    expect(steps[1]).toMatchObject({ table: "Customers", alias: "c" });
    expect(steps[1].leftKey).toContain("customer_id");
    expect(steps[1].rightKey).toContain("id");
  });

  it("parses multiple JOINs (LEFT/INNER) in one query", () => {
    const steps = parsePipeline(
      `SELECT * FROM Orders o
       LEFT JOIN Customers c ON o.customer_id = c.id
       INNER JOIN Products p ON o.product_id = p.id
       WHERE o.quantity > 0`
    );
    const types = steps.map((s) => s.type);
    expect(types.filter((t) => t === "JOIN").length).toBe(2);
    expect(types).toContain("WHERE");
    expect(types[types.length - 1]).toBe("SELECT");
  });

  it("returns an empty pipeline when there is no FROM clause", () => {
    expect(parsePipeline("SELECT 1")).toEqual([]);
  });
});

describe("prefixRows", () => {
  it("prefixes every column with alias.", () => {
    const rows = prefixRows([{ id: 1, name: "Alice" }], "c");
    expect(rows).toEqual([{ "c.id": 1, "c.name": "Alice" }]);
  });
});

describe("nestedLoopJoin", () => {
  const customers = [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ];
  const orders = [
    { id: 101, customer_id: 1 },
    { id: 102, customer_id: 2 },
    { id: 103, customer_id: 1 },
    { id: 104, customer_id: 99 }, // no match
  ];

  it("only yields matching row pairs", () => {
    const matches = [...nestedLoopJoin(orders, customers, "customer_id", "id")];
    expect(matches).toHaveLength(3);
    expect(matches.every((m) => m.merged.customer_id === m.merged.id)).toBe(true);
  });

  it("falls back to the first column when the given key is missing on a row", () => {
    // nestedLoopJoin falls back to the row's first column when leftKey/rightKey
    // aren't present on a row — this keeps the visualizer resilient when the
    // regex-based parser can't resolve a column name. Here rightKey doesn't
    // exist on `customers`, so it falls back to `id` (first column), which is
    // exactly what we'd want for an unqualified join column.
    const matches = [...nestedLoopJoin(orders, customers, "customer_id", "does_not_exist")];
    expect(matches).toHaveLength(3);
  });

  it("handles an unqualified ON clause against alias-prefixed rows end to end", () => {
    // Reproduces the real failure mode: `JOIN customers c ON customer_id = id`
    // (no alias prefix) means parsePipeline yields leftKey/rightKey without
    // the "alias." prefix that prefixRows() adds to every row, so neither key
    // literally exists on the prefixed rows. Without the fallback this always
    // produced zero matches even though the same query, run for real via
    // sql.js, would return actual rows.
    const prefixedOrders = prefixRows(orders, "o");
    const prefixedCustomers = prefixRows(customers, "c");
    const matches = [...nestedLoopJoin(prefixedOrders, prefixedCustomers, "customer_id", "id")];
    expect(matches).toHaveLength(3);
  });
});

describe("deriveIndexSuggestions", () => {
  it("builds CREATE INDEX statements from JOIN keys", () => {
    const steps = parsePipeline(
      "SELECT * FROM Orders o JOIN Customers c ON o.customer_id = c.id"
    );
    const ddl = deriveIndexSuggestions(steps);
    expect(ddl).toHaveLength(1);
    expect(ddl[0]).toMatch(/CREATE INDEX/i);
    expect(ddl[0]).toContain("Customers");
  });

  it("produces no DDL when there are no JOINs", () => {
    const steps = parsePipeline("SELECT * FROM Orders WHERE quantity > 1");
    expect(deriveIndexSuggestions(steps)).toEqual([]);
  });
});