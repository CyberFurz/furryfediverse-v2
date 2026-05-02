export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import {
  PROVIDERS,
  type PlatformKey,
  createMegalodonClient,
} from "../../../../lib/social/providers";
import { downloadAndCacheProfileImage } from "../../../../lib/image-cache";
import generator from "megalodon";

const SITE_URL = process.env.SITE_URL || "http://localhost:4321";
const CLIENT_NAME = "FurryFediverse";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
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
  const cookieStateData = cookies.get("link_state_data")?.value;

  cookies.delete("link_state", { path: "/" });
  cookies.delete("link_state_data", { path: "/" });

  if (state !== cookieState) {
    return redirect("/auth/links?error=state_mismatch");
  }

  let platform: PlatformKey;
  let instanceDomain: string;
  let userId: string;
  let isPrimaryNsfw: boolean;
  let clientId: string;
  let clientSecret: string;

  try {
    const payload = JSON.parse(Buffer.from(cookieStateData!, "base64url").toString());
    platform = payload.platform;
    instanceDomain = payload.instanceDomain;
    userId = payload.userId;
    isPrimaryNsfw = Boolean(payload.isPrimaryNsfw);
    clientId = payload.clientId;
    clientSecret = payload.clientSecret;

    if (Date.now() - payload.createdAt > 10 * 60 * 1000) {
      return redirect("/auth/links?error=state_expired");
    }
  } catch {
    return redirect("/auth/links?error=invalid_state");
  }

  const provider = PROVIDERS[platform];
  if (!provider) {
    return redirect("/auth/links?error=unsupported_platform");
  }

  try {
    const baseUrl = `https://${instanceDomain}`;

    const client = generator(provider.megadonType, baseUrl);
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

    const existing = await prisma.linkedProfile.findUnique({
      where: {
        platform_instanceDomain_externalAccountId: {
          platform,
          instanceDomain,
          externalAccountId: account.id,
        },
      },
    });

    if (existing) {
      return redirect("/auth/links?error=already_linked");
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
