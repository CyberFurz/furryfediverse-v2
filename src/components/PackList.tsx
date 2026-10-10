import React, { useState, useCallback, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import PackStatusBadge from "./PackStatusBadge";
import { QueryClient, QueryClientProvider, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";

// --- Types ---
interface Pack {
    id: string;
    title: string;
    slug: string;
    description: string;
    createdAt: string;
    publishedAt: string | null;
    status?: string;
    numAccounts: number;
    splashImage: string;
    createdBy: { id: string; name: string };
    _count?: { accounts: number };
}

interface PaginationData {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
}

interface FetchPacksResponse {
    packs: Pack[];
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
async function fetchPacks({ queryKey, pageParam }: { queryKey: readonly [string, Record<string, string>]; pageParam: number }): Promise<FetchPacksResponse> {
    const [_key, params] = queryKey;
    const sp = new URLSearchParams({ ...params, page: pageParam.toString() });
    const res = await fetch(`/api/packs?${sp}`);
    if (res.status === 401) throw new AuthRequiredError();
    if (!res.ok) throw new Error("Failed to fetch packs");
    return res.json();
}

// --- Skeleton ---
function SkeletonCard() {
    return (
        <div className="bg-white/5 rounded-xl p-6 border border-white/10 animate-pulse">
            <div className="aspect-[2/1] bg-white/5 rounded-lg mb-4" />
            <div className="h-5 bg-white/10 rounded w-3/4 mb-3" />
            <div className="h-4 bg-white/10 rounded w-full mb-2" />
            <div className="h-4 bg-white/10 rounded w-2/3 mb-4" />
            <div className="flex gap-2">
                <div className="h-3 bg-white/10 rounded w-16" />
                <div className="h-3 bg-white/10 rounded w-14" />
                <div className="h-3 bg-white/10 rounded w-18" />
            </div>
        </div>
    );
}

// --- Pack card ---
function PackCard({ pack }: { pack: Pack }) {
    const accountCount = pack._count?.accounts ?? pack.numAccounts ?? 0;

    return (
        <a
            href={`/packs/${pack.slug}`}
            className="block bg-white/5 rounded-xl border border-white/10 overflow-hidden no-underline hover:border-[#31dcb2]/40 transition-colors group"
        >
            {pack.splashImage ? (
                <div className="aspect-[2/1] relative overflow-hidden">
                    <img
                        src={pack.splashImage}
                        alt={pack.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                            const img = e.currentTarget;
                            img.style.display = "none";
                            img.parentElement?.classList.add("bg-linear-to-br", "from-pink-500", "to-purple-600");
                        }}
                    />
                </div>
            ) : (
                <div className="aspect-[2/1] bg-linear-to-br from-pink-500 to-purple-600" />
            )}
            <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-white text-lg truncate">{pack.title}</h3>
                    <PackStatusBadge status={pack.status} publishedAt={pack.publishedAt} />
                </div>
                {pack.description && (
                    <p className="text-sm text-white/60 line-clamp-2 mb-3">{pack.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-white/50 mb-3">
                    <span>by {pack.createdBy.name}</span>
                    <span>{accountCount} {accountCount === 1 ? "account" : "accounts"}</span>
                </div>
                <div className="flex flex-wrap gap-2"></div>
            </div>
        </a>
    );
}

// --- Main content ---
function PackListContent() {
    const [tab, setTab] = useState<"community" | "your" | "containing">("community");
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("latest");
    const [usernameInput, setUsernameInput] = useState("");
    const [username, setUsername] = useState("");

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput), 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    // Stable params for queryKey
    const params = useMemo(() => {
        const p: Record<string, string> = { tab, order_by: sort };
        if (search) p.q = search;
        if (tab === "containing" && username) p.username = username;
        return p;
    }, [tab, sort, search, username]);

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
        queryKey: ["packs", params] as const,
        queryFn: fetchPacks,
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
            lastPage.pagination.page < lastPage.pagination.totalPages
                ? lastPage.pagination.page + 1
                : undefined,
        placeholderData: keepPreviousData,
        retry: (failureCount, err) => !(err instanceof AuthRequiredError),
    });

    const isAuthError = error instanceof AuthRequiredError;
    const packs = useMemo(() => data?.pages.flatMap((p) => p.packs) ?? [], [data]);

    const handleTabChange = useCallback((newTab: "community" | "your" | "containing") => {
        setTab(newTab);
        if (newTab !== "containing") {
            setUsername("");
            setUsernameInput("");
        }
    }, []);

    const handleUsernameSearch = useCallback(() => setUsername(usernameInput.trim()), [usernameInput]);
    const handleUsernameKeyDown = useCallback(
        (e: React.KeyboardEvent) => { if (e.key === "Enter") handleUsernameSearch(); },
        [handleUsernameSearch]
    );

    return (
        <div>
            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 border border-white/10 w-fit">
                {[
                    { key: "community" as const, label: "Community" },
                    { key: "your" as const, label: "Your Starter Packs" },
                    { key: "containing" as const, label: "Containing You" },
                ].map((t) => (
                    <button
                        key={t.key}
                        onClick={() => handleTabChange(t.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === t.key
                            ? "bg-[#31dcb2] text-[#12384b]"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Search + Sort */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                    <label htmlFor="pack-search" className="block text-sm font-medium text-white/80 mb-2">
                        Search
                    </label>
                    <div className="relative">
                        <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <input
                            id="pack-search"
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search packs..."
                            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        />
                    </div>
                </div>
                <div>
                    <label htmlFor="pack-sort" className="block text-sm font-medium text-white/80 mb-2">
                        Sort By
                    </label>
                    <select
                        id="pack-sort"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors appearance-none"
                    >
                        <option value="latest" className="bg-[#0A2B49]">Latest</option>
                        <option value="oldest" className="bg-[#0A2B49]">Oldest</option>
                    </select>
                </div>
            </div>

            {/* Username input for containing tab */}
            {tab === "containing" && (
                <div className="mb-6 p-4 bg-[#0D3559] border border-white/15 rounded-xl">
                    <label htmlFor="pack-username" className="block text-sm font-medium text-white/80 mb-2">
                        Find packs that include a fediverse profile
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="pack-username"
                            type="text"
                            value={usernameInput}
                            onChange={(e) => setUsernameInput(e.target.value)}
                            onKeyDown={handleUsernameKeyDown}
                            placeholder="@username@domain"
                            className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        />
                        <button
                            onClick={handleUsernameSearch}
                            className="shrink-0 px-4 py-3 bg-[#31dcb2] text-[#12384b] font-semibold rounded-lg hover:bg-[#28c4a0] transition-colors text-sm"
                        >
                            Search
                        </button>
                    </div>
                    {username && (
                        <p className="text-xs text-[#31dcb2] mt-2">Showing packs containing &quot;{username}&quot;</p>
                    )}
                </div>
            )}

            {/* Auth required */}
            {isAuthError && (
                <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/60 text-lg mb-2">Authentication Required</p>
                    <p className="text-white/40 text-sm mb-4">Please log in to see your starter packs</p>
                    <a
                        href="/auth/login"
                        className="inline-block bg-[#31dcb2] text-[#12384b] font-semibold px-6 py-2 rounded-lg hover:bg-[#28c4a0] transition-colors no-underline"
                    >
                        Log In
                    </a>
                </div>
            )}

            {/* Loading */}
            {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            )}

            {/* Error (non-auth) */}
            {isError && !isAuthError && (
                <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/60 text-lg mb-2">Something went wrong</p>
                    <p className="text-white/40 text-sm mb-4">
                        {error instanceof Error ? error.message : "Failed to load packs"}
                    </p>
                    <button
                        onClick={() => refetch()}
                        className="bg-white/10 text-white px-6 py-2 rounded-lg hover:bg-white/20 transition-colors text-sm"
                    >
                        Try Again
                    </button>
                </div>
            )}

            {/* Empty */}
            {!isLoading && !isError && packs.length === 0 && (
                <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/50 text-lg mb-2">No starter packs found</p>
                    <p className="text-white/40 text-sm">
                        {tab === "community"
                            ? "No packs have been published yet. Check back later!"
                            : tab === "your"
                                ? "You haven't created any starter packs yet."
                                : "No packs contain this profile. Try a different username."}
                    </p>
                </div>
            )}

            {/* Pack grid */}
            {packs.length > 0 && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {packs.map((pack) => (
                            <PackCard key={pack.id} pack={pack} />
                        ))}
                    </div>

                    {/* Load More */}
                    {hasNextPage && (
                        <div className="flex flex-col items-center mt-8 gap-2">
                            <button
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                                className="px-8 py-3 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                                {isFetchingNextPage ? "Loading..." : "Load More"}
                            </button>
                            {data?.pages[0]?.pagination && (
                                <p className="text-xs text-white/40">
                                    Showing {packs.length} of {data.pages[0].pagination.totalCount} packs
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// --- Wrapper ---
export default function PackList() {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 1000 * 60 * 5,
                        retry: 1,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            <PackListContent />
        </QueryClientProvider>
    );
}
