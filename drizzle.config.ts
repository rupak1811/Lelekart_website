import { defineConfig } from "drizzle-kit";

const DATABASE_URL = "postgresql://neondb_owner:npg_K8U1fgacsxJM@ep-odd-frog-a1ymeega-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
});
