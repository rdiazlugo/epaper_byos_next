import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DB } from "./db.d";

// Ensure DATABASE_URL is available
if (!process.env.DATABASE_URL) {
	console.warn("DATABASE_URL is not set. Database connection may fail.");
}

// Create a new Kysely instance with Postgres dialect
export const db = new Kysely<DB>({
	dialect: new PostgresDialect({
		pool: new Pool({
			connectionString: process.env.DATABASE_URL,
			ssl: process.env.DATABASE_URL?.includes("sslmode=disable")
				? false
				: process.env.NODE_ENV === "production"
					? { rejectUnauthorized: false }
					: false,
			// Fail fast when the DB is unreachable so requests surface a clear
			// error instead of hanging until the reverse proxy returns a 504.
			connectionTimeoutMillis: 5000,
			query_timeout: 10000,
			statement_timeout: 10000,
		}),
	}),
});
