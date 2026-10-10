import { prisma } from "./prisma";
import { sendEmail } from "./email";

const SITE_URL = process.env.SITE_URL || process.env.BETTER_AUTH_URL || "";

async function getAdminEmails(): Promise<string[]> {
    const admins = await prisma.user.findMany({
        where: { role: "admin", banned: false },
        select: { email: true },
    });
    return admins.map((a) => a.email).filter(Boolean);
}

/**
 * Notify all admins that a starter pack is awaiting approval.
 * Never throws; failures are logged so the submission request is unaffected.
 */
export async function notifyAdminsPackPending(pack: {
    name: string;
    slug: string;
    submitterName?: string | null;
    resubmission?: boolean;
}): Promise<void> {
    try {
        const recipients = await getAdminEmails();
        if (recipients.length === 0) return;

        const reviewUrl = `${SITE_URL}/admin/packs`;
        const action = pack.resubmission ? "resubmitted" : "submitted";
        const by = pack.submitterName ? ` by ${pack.submitterName}` : "";
        const subject = `Starter pack awaiting approval: ${pack.name}`;
        const text =
            `The starter pack "${pack.name}" (${pack.slug}) was ${action}${by} and is awaiting approval.\n\n` +
            `Review it here: ${reviewUrl}\n`;

        await Promise.all(
            recipients.map((to) =>
                sendEmail({ to, subject, text }).catch((err) =>
                    console.error(`Failed to send admin notification to ${to}:`, err)
                )
            )
        );
    } catch (err) {
        console.error("Failed to notify admins of pending pack:", err);
    }
}
