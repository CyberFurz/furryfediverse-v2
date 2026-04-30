export const prerender = false;

import type { APIRoute } from "astro";
import { prisma } from "../../../lib/prisma";

export const GET: APIRoute = async ({ url, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const pathSegments = url.pathname.split("/");
    const instanceId = pathSegments[pathSegments.length - 1];

    if (!instanceId) {
        return new Response(
            JSON.stringify({ error: "Instance ID is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const instance = await prisma.instance.findUnique({
            where: { id: instanceId }
        });

        if (!instance) {
            return new Response(
                JSON.stringify({ error: "Instance not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (instance.addedByUserId !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only edit instances you added" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ instance }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error fetching instance:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

export const PUT: APIRoute = async ({ request, url, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const pathSegments = url.pathname.split("/");
    const instanceId = pathSegments[pathSegments.length - 1];

    if (!instanceId) {
        return new Response(
            JSON.stringify({ error: "Instance ID is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const existingInstance = await prisma.instance.findUnique({
            where: { id: instanceId }
        });

        if (!existingInstance) {
            return new Response(
                JSON.stringify({ error: "Instance not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (existingInstance.addedByUserId !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only edit instances you added" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        const body = await request.json();
        const {
            title,
            description,
            country,
            primaryLanguage,
            donationLink,
            customInviteLink,
            nsfwAllowed,
            thumbnail,
        } = body;

        const updatedInstance = await prisma.instance.update({
            where: { id: instanceId },
            data: {
                title: title || existingInstance.title,
                description: description !== undefined ? description : existingInstance.description,
                country: country !== undefined ? country : existingInstance.country,
                primaryLanguage: primaryLanguage !== undefined ? primaryLanguage : existingInstance.primaryLanguage,
                donationLink: donationLink !== undefined ? donationLink : existingInstance.donationLink,
                customInviteLink: customInviteLink !== undefined ? customInviteLink : existingInstance.customInviteLink,
                nsfwAllowed: nsfwAllowed !== undefined ? nsfwAllowed : existingInstance.nsfwAllowed,
                thumbnail: thumbnail !== undefined ? thumbnail : existingInstance.thumbnail,
            }
        });

        return new Response(
            JSON.stringify({ success: true, instance: updatedInstance }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error updating instance:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

export const DELETE: APIRoute = async ({ url, locals }) => {
    const session = locals.session;
    const user = locals.user;

    if (!session || !user) {
        return new Response(
            JSON.stringify({ error: "Authentication required" }),
            { status: 401, headers: { "Content-Type": "application/json" } }
        );
    }

    const pathSegments = url.pathname.split("/");
    const instanceId = pathSegments[pathSegments.length - 1];

    if (!instanceId) {
        return new Response(
            JSON.stringify({ error: "Instance ID is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    try {
        const instance = await prisma.instance.findUnique({
            where: { id: instanceId }
        });

        if (!instance) {
            return new Response(
                JSON.stringify({ error: "Instance not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        if (instance.addedByUserId !== user.id) {
            return new Response(
                JSON.stringify({ error: "You can only delete instances you added" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        await prisma.instance.delete({
            where: { id: instanceId }
        });

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error deleting instance:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};
