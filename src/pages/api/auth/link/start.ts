export const prerender = false;

import type { APIRoute } from "astro";
import { PROVIDERS, type PlatformKey } from "../../../../lib/social/providers";
import generator from "megalodon";
import { createAuthFlowState } from "../../../../lib/auth-flow-state";
import { prisma } from "../../../../lib/prisma";

const SITE_URL = process.env.SITE_URL || "http://localhost:4321";
const CLIENT_NAME = "FurryFediverse";

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const user = locals.user;

  try {
    const body = await request.json();
    let { platform, instanceDomain } = body;
    const { isPrimaryNsfw, flow, linkedProfileId, returnTo } = body;
    const authFlow =
      flow === "register" ? "register"
        : flow === "login" ? "login"
        : flow === "reauthorize" ? "reauthorize"
        : "link";

    // Re-authorize an existing linked account to grant updated scopes.
    // Platform/instance come from the stored profile, never the client.
    let reauthProfileId: string | null = null;
    if (authFlow === "reauthorize") {
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      const profile = typeof linkedProfileId === "string"
        ? await prisma.linkedProfile.findFirst({
            where: { id: linkedProfileId, userId: user.id },
            select: { id: true, platform: true, instanceDomain: true },
          })
        : null;
      if (!profile) {
        return new Response(
          JSON.stringify({ error: "Linked account not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      platform = profile.platform;
      instanceDomain = profile.instanceDomain;
      reauthProfileId = profile.id;
    }

    // Only allow same-site relative return paths.
    const safeReturnTo =
      typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : null;

    if ((authFlow === "link" || authFlow === "reauthorize") && !user) {
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

    const client = generator(provider.megalodonType, baseUrl);
    const appData = await client.registerApp(CLIENT_NAME, {
      scopes: [provider.readScope],
      redirect_uris: redirectUri,
    });

    const state = await createAuthFlowState("link", {
      platform,
      instanceDomain: cleanDomain,
      userId: user?.id ?? null,
      isPrimaryNsfw: Boolean(isPrimaryNsfw),
      flow: authFlow,
      linkedProfileId: reauthProfileId,
      returnTo: safeReturnTo,
      clientId: appData.client_id,
      clientSecret: appData.client_secret,
    }, 10 * 60);

    cookies.delete("link_state_data", { path: "/" });
    cookies.set("link_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 10 * 60,
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
