export const prerender = false;

import type { APIRoute } from "astro";
import { OptOutError, confirmOptOut } from "@/lib/packs/opt-out";

function json(body: unknown, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * POST /api/opt-out/confirm  { token }
 * Confirms an opt-out from the DM link. POST-only so link previews (which
 * fetch with GET) can't confirm on the account owner's behalf.
 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const token = typeof body?.token === "string" ? body.token : "";
		const { handle, removed } = await confirmOptOut(token);
		return json({ status: "confirmed", handle, removed }, 200);
	} catch (err) {
		if (err instanceof OptOutError) return json({ error: err.message }, err.status);
		console.error("Opt-out confirm failed:", err);
		return json({ error: "Something went wrong. Please try again later." }, 500);
	}
};
