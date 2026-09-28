export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import {
  PROVIDERS,
  type PlatformKey,
  createMegalodonClient,
} from "../../../../lib/social/providers";
import { downloadAndCacheProfileEmoji, downloadAndCacheProfileImage } from "../../../../lib/image-cache";
import generator from "megalodon";
import { auth } from "../../../../lib/auth";
import { deriveFediversePassword } from "../../../../lib/fediverse-auth";
import { hashPassword } from "better-auth/crypto";
import { consumeAuthFlowState, createAuthFlowState } from "../../../../lib/auth-flow-state";

const SITE_URL = process.env.SITE_URL || "http://localhost:4321";
const CLIENT_NAME = "FurryFediverse";

interface RemoteCustomEmoji {
  shortcode?: string;
  url?: string;
  static_url?: string;
}

async function buildCustomEmojiMap(
  platform: string,
  instanceDomain: string,
  externalAccountId: string,
  rawEmojis: unknown,
): Promise<Record<string, string>> {
  const emojis = Array.isArray(rawEmojis) ? (rawEmojis as RemoteCustomEmoji[]) : [];
  const entries = await Promise.all(
    emojis.slice(0, 100).map(async (emoji) => {
      const shortcode = (emoji.shortcode ?? "").trim().toLowerCase();
      if (!shortcode) return null;

      const sourceUrl = emoji.static_url ?? emoji.url;
      if (!sourceUrl) return null;

      const cachedUrl = await downloadAndCacheProfileEmoji(
        sourceUrl,
        `${platform}-${instanceDomain}-${externalAccountId}-emoji-${shortcode}`,
      );

      if (!cachedUrl) return null;
      return [shortcode, cachedUrl] as const;
    }),
  );

  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)));
}

export const GET: APIRoute = async ({ url, cookies, redirect, request }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    cookies.delete("link_state", { path: "/" });
    cookies.delete("link_state_data", { path: "/" });
    return redirect(`/auth/links?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return redirect("/auth/links?error=missing_params");
  }

  const cookieState = cookies.get("link_state")?.value;

  cookies.delete("link_state", { path: "/" });
  cookies.delete("link_state_data", { path: "/" });

  if (!cookieState || state !== cookieState) {
    return redirect("/auth/links?error=state_mismatch");
  }

  let platform: PlatformKey;
  let instanceDomain: string;
  let userId: string | null;
  let isPrimaryNsfw: boolean;
  let clientId: string;
  let clientSecret: string;
  let flow: "link" | "register" | "login";

  type LinkStatePayload = {
    platform: PlatformKey;
    instanceDomain: string;
    userId: string | null;
    isPrimaryNsfw: boolean;
    flow: "link" | "register" | "login";
    clientId: string;
    clientSecret: string;
  };

  try {
    const record = await consumeAuthFlowState<LinkStatePayload>("link", cookieState);
    if (!record) {
      return redirect("/auth/links?error=invalid_state");
    }

    const statePayload = record.payload;
    platform = statePayload.platform;
    instanceDomain = statePayload.instanceDomain;
    userId = statePayload.userId;
    isPrimaryNsfw = Boolean(statePayload.isPrimaryNsfw);
    flow = statePayload.flow === "register" ? "register" : statePayload.flow === "login" ? "login" : "link";
    clientId = statePayload.clientId;
    clientSecret = statePayload.clientSecret;

  } catch {
    return redirect("/auth/links?error=invalid_state");
  }

  const provider = PROVIDERS[platform];
  if (!provider) {
    return redirect("/auth/links?error=unsupported_platform");
  }

  try {
    const baseUrl = `https://${instanceDomain}`;

    const client = generator(provider.megalodonType, baseUrl);
    const tokenData = await client.fetchAccessToken(
      clientId,
      clientSecret,
      code,
      `${SITE_URL}/api/auth/link/callback`,
    );

    const accessToken = tokenData.access_token;

    const profileClient = createMegalodonClient(platform, instanceDomain, accessToken);
    const accountRes = await profileClient.verifyAccountCredentials();

    if (accountRes.status !== 200 || !accountRes.data) {
      return redirect("/auth/links?error=profile_fetch_failed");
    }

    const account = accountRes.data;
    const avatarUrl = account.avatar
      ? await downloadAndCacheProfileImage(account.avatar, `${platform}-${instanceDomain}-${account.id}-avatar`)
      : null;
    const headerUrl = account.header
      ? await downloadAndCacheProfileImage(account.header, `${platform}-${instanceDomain}-${account.id}-header`)
      : null;
    const customEmojiMap = await buildCustomEmojiMap(
      platform,
      instanceDomain,
      account.id,
      (account as { emojis?: unknown }).emojis,
    );

    const existing = await prisma.linkedProfile.findUnique({
      where: {
        platform_instanceDomain_externalAccountId: {
          platform,
          instanceDomain,
          externalAccountId: account.id,
        },
      },
    });

    if (existing && flow !== "login") {
      return redirect(flow === "register" ? "/auth/signup/fediverse?error=already_linked" : "/auth/links?error=already_linked");
    }

    if (flow === "register") {
      const pendingPayload = {
        platform,
        instanceDomain,
        externalAccountId: account.id,
        accessToken,
        refreshToken: tokenData.refresh_token ?? null,
        tokenExpiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null,
        scope: provider.readScope,
        username: account.username,
        acct: account.acct,
        displayName: account.display_name ?? null,
        avatarUrl: avatarUrl ?? account.avatar ?? null,
        headerUrl: headerUrl ?? account.header ?? null,
        bio: account.note ?? null,
        followersCount: account.followers_count ?? 0,
        followingCount: account.following_count ?? 0,
        statusesCount: account.statuses_count ?? 0,
        profileUrl: account.url ?? null,
        customEmojiMap,
        isPrimaryNsfw,
      };

      const pendingToken = await createAuthFlowState("fediverse-signup-pending", pendingPayload, 10 * 60);

      cookies.set("fediverse_signup_pending", pendingToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 10 * 60,
        path: "/",
      });

      return redirect("/auth/signup/fediverse?connected=1");
    }

    if (flow === "login") {
      const linked = await prisma.linkedProfile.findUnique({
        where: {
          platform_instanceDomain_externalAccountId: {
            platform,
            instanceDomain,
            externalAccountId: account.id,
          },
        },
        include: { user: true },
      });

      if (!linked?.user?.email) {
        return redirect("/auth/signup/fediverse?error=account_not_linked");
      }

      const password = deriveFediversePassword({
        platform,
        instanceDomain,
        externalAccountId: account.id,
      });

      const signInRes = await auth.api.signInEmail({
        body: { email: linked.user.email, password },
        asResponse: true,
        headers: request.headers,
      });

      let finalSignInRes = signInRes;
      if (!finalSignInRes.ok) {
        const passwordHash = await hashPassword(password);
        await prisma.account.updateMany({
          where: {
            userId: linked.userId,
            providerId: "credential",
          },
          data: {
            password: passwordHash,
          },
        });

        finalSignInRes = await auth.api.signInEmail({
          body: { email: linked.user.email, password },
          asResponse: true,
          headers: request.headers,
        });
      }

      if (!finalSignInRes.ok) {
        return redirect("/auth/login?error=fediverse_signin_failed");
      }

      const response = redirect("/auth/dashboard");
      const setCookie = finalSignInRes.headers.get("set-cookie");
      if (setCookie) response.headers.set("set-cookie", setCookie);
      return response;
    }

    if (!userId) {
      return redirect("/auth/links?error=missing_user");
    }

    await prisma.linkedProfile.create({
      data: {
        userId,
        platform,
        instanceDomain,
        externalAccountId: account.id,
        accessToken,
        refreshToken: tokenData.refresh_token ?? null,
        tokenExpiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        scope: provider.readScope,
        username: account.username,
        acct: account.acct,
        displayName: account.display_name ?? null,
        avatarUrl: avatarUrl ?? account.avatar ?? null,
        headerUrl: headerUrl ?? account.header ?? null,
        bio: account.note ?? null,
        followersCount: account.followers_count ?? 0,
        followingCount: account.following_count ?? 0,
        statusesCount: account.statuses_count ?? 0,
        profileUrl: account.url ?? null,
        customEmojiMap,
        customEmojiUpdatedAt: new Date(),
        lastSyncedAt: new Date(),
        isPrimaryNsfw,
      },
    });

    const primary = await prisma.linkedProfile.findFirst({
      where: { userId, isPrimaryProfile: true },
    });

    if (primary?.externalAccountId === account.id && primary.platform === platform && primary.instanceDomain === instanceDomain) {
      await prisma.user.update({
        where: { id: userId },
        data: { image: avatarUrl ?? account.avatar ?? null },
      });
    }

    return redirect("/auth/links?success=linked");
  } catch (err) {
    console.error("Error in link callback:", err);
    const errMsg = err instanceof Error ? err.message : "unknown_error";
    return redirect(`/auth/links?error=${encodeURIComponent(errMsg)}`);
  }
};
