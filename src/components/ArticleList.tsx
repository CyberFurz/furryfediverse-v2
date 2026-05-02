import React, { useState, useCallback, useEffect } from "react";
import { QueryClient, QueryClientProvider, useQuery, keepPreviousData } from "@tanstack/react-query";

interface Article {
    id: string;
    title: string;
    content: string;
    category: string;
    author: {
        name: string;
    };
    createdAt: string;
}

interface FetchArticlesResponse {
    articles: Article[];
}

const categoryLabels: Record<string, string> = {
    "self-hosting": "Self-Hosting",
    "how-to": "How To",
    "other": "Other",
};

const categoryColors: Record<string, string> = {
    "self-hosting": "bg-purple-500/20 text-purple-300 border-purple-500/50",
    "how-to": "bg-blue-500/20 text-blue-300 border-blue-500/50",
    "other": "bg-green-500/20 text-green-300 border-green-500/50",
};

async function fetchArticles({ queryKey }: { queryKey: [string, Record<string, string>] }): Promise<FetchArticlesResponse> {
    const [_key, params] = queryKey;
    const searchParams = new URLSearchParams(params);
    const response = await fetch(`/api/learn?${searchParams}`);
    if (!response.ok) {
        throw new Error("Failed to fetch articles");
    }
    return response.json();
}

function ArticleCard({ article }: { article: Article }) {
    const categoryColor = categoryColors[article.category] || "bg-white/10 text-white/70 border-white/30";
    const plainText = article.content.replace(/<[^>]*>/g, "").substring(0, 200);
    const preview = plainText + (article.content.replace(/<[^>]*>/g, "").length > 200 ? "..." : "");

    const handleCardClick = () => {
        window.location.href = `/learn/view/${article.id}`;
    };

    return (
        <div
            onClick={handleCardClick}
            className="rounded-md bg-[#0D3559] border border-white/10 hover:border-white/20 transition-colors p-4 cursor-pointer"
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="font-bold text-white text-lg">{article.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded border ${categoryColor}`}>
                        {categoryLabels[article.category] || article.category}
                    </span>
                </div>
                <p className="text-xs text-white/40 mb-2">
                    By {article.author.name} · {new Date(article.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
                <p className="text-sm text-white/60 line-clamp-3">{escapeHtml(preview)}</p>
            </div>
        </div>
    );
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function SkeletonCard() {
    return (
        <div className="rounded-md bg-[#0D3559] border border-white/10 animate-pulse p-4">
            <div className="space-y-3">
                <div className="h-6 bg-white/10 rounded w-48" />
                <div className="h-4 bg-white/10 rounded w-32" />
                <div className="h-4 bg-white/10 rounded w-full" />
                <div className="h-4 bg-white/10 rounded w-2/3" />
            </div>
        </div>
    );
}

export default function ArticleList() {
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
            <ArticleListContent />
        </QueryClientProvider>
    );
}

function ArticleListContent() {
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const handleCategoryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        setCategoryFilter(e.target.value);
    }, []);

    const params: Record<string, string> = {
        search: debouncedSearch,
        category: categoryFilter,
    };

    const { data, isLoading } = useQuery({
        queryKey: ["articles", params] as const,
        queryFn: fetchArticles,
        placeholderData: keepPreviousData,
    });

    return (
        <div>
            <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="article-search" className="block text-sm font-medium text-white/80 mb-2">
                            Search
                        </label>
                        <input
                            id="article-search"
                            type="text"
                            value={search}
                            onChange={handleSearchChange}
                            placeholder="Search articles..."
                            className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        />
                    </div>
                    <div>
                        <label htmlFor="category-filter" className="block text-sm font-medium text-white/80 mb-2">
                            Category
                        </label>
                        <select
                            id="category-filter"
                            value={categoryFilter}
                            onChange={handleCategoryChange}
                            className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors appearance-none"
                        >
                            <option value="all" className="bg-[#0A2B49]">All Categories</option>
                            <option value="self-hosting" className="bg-[#0A2B49]">Self-Hosting</option>
                            <option value="how-to" className="bg-[#0A2B49]">How To</option>
                            <option value="other" className="bg-[#0A2B49]">Other</option>
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
            ) : data?.articles && data.articles.length > 0 ? (
                <div className="space-y-4">
                    {data.articles.map((article) => (
                        <ArticleCard key={article.id} article={article} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-16">
                    <p className="text-white/50 text-lg">No articles found</p>
                    <p className="text-white/40 text-sm mt-2">Check back later for new content</p>
                </div>
            )}
        </div>
    );
}
