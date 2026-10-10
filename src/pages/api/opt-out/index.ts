export const prerender = false;

import type { APIRoute } from "astro";
import { OptOutError, requestOptOut } from "@/lib/packs/opt-out";

function json(body: unknown, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function clientIp(request: Request, clientAddress: () => string): string | null {
	const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	if (fwd) return fwd;
	try {
		return clientAddress();
	} catch {
		return null;
	}
}

/**
 * POST /api/opt-out  { handle: "@name@instance" }
 * Public (no account needed). Sends a confirmation DM to the handle.
 */
export const POST: APIRoute = async (ctx) => {
	try {
		const body = await ctx.request.json().catch(() => ({}));
		const handle = typeof body?.handle === "string" ? body.handle : "";
		const result = await requestOptOut(handle, clientIp(ctx.request, () => ctx.clientAddress));
		return json(
			result.alreadyOptedOut
				? { status: "confirmed", message: "This account is already opted out of starter packs." }
				: { status: "sent", message: "We sent a direct message to this account with a confirmation link. It expires in 24 hours." },
			200,
		);
	} catch (err) {
		if (err instanceof OptOutError) return json({ error: err.message }, err.status);
		console.error("Opt-out request failed:", err);
		return json({ error: "Something went wrong. Please try again later." }, 500);
	}
};
