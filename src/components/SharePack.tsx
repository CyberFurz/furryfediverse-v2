import React, { useState, useEffect, useCallback, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faEllipsisVertical, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { isBlueskyBridgedHandle } from "@/lib/social/handles";
import { BLUESKY_CARD_CLASSES, BlueskyAvatarBadge, BlueskyLabel } from "./BlueskyBadge";

// --- Types ---
interface PackAccount {
    name: string; handle: string; url: string; avatar: string;
    followers_count: number; bot: boolean; discoverable: boolean;
    following?: boolean;
}
interface PackDetail {
    url?: string; title: string; description: string;
    created_by: string | { id: string; name: string; avatar?: string };
    created_at: string; published_at: string | null;
    followingKnown?: boolean;
    accounts: PackAccount[];
}
interface FollowAllResult {
    followed: string[] | number;
    requested: string[];
    skipped: number;
    skippedAlreadyFollowing: number;
    errors: Array<{ acct: string; error: string }>;
    total: number;
    batchSize?: number;
    backgroundStarted?: boolean;
}

// --- Sub-components ---
function SkeletonShare() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="aspect-[1200/630] bg-white/5 rounded-xl border border-white/10" />
            <div className="h-8 bg-white/10 rounded w-2/3" />
            <div className="h-4 bg-white/10 rounded w-1/3" />
            <div className="h-4 bg-white/10 rounded w-full" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-white/5 rounded-xl border border-white/10" />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/10 rounded-full shrink-0" />
                            <div className="space-y-2 flex-1 min-w-0">
                                <div className="h-4 bg-white/10 rounded w-3/4" />
                                <div className="h-3 bg-white/10 rounded w-1/2" />
                            </div>
                        </div>
                        <div className="h-3 bg-white/10 rounded w-1/3" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function AccountCard({ a }: { a: PackAccount }) {
    const bluesky = isBlueskyBridgedHandle(a.handle);
    return (
        <div className={`rounded-xl p-4 border ${bluesky ? BLUESKY_CARD_CLASSES : "bg-white/5 border-white/10"}`}>
            <div className="flex items-center gap-3 mb-2">
                <div className="relative shrink-0">
                    {a.avatar ? (
                        <img src={a.avatar} alt={a.name} className="w-12 h-12 rounded-full object-cover bg-white/10" loading="lazy" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-[#31dcb2]/20 flex items-center justify-center text-[#31dcb2] text-lg font-bold">
                            {(a.name || "@")[0].toUpperCase()}
                        </div>
                    )}
                    {bluesky && <BlueskyAvatarBadge />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{a.name}</p>
                        {bluesky && <BlueskyLabel />}
                    </div>
                    <p className="text-white/50 text-xs truncate">{a.handle}</p>
                </div>
            </div>
            {a.followers_count > 0 && <p className="text-xs text-white/50">{a.followers_count.toLocaleString()} followers</p>}
            {a.following ? (
                <span className="mt-3 inline-flex items-center gap-1.5 w-full justify-center py-1.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium">
                    Following
                </span>
            ) : a.url ? (
                <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 w-full justify-center py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white/80 text-sm font-medium transition-colors no-underline"
                >
                    <FontAwesomeIcon icon={faUserPlus} className="w-3.5 h-3.5" />
                    Follow on their instance
                </a>
            ) : null}
        </div>
    );
}

function AdminDropdown({ slug, published, publishing, onTogglePublish, deleting, onDelete }: {
    slug: string; published: boolean; publishing: boolean; onTogglePublish: () => void; deleting: boolean; onDelete: () => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    const spin = <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />;

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(o => !o)} className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white" aria-label="Admin menu">
                <FontAwesomeIcon icon={faEllipsisVertical} className="w-5 h-5" />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-[#0D3559] border border-white/15 rounded-xl shadow-xl z-50 py-1">
                    <a href={`/packs/${slug}/edit`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors no-underline">Edit Pack</a>
                    <a href={`/packs/${slug}/accounts`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors no-underline">Manage Accounts</a>
                    <a href={`/packs/${slug}/review`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors no-underline">Review</a>
                    <div className="border-t border-white/10 my-1" />
                    <button onClick={() => { setOpen(false); onTogglePublish(); }} disabled={publishing}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors disabled:opacity-40">
                        {publishing ? <>{spin} {published ? "Unpublishing..." : "Publishing..."}</> : <>{published ? "Unpublish" : "Publish"}</>}
                    </button>
                    <div className="border-t border-white/10 my-1" />
                    <button onClick={() => { setOpen(false); onDelete(); }} disabled={deleting}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                        {deleting ? <>{spin} Deleting...</> : "Delete"}
                    </button>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-white/50 mt-1">{label}</p>
        </div>
    );
}

// --- Main ---
export default function SharePack({ slug, user = null, hasLinkedProfile = false }: {
    slug: string; user?: any | null; hasLinkedProfile?: boolean;
}) {
    const [pack, setPack] = useState<PackDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [following, setFollowing] = useState(false);
    const [followResult, setFollowResult] = useState<FollowAllResult | null>(null);
    const [followError, setFollowError] = useState<string | null>(null);
    const [publishing, setPublishing] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const fetchPack = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/packs/${slug}`, { headers: { Accept: "application/json" } });
            if (res.status === 404) { setError("not-found"); return; }
            if (!res.ok) throw new Error("Failed to load pack");
            setPack(await res.json());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setLoading(false);
        }
    }, [slug]);

    useEffect(() => { fetchPack(); }, [fetchPack]);

    const handleFollowAll = useCallback(async () => {
        setFollowing(true);
        setFollowResult(null);
        setFollowError(null);
        try {
            const res = await fetch(`/api/packs/${slug}/follow`, { method: "POST" });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                if (res.status === 400 && errBody.error?.includes("No active Mastodon linked profile")) {
                    setFollowError("no-profile");
                } else {
                    setFollowError(errBody.error || "Failed to follow accounts");
                }
                return;
            }
            const r: FollowAllResult = await res.json();
            setFollowResult({
                followed: r.followed ?? [],
                requested: r.requested ?? [],
                skipped: r.skipped ?? 0,
                skippedAlreadyFollowing: r.skippedAlreadyFollowing ?? 0,
                errors: r.errors ?? [],
                total: r.total,
                batchSize: r.batchSize,
                backgroundStarted: r.backgroundStarted ?? false,
            });
        } catch (err) {
            setFollowError(err instanceof Error ? err.message : "Failed to follow accounts");
        } finally {
            setFollowing(false);
        }
    }, [slug]);

    const handleTogglePublish = useCallback(async () => {
        setPublishing(true);
        try {
            const res = await fetch(`/api/packs/${slug}/publish`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to toggle publish");
            await fetchPack();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update pack");
        } finally {
            setPublishing(false);
        }
    }, [slug, fetchPack]);

    const handleDelete = useCallback(async () => {
        if (!window.confirm("Are you sure you want to delete this starter pack? It will be hidden from the community and can be restored by an admin.")) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/packs/${slug}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete pack");
            window.location.href = "/packs";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete pack");
        } finally {
            setDeleting(false);
        }
    }, [slug]);

    const isPublished = pack?.published_at !== null && pack?.published_at !== undefined;
    const creatorId = pack && typeof pack.created_by === "object" ? (pack.created_by as any).id : null;
    const creatorName = pack ? (typeof pack.created_by === "object" ? (pack.created_by as any).name : pack.created_by as string) : "";
    const creatorProfileUrl = pack && typeof pack.created_by === "object" ? (pack.created_by as any).profileUrl || null : null;
    const creatorAcct = pack && typeof pack.created_by === "object" ? (pack.created_by as any).acct || null : null;
    const isOwner = !!(user && creatorId && user.id === creatorId);
    const accountCount = pack?.accounts.length ?? 0;
    // Only hide the batch-follow button when we actually know the viewer's
    // following state (followingKnown) and they follow every account.
    const allFollowed = !!pack?.followingKnown && accountCount > 0 && pack.accounts.every((a) => a.following);
    // How many accounts are still left to follow (null when unknown).
    const remainingToFollow = pack?.followingKnown
        ? pack.accounts.filter((a) => !a.following).length
        : null;
    const nextBatchCount = remainingToFollow !== null && remainingToFollow > 0
        ? Math.min(remainingToFollow, 25)
        : null;
    const serverCount = pack?.accounts
        ? new Set(pack.accounts.map((a) => a.handle.split("@").pop() || "").filter(Boolean)).size
        : 0;

    if (loading) return <SkeletonShare />;

    if (error === "not-found") {
        return (
            <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
                <p className="text-white/60 text-xl mb-2">Pack Not Found</p>
                <p className="text-white/40 text-sm mb-6">This starter pack doesn't exist or has been removed.</p>
                <a href="/packs" className="inline-block bg-[#31dcb2] text-[#12384b] font-semibold px-6 py-2 rounded-lg hover:bg-[#28c4a0] transition-colors no-underline">Browse Packs</a>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
                <p className="text-white/60 text-lg mb-2">Something went wrong</p>
                <p className="text-white/40 text-sm mb-6">{error}</p>
                <button onClick={fetchPack} className="bg-white/10 text-white px-6 py-2 rounded-lg hover:bg-white/20 transition-colors text-sm">Try Again</button>
            </div>
        );
    }

    if (!pack) return null;

    const spin = <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl md:text-3xl font-bold text-white">{pack.title}</h1>
                    {!isPublished && <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/50">Draft</span>}
                    {isOwner && (
                        <div className="ml-auto">
                            <AdminDropdown slug={slug} published={isPublished} publishing={publishing} onTogglePublish={handleTogglePublish} deleting={deleting} onDelete={handleDelete} />
                        </div>
                    )}
                </div>
                <p className="text-white/60">{pack.description}</p>
                <p className="text-xs text-white/40 mt-3">
                    Created by{" "}
                    {creatorProfileUrl ? (
                        <a href={creatorProfileUrl} target="_blank" rel="noopener noreferrer" className="text-[#31dcb2] hover:underline">
                            {creatorName}
                        </a>
                    ) : (
                        creatorName
                    )}
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
                <StatCard label="Accounts" value={accountCount} />
                <StatCard label="Servers" value={serverCount} />
            </div>

            {/* Follow options */}
            {user ? (
                <div className="space-y-4">
                    {followResult ? (
                        <div className={`p-4 rounded-xl text-sm border ${
                            (followResult.errors?.length ?? 0) === 0
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                        }`}>
                            {Array.isArray(followResult.followed) && followResult.followed.length > 0 ? (
                                <>
                                    <p>Followed {followResult.followed.length} account{followResult.followed.length !== 1 ? "s" : ""}:</p>
                                    <ul className="mt-1 space-y-0.5 text-xs text-white/70">
                                        {followResult.followed.map((h) => <li key={h}>{h}</li>)}
                                    </ul>
                                </>
                            ) : (
                                <p>No new accounts followed this round.</p>
                            )}
                            {(followResult.requested?.length ?? 0) > 0 && (
                                <>
                                    <p className="mt-2">
                                        Follow requested for {followResult.requested.length} account{followResult.requested.length !== 1 ? "s" : ""} (awaiting approval):
                                    </p>
                                    <ul className="mt-1 space-y-0.5 text-xs text-white/70">
                                        {followResult.requested.map((h) => <li key={h}>{h}</li>)}
                                    </ul>
                                    <p className="mt-2 text-xs text-white/60">
                                        These accounts require follow approval on their instance. The requests are pending until they're accepted.
                                    </p>
                                </>
                            )}
                            {(followResult.skippedAlreadyFollowing ?? 0) > 0 && (
                                <p className="mt-1 text-xs text-white/60">
                                    Skipped {followResult.skippedAlreadyFollowing} you already follow.
                                </p>
                            )}
                            {(followResult.errors?.length ?? 0) > 0 && (
                                <details className="mt-2">
                                    <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100">
                                        {followResult.errors.length} error{followResult.errors.length !== 1 ? "s" : ""}
                                    </summary>
                                    <ul className="mt-1 space-y-1 text-xs">
                                        {followResult.errors.slice(0, 5).map((e, i) => (
                                            <li key={i}><span className="text-white/60">{e.error}</span> for <span className="text-white/80">{e.acct}</span></li>
                                        ))}
                                        {followResult.errors.length > 5 && (
                                            <li className="text-white/40">...and {followResult.errors.length - 5} more</li>
                                        )}
                                    </ul>
                                </details>
                            )}
                        </div>
                    ) : followError === "no-profile" ? (
                        <div className="p-4 rounded-xl text-sm border bg-amber-500/10 border-amber-500/30 text-amber-300">
                            Connect a Mastodon account to follow these accounts.
                            {" "}
                            <a href="/auth/settings" className="text-[#31dcb2] hover:underline font-medium">Link Account</a>
                        </div>
                    ) : followError ? (
                        <div className="p-4 rounded-xl text-sm border bg-red-500/10 border-red-500/30 text-red-300">
                            {followError}
                        </div>
                    ) : !hasLinkedProfile ? (
                        <div className="p-4 rounded-xl text-sm border bg-amber-500/10 border-amber-500/30 text-amber-300">
                            Connect a Mastodon account to follow these accounts.
                            {" "}
                            <a href="/auth/settings" className="text-[#31dcb2] hover:underline font-medium">Link Account</a>
                        </div>
                    ) : allFollowed ? (
                        <div className="p-4 rounded-xl text-sm border bg-emerald-500/10 border-emerald-500/30 text-emerald-300">
                            You already follow everyone in this pack.
                            {" "}
                            <a href={`/api/packs/${slug}/follow?format=csv`} className="text-[#31dcb2] hover:underline" download>
                                Download the full list as CSV
                            </a>{" "}
                            to import on your own server.
                        </div>
                    ) : (
                        <>
                            <button onClick={handleFollowAll} disabled={following || accountCount === 0 || (nextBatchCount ?? 25) === 0}
                                className="w-full py-3 bg-[#31dcb2] text-[#12384b] font-semibold rounded-xl hover:bg-[#28c4a0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base">
                                {following
                                    ? <span className="flex items-center justify-center gap-2">{spin} Following...</span>
                                    : nextBatchCount !== null
                                        ? `Follow next ${nextBatchCount} account${nextBatchCount !== 1 ? "s" : ""}`
                                        : "Follow next 25 accounts"
                                }
                            </button>
                            <p className="text-white/40 text-xs">
                                Follows up to 25 accounts you don't already follow, one per minute.
                                You can follow the rest one by one below, or{" "}
                                <a href={`/api/packs/${slug}/follow?format=csv`} className="text-[#31dcb2] hover:underline" download>
                                    download the full list as CSV
                                </a>{" "}
                                to import on your own server.
                            </p>
                        </>
                    )}
                </div>
            ) : (
                <div className="p-4 rounded-xl text-sm border bg-white/5 border-white/10 text-white/60">
                    <a href="/auth/settings" className="text-[#31dcb2] hover:underline font-medium">Log in</a>
                    {" "}to follow accounts in this pack, or{" "}
                    <a href={`/api/packs/${slug}/follow?format=csv`} className="text-[#31dcb2] hover:underline" download>
                        download the list as CSV
                    </a>
                    {" "}to import it on your own server.
                </div>
            )}

            {/* Account grid */}
            {accountCount > 0 && (
                <div>
                    <h2 className="text-lg font-semibold text-white mb-4">Accounts ({accountCount})</h2>
                    {pack.accounts.some((a) => !a.discoverable) && (
                        <p className="text-white/40 text-xs mb-4 -mt-2">
                            They may look incomplete here, but they will still work with the
                            follow and CSV import options.
                        </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {pack.accounts.map((a, i) => <AccountCard key={a.handle + i} a={a} />)}
                    </div>
                </div>
            )}
        </div>
    );
}
