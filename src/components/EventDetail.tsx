import React, { useState, useEffect, useCallback, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faEllipsisVertical, faLink, faImage, faStar, faRetweet, faReply, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { faMastodon } from "@fortawesome/free-brands-svg-icons";

// --- Types ---
interface EventDetail {
    id: string;
    name: string;
    slug: string;
    description: string;
    location: string;
    startDate: string;
    endDate: string;
    timeZone: string;
    website: string;
    mastodon: string;
    tags: string;
    days: string;
    dayStyles: string;
    status: string;
    publishedAt: string | null;
    createdById: string;
    createdBy: { id: string; name: string };
    numPosts: number;
    numAccounts: number;
    numInstances?: number;
    category: string;
    _count?: { posts: number; accounts: number };
}

interface DayInfo {
    value: string;
    preDisplay: string;
    display: string;
    dayStyle: string;
    count: number;
}

interface EventPost {
    id: string;
    postId: string;
    createdAt: string | null;
    favouritesCount: number | null;
    reblogsCount: number | null;
    repliesCount: number | null;
    visibility: string | null;
    accountId: string | null;
    content?: string | null;
    url?: string | null;
    mediaCount?: number;
}

interface TopAccount {
    id: string;
    accountId: string;
    count: number;
    displayName?: string | null;
    handle?: string | null;
    avatarUrl?: string | null;
}

interface EventResponse {
    event: EventDetail;
    days: DayInfo[];
    topAccounts: TopAccount[];
    posts: EventPost[];
    pagination: { page: number; limit: number; totalCount: number; totalPages: number };
    allEventPostsCount: number;
}

// --- Sub-components ---
function SkeletonDetail() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-10 bg-white/10 rounded w-2/3" />
            <div className="h-4 bg-white/10 rounded w-1/3" />
            <div className="h-4 bg-white/10 rounded w-full" />
            <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-white/10 rounded w-16" />)}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="h-24 bg-white/5 rounded-xl" />
                <div className="h-24 bg-white/5 rounded-xl" />
            </div>
            <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
            </div>
        </div>
    );
}

function AdminDropdown({ slug, event, publishing, onTogglePublish, indexing, onIndex, deleting, onDelete }: {
    slug: string; event: EventDetail; publishing: boolean; onTogglePublish: () => void;
    indexing: boolean; onIndex: () => void; deleting: boolean; onDelete: () => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    const isPublished = !!event.publishedAt;
    const spin = <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />;

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(o => !o)} className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white" aria-label="Admin menu">
                <FontAwesomeIcon icon={faEllipsisVertical} className="w-5 h-5" />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-[#0D3559] border border-white/15 rounded-xl shadow-xl z-50 py-1">
                    <a href={`/events/${slug}/edit`} onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors no-underline">
                        Edit Event
                    </a>
                    <button onClick={() => { setOpen(false); onTogglePublish(); }} disabled={publishing}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors disabled:opacity-40">
                        {publishing ? <>{spin} {isPublished ? "Unpublishing..." : "Submitting..."}</> : <>{isPublished ? "Unpublish" : "Submit for Review"}</>}
                    </button>
                    <div className="border-t border-white/10 my-1" />
                    <button onClick={() => { setOpen(false); onIndex(); }} disabled={indexing}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors disabled:opacity-40">
                        {indexing ? <>{spin} Indexing...</> : "Index Posts"}
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
export default function EventDetail({ slug, user = null, userInstance = "" }: { slug: string; user?: any | null; userInstance?: string }) {
    const [data, setData] = useState<EventResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [allActive, setAllActive] = useState(true);
    const [filteredIds, setFilteredIds] = useState<Set<string>>(new Set());
    const [dateFilter, setDateFilter] = useState<string>("");
    const [order, setOrder] = useState<string>("");
    const [page, setPage] = useState(1);

    // Admin actions
    const [publishing, setPublishing] = useState(false);
    const [indexing, setIndexing] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const fetchEvent = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const sp = new URLSearchParams();
            if (dateFilter) sp.set("date", dateFilter);
            if (order) sp.set("order", order);
            sp.set("page", page.toString());

            const res = await fetch(`/api/events/${slug}?${sp}`);
            if (res.status === 404) { setError("not-found"); return; }
            if (!res.ok) throw new Error("Failed to load event");
            const d: EventResponse = await res.json();
            setData(d);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setLoading(false);
        }
    }, [slug, dateFilter, order, page]);

    useEffect(() => {
        fetchEvent();
    }, [fetchEvent]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [dateFilter, order]);

    const totalPages = data?.pagination?.totalPages ?? 1;

    const handleTogglePublish = useCallback(async () => {
        setPublishing(true);
        try {
            const res = await fetch(`/api/events/${slug}/publish`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to update publication status");
            await fetchEvent();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update event");
        } finally {
            setPublishing(false);
        }
    }, [slug, fetchEvent]);

    const handleIndex = useCallback(async () => {
        setIndexing(true);
        try {
            const res = await fetch(`/api/events/${slug}/index-posts`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to trigger indexing");
            setError(null);
            setTimeout(() => fetchEvent(), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to index");
        } finally {
            setIndexing(false);
        }
    }, [slug, fetchEvent]);

    const handleDelete = useCallback(async () => {
        if (!window.confirm("Are you sure you want to delete this event?")) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/events/${slug}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete event");
            window.location.href = "/events";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete event");
        } finally {
            setDeleting(false);
        }
    }, [slug]);

    const isAdmin = user && (user.role || "").split(",").includes("admin");
    const isOwner = !!(user && data && (data.event.createdById === user.id || isAdmin));
    const isPublished = data?.event.publishedAt ? true : false;
    const totalPosts = data?.allEventPostsCount ?? 0;

    // Format date range
    const formatDateRange = (start: string, end: string) => {
        if (!start || !end) return "Ongoing";
        const s = new Date(start);
        const e = new Date(end);
        const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
        if (s.getFullYear() !== e.getFullYear()) {
            return `${s.toLocaleDateString("en-US", { ...opts, year: "numeric" })} - ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
        }
        return `${s.toLocaleDateString("en-US", opts)} - ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
    };

    // Day style colors
    const dayStyleColors: Record<string, string> = {
        blue: "bg-blue-500/20 text-blue-300 border-blue-500/50",
        red: "bg-red-500/20 text-red-300 border-red-500/50",
        green: "bg-green-500/20 text-green-300 border-green-500/50",
        purple: "bg-purple-500/20 text-purple-300 border-purple-500/50",
        orange: "bg-orange-500/20 text-orange-300 border-orange-500/50",
        teal: "bg-teal-500/20 text-teal-300 border-teal-500/50",
        pink: "bg-pink-500/20 text-pink-300 border-pink-500/50",
        yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50",
    };

    if (loading) return <SkeletonDetail />;

    if (error === "not-found") {
        return (
            <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
                <p className="text-white/60 text-xl mb-2">Event Not Found</p>
                <p className="text-white/40 text-sm mb-6">This event doesn't exist or has been removed.</p>
                <a href="/events" className="inline-block bg-[#31dcb2] text-[#12384b] font-semibold px-6 py-2 rounded-lg hover:bg-[#28c4a0] transition-colors no-underline">Browse Events</a>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
                <p className="text-white/60 text-lg mb-2">Something went wrong</p>
                <p className="text-white/40 text-sm mb-6">{error}</p>
                <button onClick={fetchEvent} className="bg-white/10 text-white px-6 py-2 rounded-lg hover:bg-white/20 transition-colors text-sm">Try Again</button>
            </div>
        );
    }

    const { event, days, topAccounts } = data;

    // Build account lookup from all accounts (post display needs full data)
    const allAccounts = (data as any)?.allAccounts || data?.topAccounts || [];
    const accountLookup = new Map<string, TopAccount>();
    for (const a of allAccounts) {
        accountLookup.set(a.accountId, a);
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl md:text-3xl font-bold text-white">{event.name}</h1>
                    {event.status === "approved" && isPublished && (
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border bg-green-500/20 text-green-300 border-green-500/50">Published</span>
                    )}
                    {event.status === "pending" && (
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/50">Pending Review</span>
                    )}
                    {event.status === "draft" && (
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border bg-yellow-500/20 text-yellow-300 border-yellow-500/50">Draft</span>
                    )}
                    {event.status === "rejected" && (
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border bg-red-500/20 text-red-300 border-red-500/50">Rejected</span>
                    )}
                    {isOwner && (
                        <div className="ml-auto">
                            <AdminDropdown slug={slug} event={event}
                                publishing={publishing} onTogglePublish={handleTogglePublish}
                                indexing={indexing} onIndex={handleIndex}
                                deleting={deleting} onDelete={handleDelete} />
                        </div>
                    )}
                </div>
                <p className="text-white/60 text-sm mb-1">
                    {formatDateRange(event.startDate, event.endDate)}
                    {event.location && <span> &middot; {event.location}</span>}
                </p>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                    {event.website && (
                        <a href={event.website} target="_blank" rel="noopener noreferrer"
                            className="text-[#31dcb2] text-sm hover:underline inline-flex items-center gap-1">
                            <FontAwesomeIcon icon={faLink} className="w-3.5 h-3.5" />
                            {event.website.replace(/^https?:\/\//, "")}
                        </a>
                    )}
                    {event.mastodon && (
                        <button onClick={() => {
                            const url = userInstance
                                ? `https://${userInstance}/authorize_interaction?uri=${encodeURIComponent(event.mastodon)}`
                                : event.mastodon;
                            window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                            className="text-[#31dcb2] text-sm hover:underline inline-flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0">
                            <FontAwesomeIcon icon={faMastodon} className="w-3.5 h-3.5" />
                            Mastodon
                        </button>
                    )}
                </div>
                {event.description && (
                    <p className="text-white/70 text-sm mt-2">{event.description}</p>
                )}
                {event.tags && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {event.tags.split(",").map((tag, i) => {
                            const cleanTag = tag.trim().replace(/^#/, "");
                            const tagUrl = userInstance
                                ? `https://${userInstance}/tags/${encodeURIComponent(cleanTag)}`
                                : null;
                            return tagUrl ? (
                                <button key={i} onClick={() => window.open(tagUrl, '_blank', 'noopener,noreferrer')}
                                    className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/10 hover:border-[#31dcb2]/40 hover:text-[#31dcb2] transition-colors cursor-pointer">
                                    #{cleanTag}
                                </button>
                            ) : (
                                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/10">
                                    #{cleanTag}
                                </span>
                            );
                        })}
                    </div>
                )}
                <p className="text-xs text-white/40 mt-3">
                    Created by {event.createdBy.name}
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Posts" value={totalPosts} />
                {days.length > 0 ? <StatCard label="Days" value={days.length} /> : null}
                <StatCard label="Active Accounts" value={topAccounts.length} />
                <StatCard label="Across Instances" value={event.numInstances || 0} />
            </div>

            {/* Day filters */}
            {days.length > 0 && (
                <div>
                    <h2 className="text-sm font-medium text-white/80 mb-3">Filter by Day</h2>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => { setDateFilter("all"); setPage(1); }}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${dateFilter === "all"
                                ? "bg-white/10 text-white border-white/30"
                                : "bg-white/5 text-white/60 border-white/20 hover:bg-white/10"}`}>
                            All Posts
                        </button>
                        <button onClick={() => { setDateFilter(""); setPage(1); }}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${dateFilter === ""
                                ? "bg-[#31dcb2] text-[#12384b] border-[#31dcb2]"
                                : "bg-white/5 text-white/60 border-white/20 hover:bg-white/10"}`}>
                            All Event Days
                        </button>
                        {days.map((day) => (
                            <button key={day.value} onClick={() => { setDateFilter(day.value); setPage(1); }}
                                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${dateFilter === day.value
                                    ? "bg-[#31dcb2] text-[#12384b] border-[#31dcb2]"
                                    : `${dayStyleColors[day.dayStyle] || dayStyleColors.purple} hover:opacity-80 border`}`}>
                                {day.preDisplay} ({day.count})
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Account filters */}
            {topAccounts.length > 0 && (
                <div>
                    <h2 className="text-sm font-medium text-white/80 mb-3">Top Active Accounts</h2>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => { setAllActive(!allActive); setFilteredIds(new Set()); setPage(1); }}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${allActive
                                ? "bg-[#31dcb2] text-[#12384b] border-[#31dcb2]"
                                : "bg-white/5 text-white/40 border-white/20 line-through hover:bg-white/10"}`}>
                            All Accounts
                        </button>
                        {topAccounts.map((acc) => {
                            const excluded = allActive && filteredIds.has(acc.accountId);
                            const included = !allActive && filteredIds.has(acc.accountId);
                            const isActive = allActive ? !excluded : included;
                            return (
                            <button key={acc.id} onClick={() => {
                                const next = new Set(filteredIds);
                                if (next.has(acc.accountId)) {
                                    next.delete(acc.accountId);
                                } else {
                                    next.add(acc.accountId);
                                }
                                setFilteredIds(next);
                                setPage(1);
                            }}
                                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                    isActive
                                        ? "bg-white/10 text-white border-white/30 hover:bg-white/20"
                                        : "bg-white/5 text-white/30 border-white/10 line-through opacity-50"}`}>
                                {acc.avatarUrl && (
                                    <img src={acc.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover shrink-0"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                )}
                                <span>{acc.displayName || acc.handle || acc.accountId}</span>
                                <span className="text-white/40">({acc.count})</span>
                            </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Sort */}
            <div className="flex items-center gap-3">
                <label htmlFor="post-sort" className="text-sm font-medium text-white/80">Sort by:</label>
                <select id="post-sort" value={order}
                    onChange={(e) => { setOrder(e.target.value); setPage(1); }}
                    className="px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-[#31dcb2] appearance-none">
                    <option value="" className="bg-[#0A2B49]">Default</option>
                    <option value="-favouritesCount" className="bg-[#0A2B49]">Favorites</option>
                    <option value="-reblogsCount" className="bg-[#0A2B49]">Boosts</option>
                    <option value="-repliesCount" className="bg-[#0A2B49]">Replies</option>
                    <option value="-createdAt" className="bg-[#0A2B49]">Newest</option>
                </select>
            </div>

            {/* Posts list */}
            {(data?.posts?.length ?? 0) > 0 ? (
                <div>
                    <h2 className="text-lg font-semibold text-white mb-4">Posts ({totalPosts})</h2>
                    <div className="columns-1 md:columns-2 xl:columns-3 gap-4 [&>*]:break-inside-avoid-column [&>*]:mb-4">
                        {data.posts.filter(post => {
                            if (!post.accountId) return allActive;
                            const inFilter = filteredIds.has(post.accountId);
                            return allActive ? !inFilter : inFilter;
                        }).map((post) => {
                            const acct = post.accountId ? accountLookup.get(post.accountId) : null;
                            const acctName = acct?.displayName || acct?.handle || "";
                            const acctHandle = acct?.handle || "";
                            const acctAvatar = acct?.avatarUrl || null;
                            return (
                            <div key={post.id} onClick={() => { if (post.url) { const openUrl = userInstance ? `https://${userInstance}/authorize_interaction?uri=${encodeURIComponent(post.url)}` : post.url; window.open(openUrl, '_blank', 'noopener,noreferrer'); }}} className={`block bg-white/5 rounded-xl p-4 ${post.url ? 'cursor-pointer border border-transparent hover:border-[#31dcb2]/40' : ''}`}>
                                {/* Account header */}
                                <div className="flex items-center gap-2.5 mb-3">
                                    {acctAvatar ? (
                                        <img src={acctAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 bg-white/10"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-[#31dcb2]/20 shrink-0 flex items-center justify-center text-[#31dcb2] text-xs font-bold">
                                            {(acctName || "?").charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-white text-sm font-semibold truncate">{acctName || "Unknown"}</p>
                                        <p className="text-white/40 text-xs truncate">{acctHandle}</p>
                                    </div>
                                </div>
                                {/* Post content (images stripped) */}
                                {post.content && (
                                    <div className="text-white/80 text-sm mb-3 line-clamp-4 [&_a]:text-[#31dcb2] [&_a]:underline [&_p]:mb-1 [&_br]:hidden"
                                        dangerouslySetInnerHTML={{ __html: post.content.replace(/<img[^>]*>/gi, "") }} />
                                )}
                                {post.mediaCount != null && post.mediaCount > 0 && (
                                    <div className="text-xs text-white/40 mb-3 flex items-center gap-1">
                                        <FontAwesomeIcon icon={faImage} className="w-3.5 h-3.5" />
                                        This post contains {post.mediaCount} {post.mediaCount === 1 ? "image" : "images"}. Click to open
                                    </div>
                                )}
                                {/* Meta row */}
                                <div className="flex items-center justify-between gap-3">
                                    {post.createdAt && (
                                        <span className="text-white/40 text-xs">{new Date(post.createdAt).toLocaleString()}</span>
                                    )}
                                    <div className="flex items-center gap-3 shrink-0">
                                        {post.favouritesCount != null && (
                                            <span className="inline-flex items-center gap-1 text-xs text-white/60" title="Favorites">
                                                <FontAwesomeIcon icon={faStar} className="w-3.5 h-3.5" />
                                                {post.favouritesCount}
                                            </span>
                                        )}
                                        {post.reblogsCount != null && (
                                            <span className="inline-flex items-center gap-1 text-xs text-white/60" title="Boosts">
                                                <FontAwesomeIcon icon={faRetweet} className="w-3.5 h-3.5" />
                                                {post.reblogsCount}
                                            </span>
                                        )}
                                        {post.repliesCount != null && (
                                            <span className="inline-flex items-center gap-1 text-xs text-white/60" title="Replies">
                                                <FontAwesomeIcon icon={faReply} className="w-3.5 h-3.5" />
                                                {post.repliesCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-4 mt-6">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                                className="p-2 rounded-lg bg-white/5 border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                <FontAwesomeIcon icon={faChevronLeft} className="w-5 h-5" />
                            </button>
                            <span className="text-sm text-white/60">Page {page} of {totalPages}</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                                className="p-2 rounded-lg bg-white/5 border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                <FontAwesomeIcon icon={faChevronRight} className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/50">No posts found for this event.</p>
                </div>
            )}

        </div>
    );
}
