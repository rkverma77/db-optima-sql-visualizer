import type { Config } from "drizzle-kit";

export default {
  schema: "./packages/database/schema/index.ts",
  out:    "./packages/database/migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
