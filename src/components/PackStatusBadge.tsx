import React from "react";

/** Owner-facing pack status, derived from `status` + `publishedAt`. */
export function packStatusLabel(status: string | null | undefined, publishedAt: string | null | undefined) {
    switch (status) {
        case "approved":
            return publishedAt
                ? { label: "Published", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50" }
                : { label: "Unpublished", cls: "bg-white/10 text-white/70 border-white/30" };
        case "pending":
            return { label: "Pending Review", cls: "bg-sky-500/20 text-sky-300 border-sky-500/50" };
        case "rejected":
            return { label: "Rejected", cls: "bg-red-500/20 text-red-300 border-red-500/50" };
        default:
            // Older rows may lack status; fall back to publishedAt.
            return publishedAt
                ? { label: "Published", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50" }
                : { label: "Draft", cls: "bg-amber-500/20 text-amber-300 border-amber-500/50" };
    }
}

export default function PackStatusBadge({ status, publishedAt }: { status?: string | null; publishedAt?: string | null }) {
    const { label, cls } = packStatusLabel(status, publishedAt);
    return <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}
