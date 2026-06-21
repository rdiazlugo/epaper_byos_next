import { connection } from "next/server";
import { Suspense } from "react";
import { getDbStatus } from "@/lib/database/utils";
import SignInForm from "./sign-in-form";

// Next.js Cache Components require that uncached data fetches live inside a
// <Suspense> boundary, so the DB probe is isolated to a child component.
async function SignInWithDbCheck() {
	// getDbStatus reads process.env/DB at runtime; without connection() Next
	// would prerender this at build time (when DATABASE_URL is absent) and
	// bake a stale "database not reachable" state into the static shell.
	await connection();
	const db = await getDbStatus();
	return <SignInForm dbReady={db.ready} dbError={db.error} />;
}

export default function SignInPage() {
	return (
		<Suspense fallback={<SignInForm dbReady={true} />}>
			<SignInWithDbCheck />
		</Suspense>
	);
}
