import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/** Saved queries — lets users bookmark and reload their work. */
export const savedQueries = pgTable("saved_queries", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  sql:         text("sql").notNull(),
  schemaJson:  jsonb("schema_json"),               // TableData snapshot
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
});

/** Optimisation history — AI results stored for replay. */
export const optimizationHistory = pgTable("optimization_history", {
  id:          serial("id").primaryKey(),
  originalSql: text("original_sql").notNull(),
  result:      jsonb("result").notNull(),           // OptimizationResult
  createdAt:   timestamp("created_at").defaultNow(),
});
