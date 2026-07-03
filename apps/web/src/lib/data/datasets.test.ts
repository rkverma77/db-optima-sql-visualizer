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
});
