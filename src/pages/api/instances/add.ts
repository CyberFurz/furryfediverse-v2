export const prerender = false;

import type { APIRoute } from "astro";
import { InstanceFetcher } from "../../../lib/fedi-data";
import { prisma } from "../../../lib/prisma";
import { downloadAndCacheImage } from "../../../lib/image-cache";
import generator from "megalodon";
import crypto from "crypto";

const BOT_INSTANCE_URL = process.env.MASTODON_URL;
const BOT_ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const SITE_URL = process.env.SITE_URL || "https://furryfediverse.org";

async function sendVerificationDM(instanceDomain: string, instanceContact: string, apiKey: string, instanceType: string) {
    const invalidContacts = [
        "instance.ext",
        "instance.social",
        "null",
    ];

    if (!instanceContact || invalidContacts.some(c => instanceContact.includes(c))) {
        return {
            success: false,
            message: "Added instance successfully, but could not send verification message due to invalid contact information.",
        };
    }

    const verificationLink = `${SITE_URL}/api/instances/verify/${apiKey}`;

    if (instanceType === "misskey") {
        try {
            const adminVerify = {
                query: instanceContact,
                limit: 1,
                origin: "local",
                detail: true,
            };
            const adminReq = await fetch(
                `https://${instanceDomain}/api/users/search`,
                {
                    headers: { "Content-Type": "application/json;charset=UTF-8" },
                    body: JSON.stringify(adminVerify),
                    method: "POST",
                }
            );
            const adminRes = await adminReq.json() as any[];

            if (!adminRes[0] || adminRes[0].isAdmin !== true) {
                return {
                    success: false,
                    message: "The provided contact is not an administrator of this instance. Please provide a valid admin account.",
                };
            }
        } catch (error) {
            console.error("Error verifying Misskey admin:", error);
            return {
                success: false,
                message: "Could not verify admin status on this Misskey instance.",
            };
        }
    }

    if (!BOT_INSTANCE_URL || !BOT_ACCESS_TOKEN) {
        console.warn("BOT_INSTANCE_URL or ACCESS_TOKEN not configured, skipping DM send");
        return {
            success: false,
            message: "Added instance successfully, but verification DM could not be sent (bot not configured).",
        };
    }

    try {
        const client = generator("mastodon", BOT_INSTANCE_URL, BOT_ACCESS_TOKEN);

        const toot = `@${instanceContact}@${instanceDomain} Hi there! Someone is attempting to register your instance on FurryFediverse. If this is you, please click this link to finish the registration: ${verificationLink}`;

        await client.postStatus(toot, { visibility: "direct" });

        return {
            success: true,
            message: "Added instance successfully! Your instance admin account needs to be verified. Check your DMs!",
        };
    } catch (error) {
        console.error("Error sending verification DM:", error);
        return {
            success: false,
            message: "Added instance successfully, but could not send verification DM. Please try again later.",
        };
    }
}

export const POST: APIRoute = async ({ request, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const body = await request.json();
        const { domain, instanceType, adminUsername, country, primaryLanguage, donationLink, customInviteLink, nsfwAllowed } = body;

        if (!domain || !instanceType) {
            return new Response(
                JSON.stringify({ error: "Domain and instance type are required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const validTypes = ["mastodon", "misskey", "funkwhale", "pixelfed"];
        if (!validTypes.includes(instanceType)) {
            return new Response(
                JSON.stringify({ error: "Invalid instance type. Must be mastodon, misskey, pixelfed, or funkwhale" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        if (instanceType === "misskey" && !adminUsername) {
            return new Response(
                JSON.stringify({ error: "Admin username is required for Misskey instances" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const cleanedDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];

        const existingInstance = await prisma.instance.findUnique({
            where: { domain: cleanedDomain }
        });

        if (existingInstance) {
            return new Response(
                JSON.stringify({ error: "Instance already exists in the database" }),
                { status: 409, headers: { "Content-Type": "application/json" } }
            );
        }

        const instanceData = await InstanceFetcher.checkAvailable(cleanedDomain, instanceType);

        if (!instanceData) {
            return new Response(
                JSON.stringify({ error: "Could not fetch instance data. Make sure the domain is correct and the instance is online." }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const apiKey = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        let thumbnailPath = null;
        if (instanceData.thumbnail) {
            const filename = cleanedDomain;
            thumbnailPath = await downloadAndCacheImage(instanceData.thumbnail, filename);
        }

        const newInstance = await prisma.instance.create({
            data: {
                domain: cleanedDomain,
                instanceType,
                title: instanceData.title,
                description: instanceData.description,
                thumbnail: instanceData.thumbnail || null,
                thumbnailPath,
                userCount: instanceData.user_count || 0,
                instanceContact: instanceData.instance_contact || null,
                registrations: instanceData.registrations,
                approvalRequired: instanceData.approval_required,
                nsfwAllowed: nsfwAllowed || false,
                country: country || null,
                primaryLanguage: primaryLanguage || null,
                donationLink: donationLink || null,
                customInviteLink: customInviteLink || null,
                addedByUserId: user.id,
                verified: false,
                verificationKey: {
                    create: {
                        apiKey,
                        expiresAt,
                    }
                }
            }
        });

        const instanceContact = instanceType === "misskey"
            ? (adminUsername || instanceData.instance_contact)
            : instanceData.instance_contact;

        const verificationResult = await sendVerificationDM(
            cleanedDomain,
            instanceContact,
            apiKey,
            instanceType
        );

        return new Response(
            JSON.stringify({
                success: true,
                instance: newInstance,
                verificationSent: verificationResult.success,
                message: verificationResult.message,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error adding instance:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
