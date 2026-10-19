import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env.lib";

const client = postgres(env.DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL);

export const db = drizzle({ client, casing: "snake_case" });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
