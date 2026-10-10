import React, { useState, useCallback, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCircleInfo, faSpinner } from "@fortawesome/free-solid-svg-icons";

// --- Types ---
interface ReviewAccount {
  id: string;
  linkedProfileId: string;
  avatar: string;
  displayName: string;
  handle: string;
  followersCount: number;
  discoverable: boolean;
}

interface ReviewResponse {
  accounts: ReviewAccount[];
  publishedAt: string | null;
  totalAccounts: number;
  discoverableCount: number;
  hiddenCount: number;
  status?: string;
  isRevision?: boolean;
  pagination: { page: number; totalCount: number; totalPages: number };
}

const PAGE_SIZE = 50;

// --- Skeleton ---
function ReviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="h-6 bg-white/10 rounded w-1/3 mb-2" />
            <div className="h-4 bg-white/10 rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="h-12 bg-white/5 rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
          <div className="w-10 h-10 bg-white/10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/10 rounded w-1/3" />
            <div className="h-3 bg-white/10 rounded w-1/2" />
          </div>
          <div className="h-6 bg-white/10 rounded w-20" />
        </div>
      ))}
    </div>
  );
}

// --- Account row ---
function ReviewAccountRow({ account }: { account: ReviewAccount }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
      {account.avatar ? (
        <img src={account.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 bg-white/10" loading="lazy" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#31dcb2]/20 shrink-0 flex items-center justify-center text-[#31dcb2] text-sm font-bold">
          {(account.displayName || "@")[0].toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-white font-semibold text-sm truncate">{account.displayName || account.handle}</p>
        <p className="text-white/50 text-xs truncate">{account.handle}</p>
      </div>
      <div className="text-xs text-white/40 shrink-0 text-right min-w-[60px]">
        {account.followersCount.toLocaleString()} followers
      </div>
      <div className="shrink-0 min-w-[100px] text-right">
        {account.discoverable ? (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
            <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
            Discoverable
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50">
            <FontAwesomeIcon icon={faCircleInfo} className="w-3 h-3" />
            Hidden
          </span>
        )}
      </div>
    </div>
  );
}

// --- Main ---
export default function ReviewPack({ slug }: { slug: string }) {
  const [accounts, setAccounts] = useState<ReviewAccount[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [discoverableCount, setDiscoverableCount] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [isRevision, setIsRevision] = useState(false);
  const [revisionStatus, setRevisionStatus] = useState<string | null>(null);
  const isPublished = publishedAt !== null;

  const fetchReview = useCallback(async (pg: number, append: boolean) => {
    const setLoad = append ? setLoadingMore : setLoading;
    setLoad(true);
    setError(null);

    try {
      const sp = new URLSearchParams({ page: pg.toString(), pageSize: PAGE_SIZE.toString() });
      const res = await fetch(`/api/packs/${slug}/review?${sp}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load review data");
      }
      const data: ReviewResponse = await res.json();
      if (append) {
        setAccounts((prev) => [...prev, ...data.accounts]);
      } else {
        setAccounts(data.accounts);
      }
      setPublishedAt(data.publishedAt ?? null);
      setIsRevision(!!data.isRevision);
      setRevisionStatus(data.isRevision ? data.status ?? null : null);
      setTotalAccounts(data.totalAccounts);
      setDiscoverableCount(data.discoverableCount);
      setHiddenCount(data.hiddenCount);
      setTotalPages(data.pagination.totalPages);
      setPage(pg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoad(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchReview(1, false);
  }, [fetchReview]);

  const handleLoadMore = useCallback(() => {
    if (page < totalPages && !loadingMore) {
      fetchReview(page + 1, true);
    }
  }, [page, totalPages, loadingMore, fetchReview]);

  // Toggle publish/unpublish. For a live pack with pending changes, this
  // submits the changes for review instead (the live pack stays up).
  const handleTogglePublish = useCallback(async () => {
    setPublishing(true);
    setPublishError(null);

    try {
      const endpoint = isRevision ? `/api/packs/${slug}/revision` : `/api/packs/${slug}/publish`;
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (isRevision ? "Failed to submit changes" : "Failed to toggle publish"));
      }
      const result = await res.json();
      // Return to the pack page after submitting changes or publishing.
      if (isRevision || result.publishedAt || result.status === "pending") {
        window.location.href = `/packs/${slug}`;
        return;
      }
      setPublishedAt(result.publishedAt ?? null);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPublishing(false);
    }
  }, [slug, isRevision]);

  const spin = (
    <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
  );

  if (loading) return <ReviewSkeleton />;

  if (error && accounts.length === 0) {
    return (
      <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
        <p className="text-white/60 text-lg mb-2">Something went wrong</p>
        <p className="text-white/40 text-sm mb-6">{error}</p>
        <button
          onClick={() => fetchReview(1, false)}
          className="bg-white/10 text-white px-6 py-2 rounded-lg hover:bg-white/20 transition-colors text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  const hasAccounts = accounts.length > 0;
  const showLoadMore = page < totalPages && hasAccounts;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      {hasAccounts && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
            <p className="text-2xl font-bold text-white">{totalAccounts}</p>
            <p className="text-xs text-white/50 mt-1">Total Accounts</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
            <p className="text-2xl font-bold text-emerald-300">{discoverableCount}</p>
            <p className="text-xs text-white/50 mt-1">Discoverable</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
            <p className="text-2xl font-bold text-amber-300">{hiddenCount}</p>
            <p className="text-xs text-white/50 mt-1">Hidden</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasAccounts && (
        <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
          <p className="text-white/50 text-lg mb-1">No accounts in this pack</p>
          <p className="text-white/30 text-sm mb-6">Add some accounts before publishing</p>
          <a
            href={`/packs/${slug}/accounts`}
            className="inline-block bg-[#31dcb2] text-[#12384b] font-semibold px-6 py-2 rounded-lg hover:bg-[#28c4a0] transition-colors no-underline"
          >
            Add Accounts
          </a>
        </div>
      )}

      {/* Account list */}
      {hasAccounts && (
        <div className="space-y-3">
          {accounts.map((account) => (
            <ReviewAccountRow key={account.id || account.linkedProfileId} account={account} />
          ))}
        </div>
      )}

      {/* Load more */}
      {showLoadMore && (
        <div className="flex flex-col items-center mt-4 gap-2">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="px-8 py-3 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
          <p className="text-xs text-white/40">
            Showing {accounts.length} of {totalAccounts} accounts
          </p>
        </div>
      )}

      {/* Publish error */}
      {publishError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{publishError}</div>
      )}

      {isRevision && (
        <div className="p-3 rounded-lg border bg-sky-500/10 border-sky-500/30 text-sky-100 text-sm">
          You're reviewing pending changes to a live pack. The published version stays up until these changes are approved.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        {hasAccounts && (
          <button
            onClick={handleTogglePublish}
            disabled={publishing || (isRevision && revisionStatus === "pending")}
            className="flex-1 py-3 bg-[#31dcb2] text-[#12384b] font-semibold rounded-lg hover:bg-[#28c4a0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base"
          >
            {publishing ? (
              <span className="flex items-center justify-center gap-2">
                {spin}
                {isRevision ? "Submitting..." : isPublished ? "Unpublishing..." : "Publishing..."}
              </span>
            ) : isRevision ? (
              revisionStatus === "pending" ? "Changes Awaiting Review" : "Submit Changes for Review"
            ) : isPublished ? (
              "Unpublish"
            ) : (
              "Publish"
            )}
          </button>
        )}
        <a
          href={`/packs/${slug}/accounts`}
          className="px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm no-underline text-center"
        >
          Add More Accounts
        </a>
      </div>
    </div>
  );
}
