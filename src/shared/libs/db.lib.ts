import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env.lib";

const globalForDatabase = globalThis as unknown as { hcmuePostgres?: postgres.Sql };

function createClient() {
  return postgres(env.DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL, {
    max: env.DEFEAT_POSTGRES_POOL_MAX,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    onnotice: () => {},
    connection: {
      application_name: "hcmue-portal",
      TimeZone: "UTC",
      statement_timeout: env.DEFEAT_POSTGRES_STATEMENT_TIMEOUT_MS,
      idle_in_transaction_session_timeout: 30_000,
    },
  });
}

const client = globalForDatabase.hcmuePostgres ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDatabase.hcmuePostgres = client;

export const db = drizzle({ client, casing: "snake_case", logger: env.DEFEAT_DATABASE_LOG_QUERIES });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
