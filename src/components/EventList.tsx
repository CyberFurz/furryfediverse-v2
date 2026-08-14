import React, { useState, useCallback, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { QueryClient, QueryClientProvider, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";

// --- Types ---
interface Event {
    id: string;
    name: string;
    slug: string;
    description: string;
    location: string;
    startDate: string;
    endDate: string;
    tags: string;
    status: string;
    publishedAt: string | null;
    createdAt: string;
    createdBy: { id: string; name: string };
    _count?: { eventPosts: number; eventAccounts: number };
}

interface PaginationData {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
}

interface FetchEventsResponse {
    events: Event[];
    pagination: PaginationData;
}

// --- Auth error ---
class AuthRequiredError extends Error {
    constructor() {
        super("Authentication required");
        this.name = "AuthRequiredError";
    }
}

// --- Fetch ---
async function fetchEvents({ queryKey, pageParam }: { queryKey: readonly [string, Record<string, string>]; pageParam: number }): Promise<FetchEventsResponse> {
    const [_key, params] = queryKey;
    const sp = new URLSearchParams({ ...params, page: pageParam.toString() });
    const res = await fetch(`/api/events?${sp}`);
    if (res.status === 401) throw new AuthRequiredError();
    if (!res.ok) throw new Error("Failed to fetch events");
    return res.json();
}

// --- Skeleton ---
function SkeletonCard() {
    return (
        <div className="bg-white/5 rounded-xl p-6 border border-white/10 animate-pulse">
            <div className="h-5 bg-white/10 rounded w-3/4 mb-3" />
            <div className="h-4 bg-white/10 rounded w-full mb-2" />
            <div className="h-4 bg-white/10 rounded w-2/3 mb-4" />
            <div className="flex gap-2">
                <div className="h-3 bg-white/10 rounded w-16" />
                <div className="h-3 bg-white/10 rounded w-14" />
            </div>
        </div>
    );
}

function getDateRange(startDate: string, endDate: string): string {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    if (start.getFullYear() !== end.getFullYear()) {
        return `${start.toLocaleDateString("en-US", { ...options, year: "numeric" })} - ${end.toLocaleDateString("en-US", { ...options, year: "numeric" })}`;
    }
    return `${start.toLocaleDateString("en-US", options)} - ${end.toLocaleDateString("en-US", { ...options, year: "numeric" })}`;
}

function getEventStatus(event: Event): "live" | "upcoming" | "past" {
    const now = new Date();
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    end.setDate(end.getDate() + 1); // inclusive: event lasts through end of last day
    if (now >= start && now < end) return "live";
    if (now < start) return "upcoming";
    return "past";
}

// --- Event card ---
function EventCard({ event }: { event: Event }) {
    const status = getEventStatus(event);
    const days = Math.ceil((new Date(event.endDate).getTime() - new Date(event.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const postCount = event._count?.eventPosts ?? 0;
    const accountCount = event._count?.eventAccounts ?? 0;

    const statusBadge = status === "live" ? (
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/50 animate-pulse">Live</span>
    ) : status === "upcoming" ? (
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/50">Upcoming</span>
    ) : (
        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/20">Past</span>
    );

    return (
        <a href={`/events/${event.slug}`}
            className="block bg-white/5 rounded-xl border border-white/10 overflow-hidden no-underline hover:border-[#31dcb2]/40 transition-colors group">
            <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-white text-lg truncate">{event.name}</h3>
                    {statusBadge}
                </div>
                {event.description && (
                    <p className="text-sm text-white/60 line-clamp-2 mb-3">{event.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-white/50 mb-2">
                    <span>{getDateRange(event.startDate, event.endDate)}</span>
                    {event.location && <span>{event.location}</span>}
                </div>
                <div className="flex items-center gap-4 text-xs text-white/50">
                    <span>{days} {days === 1 ? "day" : "days"}</span>
                    {postCount > 0 && <span>{postCount} {postCount === 1 ? "post" : "posts"}</span>}
                    {accountCount > 0 && <span>{accountCount} {accountCount === 1 ? "account" : "accounts"}</span>}
                    <span className="ml-auto">by {event.createdBy.name}</span>
                </div>
            </div>
        </a>
    );
}

// --- Main content ---
function EventListContent() {
    const [tab, setTab] = useState<"community" | "your">("community");
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput), 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // Stable params for queryKey
    const params = useMemo(() => {
        const p: Record<string, string> = { tab };
        if (search) p.q = search;
        return p;
    }, [tab, search]);

    const {
        data,
        isLoading,
        isError,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch,
    } = useInfiniteQuery({
        queryKey: ["events", params] as const,
        queryFn: fetchEvents,
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.pagination.page < lastPage.pagination.totalPages
                ? lastPage.pagination.page + 1
                : undefined,
        placeholderData: keepPreviousData,
        retry: (failureCount, err) => !(err instanceof AuthRequiredError),
    });

    const isAuthError = error instanceof AuthRequiredError;
    const events = useMemo(() => data?.pages.flatMap((p) => p.events) ?? [], [data]);

    // Filter events into live, upcoming, past (only for community tab)
    const liveEvents = useMemo(() =>
        events.filter(c => getEventStatus(c) === "live"),
    [events]);
    const upcomingEvents = useMemo(() =>
        events.filter(c => getEventStatus(c) === "upcoming"),
    [events]);
    const pastEvents = useMemo(() =>
        events.filter(c => getEventStatus(c) === "past"),
    [events]);

    const hasActiveFilters = search.length > 0;

    return (
        <div>
            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 border border-white/10 w-fit">
                {[
                    { key: "community" as const, label: "Community" },
                    { key: "your" as const, label: "Your Events" },
                ].map((t) => (
                    <button key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                            tab === t.key
                                ? "bg-[#31dcb2] text-[#12384b]"
                                : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="mb-6">
                <label htmlFor="event-search" className="block text-sm font-medium text-white/80 mb-2">Search</label>
                <div className="relative">
                    <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input id="event-search" type="text" value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search events..."
                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors" />
                </div>
            </div>

            {/* Auth required */}
            {isAuthError && (
                <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/60 text-lg mb-2">Authentication Required</p>
                    <p className="text-white/40 text-sm mb-4">Please log in to see your events</p>
                    <a href="/auth/login"
                        className="inline-block bg-[#31dcb2] text-[#12384b] font-semibold px-6 py-2 rounded-lg hover:bg-[#28c4a0] transition-colors no-underline">
                        Log In
                    </a>
                </div>
            )}

            {/* Loading */}
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {Array.from({ length: 6 }).map((_, i) => (<SkeletonCard key={i} />))}
                </div>
            )}

            {/* Error */}
            {isError && !isAuthError && (
                <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/60 text-lg mb-2">Something went wrong</p>
                    <p className="text-white/40 text-sm mb-4">{error instanceof Error ? error.message : "Failed to load events"}</p>
                    <button onClick={() => refetch()}
                        className="bg-white/10 text-white px-6 py-2 rounded-lg hover:bg-white/20 transition-colors text-sm">
                        Try Again
                    </button>
                </div>
            )}

            {/* Empty */}
            {!isLoading && !isError && events.length === 0 && (
                <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/50 text-lg mb-2">No events found</p>
                    <p className="text-white/40 text-sm">
                        {tab === "community"
                            ? "No events have been published yet. Check back later!"
                            : "You haven't created any events yet."}
                    </p>
                </div>
            )}

            {/* Events sections */}
            {events.length > 0 && !hasActiveFilters && tab === "community" && (
                <>
                    {liveEvents.length > 0 && (
                        <div className="mb-8">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                Live Now
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                {liveEvents.map((c) => (<EventCard key={c.id} event={c} />))}
                            </div>
                        </div>
                    )}

                    {upcomingEvents.length > 0 && (
                        <div className="mb-8">
                            <h2 className="text-lg font-semibold text-white mb-4">Upcoming</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                {upcomingEvents.map((c) => (<EventCard key={c.id} event={c} />))}
                            </div>
                        </div>
                    )}

                    {pastEvents.length > 0 && (
                        <div className="mb-8">
                            <h2 className="text-lg font-semibold text-white mb-4">Past</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                {pastEvents.map((c) => (<EventCard key={c.id} event={c} />))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Flat list when filtered or "your" tab */}
            {(events.length > 0 && (hasActiveFilters || tab === "your")) && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {events.map((c) => (<EventCard key={c.id} event={c} />))}
                    </div>

                    {hasNextPage && (
                        <div className="flex flex-col items-center mt-8 gap-2">
                            <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
                                className="px-8 py-3 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm">
                                {isFetchingNextPage ? "Loading..." : "Load More"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// --- Wrapper ---
export default function EventList() {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
    }));
    return (
        <QueryClientProvider client={queryClient}>
            <EventListContent />
        </QueryClientProvider>
    );
}
