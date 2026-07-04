import { z } from "zod";

export const OptimizationResultSchema = z.object({
  issues: z.array(
    z.object({
      severity: z.enum(["high", "medium", "low"]),
      description: z.string(),
    })
  ),
  optimized_sql: z.string(),
  explanation: z.string(),
  index_statements: z.array(z.string()),
  scan_type_before: z.string(),
  scan_type_after: z.string(),
});

export type OptimizationResult = z.infer<typeof OptimizationResultSchema>;

export const IndexSuggestionsSchema = z.array(z.string().min(1));

export type IndexSuggestions = z.infer<typeof IndexSuggestionsSchema>;