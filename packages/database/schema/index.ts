import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Saved queries — lets users bookmark and reload their work.
 *
 * `id` is an opaque random string (see generateSavedQueryId in
 * apps/web/src/app/api/queries/route.ts) rather than a sequential integer.
 * Share links are public-by-design (anyone with the link can load the
 * query), so the id must not be guessable/enumerable — a sequential
 * serial id would let anyone walk `/q/1`, `/q/2`, ... and read every
 * saved query on the server.
 */
export const savedQueries = pgTable("saved_queries", {
  id:          text("id").primaryKey(),
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