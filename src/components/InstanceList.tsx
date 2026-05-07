import React, { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider, useQuery, keepPreviousData } from "@tanstack/react-query";

interface Instance {
    id: string;
    domain: string;
    instanceType: string;
    title: string;
    description: string;
    thumbnail: string | null;
    thumbnailPath: string | null;
    userCount: number;
    instanceContact: string | null;
    registrations: boolean;
    approvalRequired: boolean;
    nsfwAllowed: boolean;
    country: string | null;
    primaryLanguage: string | null;
    donationLink: string | null;
    customInviteLink: string | null;
    verified: boolean;
    createdAt: string;
    updatedAt: string;
}

interface PaginationData {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
}

interface FetchInstancesResponse {
    instances: Instance[];
    pagination: PaginationData;
}

const typeLabels: Record<string, string> = {
    mastodon: "Mastodon",
    misskey: "Misskey Compatible",
    funkwhale: "Funkwhale",
    pixelfed: "Pixelfed"
};

const typeColors: Record<string, string> = {
    mastodon: "bg-purple-500/20 text-purple-300 border-purple-500/50",
    misskey: "bg-blue-500/20 text-blue-300 border-blue-500/50",
    funkwhale: "bg-green-500/20 text-green-300 border-green-500/50",
};

async function fetchInstances({ queryKey }: { queryKey: [string, Record<string, string>] }): Promise<FetchInstancesResponse> {
    const [_key, params] = queryKey;
    const searchParams = new URLSearchParams(params);
    const response = await fetch(`/api/instances?${searchParams}`);
    if (!response.ok) {
        throw new Error("Failed to fetch instances");
    }
    return response.json();
}

function shuffleInstances(instances: Instance[]): Instance[] {
    const shuffled = [...instances];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

function InstanceCard({ instance }: { instance: Instance }) {
    const typeColor = typeColors[instance.instanceType] || "bg-white/10 text-white/70 border-white/30";
    const cardLink = instance.customInviteLink || `https://${instance.domain}`;

    const handleCardClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("a")) return;
        window.open(cardLink, "_blank", "noopener,noreferrer");
    };

    return (
        <div
            onClick={handleCardClick}
            className="rounded-md bg-[#0D3559] border border-white/10 hover:border-[#31dcb2]/50 transition-colors overflow-hidden flex flex-col sm:flex-row cursor-pointer group"
        >
            {instance.thumbnailPath || instance.thumbnail ? (
                <div className="w-full sm:w-80 shrink-0 aspect-40/21 relative overflow-hidden">
                    <img
                        src={instance.thumbnailPath || instance.thumbnail || undefined}
                        alt={instance.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                    />
                </div>
            ) : (
                <div className="w-full sm:w-80 shrink-0 aspect-40/21 bg-linear-to-br from-[#1a4a70] to-[#0D3559] flex items-center justify-center">
                    <svg className="w-16 h-16 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                </div>
            )}
            <div className="flex-1 min-w-0 p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="font-bold text-white text-lg truncate">{instance.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded border ${typeColor}`}>
                        {typeLabels[instance.instanceType] || instance.instanceType}
                    </span>
                    {instance.registrations && (
                        <span className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
                            Open
                        </span>
                    )}
                    {instance.nsfwAllowed && (
                        <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-300 border border-orange-500/50">
                            NSFW Allowed
                        </span>
                    )}
                </div>
                <p className="text-sm text-[#31dcb2] mb-2">{instance.domain}</p>
                {instance.description && (
                    <p className="text-sm text-white/60 line-clamp-2 mb-3">{instance.description}</p>
                )}
                <div className="flex gap-4 text-xs text-white/50 flex-wrap mb-3">
                    <span>👥 {instance.userCount?.toLocaleString() || 0} users</span>
                    {instance.country && <span>📍 {instance.country}</span>}
                    {instance.primaryLanguage && <span>🌐 {instance.primaryLanguage}</span>}
                </div>
                {instance.donationLink && (
                    <div className="pt-3 border-t border-white/10">
                        <a
                            href={instance.donationLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-[#31dcb2] hover:underline flex items-center gap-1"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            Support this instance
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

function SkeletonCard() {
    return (
        <div className="rounded-md bg-[#0D3559] border border-white/10 animate-pulse overflow-hidden flex flex-col sm:flex-row">
            <div className="w-full sm:w-80 shrink-0 aspect-40/21 bg-white/5" />
            <div className="flex-1 min-w-0 p-4 space-y-3">
                <div className="h-6 bg-white/10 rounded w-48" />
                <div className="h-4 bg-white/10 rounded w-32" />
                <div className="h-4 bg-white/10 rounded w-full" />
                <div className="flex gap-4">
                    <div className="h-3 bg-white/10 rounded w-20" />
                    <div className="h-3 bg-white/10 rounded w-20" />
                </div>
            </div>
        </div>
    );
}

export default function InstanceList() {
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
            <InstanceListContent />
        </QueryClientProvider>
    );
}

function InstanceListContent() {
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [regFilter, setRegFilter] = useState("all");
    const [page, setPage] = useState(1);

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
    }, []);

    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        setTypeFilter(e.target.value);
        setPage(1);
    }, []);

    const handleRegChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        setRegFilter(e.target.value);
        setPage(1);
    }, []);

    const params: Record<string, string> = {
        search: debouncedSearch,
        type: typeFilter,
        registrations: regFilter,
        page: page.toString(),
        limit: "20",
    };

    const { data, isLoading, isPlaceholderData } = useQuery({
        queryKey: ["instances", params] as const,
        queryFn: fetchInstances,
        placeholderData: keepPreviousData,
    });

    const randomizedInstances = React.useMemo(() => {
        if (!data?.instances) {
            return [];
        }

        return shuffleInstances(data.instances);
    }, [data?.instances]);

    return (
        <div>
            <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="instance-search" className="block text-sm font-medium text-white/80 mb-2">
                            Search
                        </label>
                        <input
                            id="instance-search"
                            type="text"
                            value={search}
                            onChange={handleSearchChange}
                            placeholder="Search by name, domain, or description..."
                            className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        />
                    </div>
                    <div>
                        <label htmlFor="instance-type-filter" className="block text-sm font-medium text-white/80 mb-2">
                            Type
                        </label>
                        <select
                            id="instance-type-filter"
                            value={typeFilter}
                            onChange={handleTypeChange}
                            className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors appearance-none"
                        >
                            <option value="all" className="bg-[#0A2B49]">All Types</option>
                            <option value="mastodon" className="bg-[#0A2B49]">Mastodon</option>
                            <option value="misskey" className="bg-[#0A2B49]">Misskey Compatible</option>
                            <option value="funkwhale" className="bg-[#0A2B49]">Funkwhale</option>
                            <option value="pixelfed" className="bg-#0A2B49]">Pixelfed</option>"
                        </select>
                    </div>
                    <div>
                        <label htmlFor="instance-reg-filter" className="block text-sm font-medium text-white/80 mb-2">
                            Registration
                        </label>
                        <select
                            id="instance-reg-filter"
                            value={regFilter}
                            onChange={handleRegChange}
                            className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors appearance-none"
                        >
                            <option value="all" className="bg-[#0A2B49]">All</option>
                            <option value="open" className="bg-[#0A2B49]">Open Registration</option>
                        </select>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            ) : randomizedInstances.length > 0 ? (
                <>
                    <div className="space-y-4">
                        {randomizedInstances.map((instance) => (
                            <InstanceCard key={instance.id} instance={instance} />
                        ))}
                    </div>

                    {data.pagination.totalPages > 1 && (
                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                            <p className="text-sm text-white/50">
                                Showing {((data.pagination.page - 1) * data.pagination.limit) + 1}-
                                {Math.min(data.pagination.page * data.pagination.limit, data.pagination.totalCount)} of{" "}
                                {data.pagination.totalCount} instances
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                                    disabled={isPlaceholderData || page >= data.pagination.totalPages}
                                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-16">
                    <p className="text-white/50 text-lg">No instances found</p>
                    <p className="text-white/40 text-sm mt-2">Try adjusting your filters or check back later</p>
                </div>
            )}
        </div>
    );
}
