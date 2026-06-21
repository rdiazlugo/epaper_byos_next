import { createHash } from "crypto";
import postgres from "postgres";
import { SQL_STATEMENTS } from "./sql-statements";

/**
 * Boot-time migration runner. Applies every pending migration in order and
 * records it in the `schema_migrations` ledger, using the same checksum
 * scheme as the in-app initializer (`app/actions/execute-sql.ts`) so the two
 * paths stay interchangeable. Unlike the server action this has no auth gate
 * — it is only callable from the Next.js boot hook, never from a request.
 *
 * Safe to run on every boot: migrations already in the ledger are skipped,
 * and a checksum mismatch is a hard error (the app and DB have diverged).
 */

const SCHEMA_MIGRATIONS_MIGRATION = "0012_create_schema_migrations";

function checksumSql(sql: string): string {
	return createHash("sha256").update(sql).digest("hex");
}

// Mirror the URL handling in execute-sql.ts so both paths connect identically.
function transformPostgresUrl(url: string): string {
	const parsedUrl = new URL(url);
	const username = parsedUrl.username;
	const password = parsedUrl.password;
	return `postgresql://${username}:${password}@${parsedUrl.host}${parsedUrl.pathname}${parsedUrl.search}`;
}

export async function runMigrations(): Promise<{ applied: string[] }> {
	const postgresUrl = process.env.DATABASE_URL;
	if (!postgresUrl) {
		throw new Error("DATABASE_URL is not defined");
	}

	const connectionString = transformPostgresUrl(postgresUrl);
	const sql = postgres(connectionString, {
		ssl: connectionString.includes("sslmode=disable") ? false : "require",
		onnotice: () => {},
	});

	const applied: string[] = [];

	try {
		// Ensure the ledger table exists before we can read or write it.
		const ledger = SQL_STATEMENTS[SCHEMA_MIGRATIONS_MIGRATION];
		const ledgerChecksum = checksumSql(ledger.sql);
		await sql.unsafe(ledger.sql);

		const existing = await sql<{ name: string; checksum: string }[]>`
			SELECT name, checksum FROM schema_migrations
		`;
		const appliedMap = new Map(existing.map((r) => [r.name, r.checksum]));

		if (!appliedMap.has(SCHEMA_MIGRATIONS_MIGRATION)) {
			await sql`
				INSERT INTO schema_migrations (name, checksum)
				VALUES (${SCHEMA_MIGRATIONS_MIGRATION}, ${ledgerChecksum})
				ON CONFLICT (name) DO NOTHING
			`;
			appliedMap.set(SCHEMA_MIGRATIONS_MIGRATION, ledgerChecksum);
			applied.push(SCHEMA_MIGRATIONS_MIGRATION);
		}

		// SQL_STATEMENTS is generated from migration files sorted by name, so
		// iteration order is the migration order.
		for (const [key, statement] of Object.entries(SQL_STATEMENTS)) {
			if (key === "validate_schema" || key === SCHEMA_MIGRATIONS_MIGRATION) {
				continue;
			}

			const checksum = checksumSql(statement.sql);
			const appliedChecksum = appliedMap.get(key);

			if (appliedChecksum) {
				if (appliedChecksum !== checksum) {
					throw new Error(
						`Migration ${key} was already applied with a different checksum`,
					);
				}
				continue;
			}

			await sql.begin(async (trx) => {
				await trx.unsafe(statement.sql);
				await trx`
					INSERT INTO schema_migrations (name, checksum)
					VALUES (${key}, ${checksum})
				`;
			});
			applied.push(key);
		}

		return { applied };
	} finally {
		await sql.end();
	}
}
