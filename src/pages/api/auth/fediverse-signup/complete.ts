export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../../lib/prisma";
import { auth } from "../../../../lib/auth";
import { deriveFediversePassword } from "../../../../lib/fediverse-auth";

type PendingSignup = {
  platform: string;
  instanceDomain: string;
  externalAccountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  scope: string;
  username: string;
  acct: string;
  displayName: string | null;
  avatarUrl: string | null;
  headerUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  statusesCount: number;
  profileUrl: string | null;
  isPrimaryNsfw: boolean;
  createdAt: number;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const pendingToken = cookies.get("fediverse_signup_pending")?.value;
    if (!pendingToken) {
      return new Response(JSON.stringify({ error: "No pending fediverse signup" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const pending = JSON.parse(Buffer.from(pendingToken, "base64url").toString()) as PendingSignup;
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
      cookies.delete("fediverse_signup_pending", { path: "/" });
      return new Response(JSON.stringify({ error: "Fediverse signup expired. Please reconnect your account." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    if (!email || !name) {
      return new Response(JSON.stringify({ error: "Email and display name are required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const existing = await prisma.linkedProfile.findUnique({
      where: {
        platform_instanceDomain_externalAccountId: {
          platform: pending.platform,
          instanceDomain: pending.instanceDomain,
          externalAccountId: pending.externalAccountId,
        },
      },
    });
    if (existing) {
      cookies.delete("fediverse_signup_pending", { path: "/" });
      return new Response(JSON.stringify({ error: "This fediverse account is already linked" }), { status: 409, headers: { "Content-Type": "application/json" } });
    }

    const password = deriveFediversePassword({
      platform: pending.platform,
      instanceDomain: pending.instanceDomain,
      externalAccountId: pending.externalAccountId,
    });

    const signUpRes = await auth.api.signUpEmail({
      body: { email, name, password },
      asResponse: true,
      headers: request.headers,
    });

    if (!signUpRes.ok) {
      const signUpJson = await signUpRes.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: signUpJson?.message || "Failed to create account" }), {
        status: signUpRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const createdUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    const userId = createdUser?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Failed to locate newly created user" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    await prisma.linkedProfile.create({
      data: {
        userId,
        platform: pending.platform,
        instanceDomain: pending.instanceDomain,
        externalAccountId: pending.externalAccountId,
        accessToken: pending.accessToken,
        refreshToken: pending.refreshToken,
        tokenExpiresAt: pending.tokenExpiresAt ? new Date(pending.tokenExpiresAt) : null,
        scope: pending.scope,
        username: pending.username,
        acct: pending.acct,
        displayName: pending.displayName,
        avatarUrl: pending.avatarUrl,
        headerUrl: pending.headerUrl,
        bio: pending.bio,
        followersCount: pending.followersCount,
        followingCount: pending.followingCount,
        statusesCount: pending.statusesCount,
        profileUrl: pending.profileUrl,
        lastSyncedAt: new Date(),
        isPrimaryNsfw: Boolean(pending.isPrimaryNsfw),
      },
    });

    cookies.delete("fediverse_signup_pending", { path: "/" });
    const response = new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    const setCookie = signUpRes.headers.get("set-cookie");
    if (setCookie) response.headers.set("set-cookie", setCookie);
    return response;
  } catch (error) {
    console.error("fediverse signup completion failed", error);
    return new Response(JSON.stringify({ error: "Failed to complete signup" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
