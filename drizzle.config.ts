import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL;
if (!url) throw new Error("Thiếu DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/*/*.schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
