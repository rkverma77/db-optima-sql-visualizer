import { describe, it, expect } from "vitest";
import { generateSyntheticData, SAMPLE_DATASETS } from "./datasets";

describe("generateSyntheticData", () => {
  const base = SAMPLE_DATASETS.ecommerce.data;

  it("scales the largest table up to roughly the target row count", () => {
    const scaled = generateSyntheticData(base, 1000);
    const rowCounts = Object.values(scaled).map((rows) => rows.length);
    expect(Math.max(...rowCounts)).toBeGreaterThanOrEqual(900);
  });

  it("preserves the column shape of the seed data", () => {
    const scaled = generateSyntheticData(base, 500);
    for (const tbl of Object.keys(base)) {
      const seedCols = Object.keys(base[tbl][0]).sort();
      const scaledCols = Object.keys(scaled[tbl][0]).sort();
      expect(scaledCols).toEqual(seedCols);
    }
  });

  it("keeps foreign-key-looking columns (_id) referencing valid ids so JOINs still match", () => {
    const scaled = generateSyntheticData(base, 300);
    const customerIds = new Set(scaled.Customers.map((r) => r.id));
    const orphaned = scaled.Orders.filter((o) => !customerIds.has(o.customer_id));
    // Some orphans are fine (real data has them too), but not literally all of them —
    // otherwise JOINs against synthetic data would never produce results.
    expect(orphaned.length).toBeLessThan(scaled.Orders.length);
  });

  it("is deterministic for a given target size", () => {
    const a = generateSyntheticData(base, 200);
    const b = generateSyntheticData(base, 200);
    expect(a).toEqual(b);
  });

  it("recognizes PascalCase/UPPER id and FK columns (Project_ID, Lead_Employee_ID), not just lowercase id/_id", () => {
    const pascalBase = {
      Employees: [
        { Employee_ID: 1, Name: "Alice" },
        { Employee_ID: 2, Name: "Bob" },
      ],
      Projects: [
        { Project_ID: 1, Lead_Employee_ID: 1 },
        { Project_ID: 2, Lead_Employee_ID: 2 },
      ],
    };
    const scaled = generateSyntheticData(pascalBase, 200);

    // The table's own PK must stay a unique, sequential integer — not get
    // corrupted into a random decimal by the generic numeric-noise branch.
    const projectIds = scaled.Projects.map((r) => r.Project_ID);
    expect(projectIds).toEqual(projectIds.map((_, i) => i + 1));

    // The FK column must reference real Employee_ID values.
    const employeeIds = new Set(scaled.Employees.map((r) => r.Employee_ID));
    for (const p of scaled.Projects) {
      expect(employeeIds.has(p.Lead_Employee_ID as number)).toBe(true);
    }
  });

  it("treats a table's own PK named <table>_id as sequential, not a self-referencing random FK", () => {
    // "Project_ID" on the "Projects" table pluralizes back to the table's
    // own name — this must resolve to the row's own sequential id, not a
    // guessed foreign key reference (which would produce random, repeated,
    // non-unique values for what's supposed to be a primary key).
    const base2 = { Projects: [{ Project_ID: 1, Name: "Alpha" }, { Project_ID: 2, Name: "Beta" }] };
    const scaled = generateSyntheticData(base2, 500);
    const ids = scaled.Projects.map((r) => r.Project_ID);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids).toEqual(ids.map((_, i) => i + 1)); // sequential
  });
});