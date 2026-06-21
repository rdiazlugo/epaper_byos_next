/**
 * Next.js boot hook. Runs ONCE per server process — not per request — so
 * we use it to seed the in-DB recipe catalog from the in-process React
 * recipe registry. Built-in recipes are defined in code, but the DB
 * still needs rows for foreign keys (mixup_slots, etc.) and for the
 * mixup picker UI.
 *
 * The runtime resolves React recipes from the registry directly, so this
 * sync is a one-shot bootstrap, never a request-time mirror.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	if (process.env.NEXT_PHASE === "phase-production-build") return;

	// Apply any pending migrations once the DB is reachable, so a fresh
	// connection self-heals into a ready schema without the manual setup UI.
	if (process.env.DATABASE_URL && process.env.SKIP_DB_MIGRATIONS !== "true") {
		try {
			const { runMigrations } = await import("./lib/database/run-migrations");
			const { applied } = await runMigrations();
			if (applied.length > 0) {
				console.log(
					`[instrumentation] Applied ${applied.length} migration(s): ${applied.join(", ")}`,
				);
			}
		} catch (error) {
			console.error("[instrumentation] Migration run failed at boot:", error);
		}
	}

	if (process.env.SKIP_RECIPE_SYNC === "true") return;

	try {
		const { syncReactRecipes } = await import(
			"./lib/recipes/sync-react-recipes"
		);
		await syncReactRecipes();
	} catch (error) {
		console.warn("[instrumentation] Recipe sync failed at boot:", error);
	}
}
