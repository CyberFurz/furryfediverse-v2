export const prerender = false;

import type { APIRoute } from "astro";
import { PROVIDERS, type PlatformKey } from "../../../../lib/social/providers";
import generator from "megalodon";
import crypto from "crypto";

const SITE_URL = process.env.SITE_URL || "http://localhost:4321";
const STATE_TTL_MS = 10 * 60 * 1000;
const CLIENT_NAME = "FurryFediverse";

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const user = locals.user;

  try {
    const body = await request.json();
    const { platform, instanceDomain, isPrimaryNsfw, flow } = body;
    const authFlow = flow === "register" ? "register" : flow === "login" ? "login" : "link";

    if (authFlow === "link" && !user) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!platform || !instanceDomain) {
      return new Response(
        JSON.stringify({ error: "Platform and instance domain are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const provider = PROVIDERS[platform as PlatformKey];
    if (!provider) {
      return new Response(
        JSON.stringify({ error: `Unsupported platform: ${platform}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const cleanDomain = instanceDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const baseUrl = `https://${cleanDomain}`;
    const redirectUri = `${SITE_URL}/api/auth/link/callback`;

    const client = generator(provider.megadonType, baseUrl);
    const appData = await client.registerApp(CLIENT_NAME, {
      scopes: [provider.readScope],
      redirect_uris: redirectUri,
    });

    const state = crypto.randomBytes(32).toString("hex");

    const statePayload = JSON.stringify({
      platform,
      instanceDomain: cleanDomain,
      userId: user?.id ?? null,
      isPrimaryNsfw: Boolean(isPrimaryNsfw),
      flow: authFlow,
      clientId: appData.client_id,
      clientSecret: appData.client_secret,
      createdAt: Date.now(),
    });

    const stateToken = Buffer.from(statePayload).toString("base64url");

    cookies.set("link_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: STATE_TTL_MS / 1000,
      path: "/",
    });

    cookies.set("link_state_data", stateToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: STATE_TTL_MS / 1000,
      path: "/",
    });

    const authUrl = `${baseUrl}/oauth/authorize?` + new URLSearchParams({
      client_id: appData.client_id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: provider.readScope,
      state,
    }).toString();

    return new Response(
      JSON.stringify({ success: true, authUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error starting link flow:", error);

    const err = error as {
      message?: string;
      response?: {
        data?: {
          error?: string;
          error_description?: string;
          message?: string;
        };
        status?: number;
      };
    };

    const detail =
      err.response?.data?.error_description ||
      err.response?.data?.message ||
      err.response?.data?.error ||
      err.message ||
      "unknown_error";

    return new Response(
      JSON.stringify({
        error: "Failed to register app with instance",
        detail,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
