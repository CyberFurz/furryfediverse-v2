import React, { useState, useCallback, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCheck, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import type { RemoteAccount } from "@/lib/social/remote-accounts";

// --- Types ---
interface SearchResult {
  linkedProfileId: string;
  avatar: string;
  displayName: string;
  handle: string;
  followersCount: number;
  inStarterPack: boolean;
}

interface HandleAccount {
  id: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface SearchResponse {
  accounts: SearchResult[];
  handleAccounts: HandleAccount[];
  remoteAccounts: RemoteAccount[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  packAccountCount: number;
}

interface ToggleResponse {
  inStarterPack: boolean;
  numAccounts: number;
}

const MAX = 150;
const PAGE_SIZE = 50;

// --- Icons ---
const spin = <FontAwesomeIcon icon={faSpinner} spin className="w-3 h-3 text-white/60" />;

const checkIcon = <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-[#12384b]" />;

const searchIcon = <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />;

const emptyIcon = <FontAwesomeIcon icon={faMagnifyingGlass} className="w-12 h-12 text-white/20 mx-auto mb-4" />;

// --- Skeleton ---
function SearchSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-12 bg-white/5 rounded-lg" />
      <div className="h-4 bg-white/10 rounded w-1/3" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
          <div className="w-10 h-10 bg-white/10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/10 rounded w-1/3" />
            <div className="h-3 bg-white/10 rounded w-1/2" />
          </div>
          <div className="h-3 bg-white/10 rounded w-16" />
        </div>
      ))}
    </div>
  );
}

// --- Account row ---
function AccountRow({ a, toggling, status, onToggle }: {
  a: SearchResult; toggling: boolean; status: string | null; onToggle: () => void;
}) {
  const label = status === "adding" ? "Adding..." : status === "added" ? "Added"
    : status === "removing" ? "Removing..." : status === "removed" ? "Removed" : null;

  return (
    <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-colors">
      {a.avatar ? (
        <img src={a.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 bg-white/10" loading="lazy" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#31dcb2]/20 shrink-0 flex items-center justify-center text-[#31dcb2] text-sm font-bold">
          {(a.displayName || "@")[0].toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-white font-semibold text-sm truncate">{a.displayName || a.handle}</p>
        <p className="text-white/50 text-xs truncate">{a.handle}</p>
      </div>
      <div className="text-xs text-white/40 shrink-0 text-right min-w-[60px]">{a.followersCount.toLocaleString()} followers</div>
      <div className="shrink-0 flex items-center gap-2 min-w-[90px] justify-end">
        <button onClick={onToggle} disabled={toggling}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            toggling ? "border-white/20 cursor-not-allowed"
              : a.inStarterPack ? "bg-[#31dcb2] border-[#31dcb2] hover:bg-[#28c4a0]"
              : "border-white/30 hover:border-[#31dcb2] hover:bg-[#31dcb2]/10"
          }`}
          aria-label={a.inStarterPack ? "Remove from pack" : "Add to pack"}
        >
          {toggling ? spin : a.inStarterPack ? checkIcon : null}
        </button>
        {label && (
          <span className={`text-xs font-medium ${
            status === "added" ? "text-[#31dcb2]" : status === "removed" ? "text-amber-400" : "text-white/50"
          }`}>{label}</span>
        )}
      </div>
    </div>
  );
}

// --- Main ---
export default function PackAccounts({ slug }: { slug: string }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalInPack, setTotalInPack] = useState(0);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [handleAccounts, setHandleAccounts] = useState<HandleAccount[]>([]);
  const [remoteAccounts, setRemoteAccounts] = useState<RemoteAccount[]>([]);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [statuses, setStatuses] = useState<Record<string, "added" | "removed">>({});

  // Fetch actual pack count and handle accounts on mount
  const refreshPackData = useCallback(async () => {
    try {
      const [packRes, acctsRes] = await Promise.all([
        fetch(`/api/packs/${slug}?following=0`),
        fetch(`/api/packs/${slug}/accounts`),
      ]);
      const packData = await packRes.json();
      if (packData.numAccounts !== undefined) setTotalInPack(packData.numAccounts);
      const acctsData = await acctsRes.json();
      setHandleAccounts(acctsData.handleAccounts || []);
    } catch { /* ignore */ }
  }, [slug]);

  useEffect(() => { refreshPackData(); }, [refreshPackData]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const doSearch = useCallback(async (q: string, pg: number, append: boolean) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    const setLoad = append ? setLoadingMore : setLoading;
    setLoad(true); setError(null); setSearched(true);
    try {
      const sp = new URLSearchParams({ q: q.trim(), page: pg.toString(), pageSize: PAGE_SIZE.toString() });
      const res = await fetch(`/api/packs/${slug}/accounts?${sp}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to search accounts");
      const d: SearchResponse = await res.json();
      setResults(d.accounts || []);
      setHandleAccounts(d.handleAccounts || []);
      setRemoteAccounts(d.remoteAccounts || []);
      setTotalCount(d.totalCount);
      setTotalPages(d.totalPages);
      setPage(pg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setLoad(false); }
  }, [slug]);

  useEffect(() => { doSearch(debounced, 1, false); }, [debounced, doSearch]);

  const handleLoadMore = useCallback(() => {
    if (page < totalPages && !loadingMore) doSearch(debounced, page + 1, true);
  }, [page, totalPages, loadingMore, debounced, doSearch]);

  const handleToggle = useCallback(async (acct: SearchResult) => {
    if (toggling[acct.linkedProfileId]) return;
    if (!acct.inStarterPack && totalInPack >= MAX) {
      setError(`Maximum of ${MAX} accounts reached. Remove an account before adding more.`);
      return;
    }
    setToggling((p) => ({ ...p, [acct.linkedProfileId]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/packs/${slug}/accounts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedProfileId: acct.linkedProfileId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to update account");
      const d: ToggleResponse = await res.json();
      setResults((prev) => prev.map((r) => r.linkedProfileId === acct.linkedProfileId ? { ...r, inStarterPack: d.inStarterPack } : r));
      setTotalInPack(d.numAccounts);
      const action = d.inStarterPack ? "added" : "removed";
      setStatuses((p) => ({ ...p, [acct.linkedProfileId]: action }));
      setTimeout(() => setStatuses((p) => { const n = { ...p }; delete n[acct.linkedProfileId]; return n; }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setToggling((p) => ({ ...p, [acct.linkedProfileId]: false })); }
  }, [slug, toggling, totalInPack]);

  const handleRemoveHandle = useCallback(async (acct: HandleAccount) => {
    const h = acct.handle;
    if (toggling[h]) return;
    setToggling((p) => ({ ...p, [h]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/packs/${slug}/accounts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: h }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to remove account");
      const d = await res.json();
      setHandleAccounts((prev) => prev.filter((a) => a.handle !== h));
      if (d.numAccounts !== undefined) {
        setTotalInPack(d.numAccounts);
      } else {
        setTotalInPack((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setToggling((p) => ({ ...p, [h]: false })); }
  }, [slug, toggling]);

  const handleToggleRemote = useCallback(async (acct: RemoteAccount) => {
    const h = acct.handle;
    if (toggling[h]) return;
    if (!acct.inStarterPack && totalInPack >= MAX) {
      setError(`Maximum of ${MAX} accounts reached. Remove an account before adding more.`);
      return;
    }
    setToggling((p) => ({ ...p, [h]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/packs/${slug}/accounts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: h,
          displayName: acct.displayName,
          avatarUrl: acct.avatar,
          profileUrl: acct.profileUrl,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to update account");
      const d: ToggleResponse = await res.json();
      setRemoteAccounts((prev) => prev.map((r) => r.handle === h ? { ...r, inStarterPack: d.inStarterPack } : r));
      setTotalInPack(d.numAccounts);
      // Refresh handle-based accounts so the row appears/disappears there too
      refreshPackData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setToggling((p) => ({ ...p, [h]: false })); }
  }, [slug, toggling, totalInPack, refreshPackData]);

  const pct = Math.min((totalInPack / MAX) * 100, 100);
  const atLimit = totalInPack >= MAX;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white/80 font-medium">{totalInPack} of {MAX} accounts used</span>
          <span className={`text-xs font-medium ${atLimit ? "text-amber-400" : "text-white/50"}`}>
            {atLimit ? "Full" : `${Math.round(pct)}%`}
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
          <div className={`h-2 rounded-full transition-all duration-300 ${atLimit ? "bg-amber-400" : "bg-[#31dcb2]"}`} style={{ width: `${pct}%` }} />
        </div>
        {atLimit && <p className="text-amber-400 text-xs mt-2">Maximum account limit reached. Remove some accounts to add more.</p>}
        {totalInPack > 0 && (
          <p className="text-white/40 text-xs mt-3">
            Accounts imported via CSV are stored as handles, so they won't show avatars or bios yet,
            but <strong className="text-white/60">you can still follow them</strong> once the pack is published.
          </p>
        )}
      </div>

      {/* Search */}
      <div>
        <div className="relative">
          {searchIcon}
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by @user@instance or display name..."
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors" />
        </div>
        {debounced && <p className="text-xs text-white/40 mt-2">{loading ? "Searching..." : `${totalCount} result${totalCount !== 1 ? "s" : ""} found`}</p>}
      </div>

      {/* Error */}
      {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

      {/* Loading */}
      {loading && <SearchSkeleton />}

      {/* Empty initial */}
      {!loading && !searched && (
        <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
          {emptyIcon}
          <p className="text-white/50 text-lg mb-1">Search for accounts to add...</p>
          <p className="text-white/30 text-sm">Type a fediverse handle or display name to find accounts</p>
        </div>
      )}

      {/* Empty results */}
      {!loading && searched && results.length === 0 && (
        <div className="text-center py-16 bg-white/5 rounded-xl border border-white/10">
          <p className="text-white/50 text-lg mb-1">No results</p>
          <p className="text-white/30 text-sm">Try a different search term or check the spelling</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((a) => (
            <AccountRow key={a.linkedProfileId} a={a}
              toggling={!!toggling[a.linkedProfileId]}
              status={statuses[a.linkedProfileId] || null}
              onToggle={() => handleToggle(a)} />
          ))}
        </div>
      )}

      {/* Load more */}
      {page < totalPages && results.length > 0 && (
        <div className="flex flex-col items-center mt-4 gap-2">
          <button onClick={handleLoadMore} disabled={loadingMore}
            className="px-8 py-3 bg-white/5 border border-white/20 text-white/80 rounded-lg hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm">
            {loadingMore ? "Loading..." : "Load More"}
          </button>
          <p className="text-xs text-white/40">Showing {results.length} of {totalCount} accounts</p>
        </div>
      )}

      {/* Remote accounts found via instance search / @user@domain lookup */}
      {remoteAccounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">
            Remote accounts found
          </h3>
          {remoteAccounts
            .filter((ra) => !results.some((r) => r.handle === ra.handle))
            .map((remoteAccount) => (
              <div key={remoteAccount.handle} className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-colors">
                {remoteAccount.avatar ? (
                  <img src={remoteAccount.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 bg-white/10" loading="lazy" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#31dcb2]/20 shrink-0 flex items-center justify-center text-[#31dcb2] text-sm font-bold">
                    {(remoteAccount.displayName || "@")[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold text-sm truncate">{remoteAccount.displayName}</p>
                  <p className="text-white/50 text-xs truncate">@{remoteAccount.handle}</p>
                </div>
                <div className="text-xs text-white/40 shrink-0 text-right min-w-[60px]">
                  {remoteAccount.followersCount.toLocaleString()} followers
                </div>
                <div className="shrink-0 flex items-center gap-2 min-w-[90px] justify-end">
                  <button onClick={() => handleToggleRemote(remoteAccount)} disabled={!!toggling[remoteAccount.handle]}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      toggling[remoteAccount.handle] ? "border-white/20 cursor-not-allowed"
                        : remoteAccount.inStarterPack ? "bg-[#31dcb2] border-[#31dcb2] hover:bg-[#28c4a0]"
                        : "border-white/30 hover:border-[#31dcb2] hover:bg-[#31dcb2]/10"
                    }`}
                    aria-label={remoteAccount.inStarterPack ? "Remove from pack" : "Add to pack"}
                  >
                    {toggling[remoteAccount.handle] ? spin : remoteAccount.inStarterPack ? checkIcon : null}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Handle-based accounts (only when not searching) */}
      {!debounced && handleAccounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">
            Handle-based accounts ({handleAccounts.length})
          </h3>
          {handleAccounts.map((acct) => (
            <div key={acct.handle} className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-colors">
              {acct.avatarUrl ? (
                <img src={acct.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 bg-white/10" loading="lazy" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#31dcb2]/20 shrink-0 flex items-center justify-center text-[#31dcb2] text-sm font-bold">
                  {(acct.displayName || "@")[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm truncate">{acct.displayName || acct.handle}</p>
                <p className="text-white/50 text-xs truncate">@{acct.handle}</p>
              </div>
              <button onClick={() => handleRemoveHandle(acct)} disabled={!!toggling[acct.handle]}
                className="p-1.5 text-white/40 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-white/5"
                aria-label={`Remove ${acct.handle}`}
              >
                {toggling[acct.handle] ? spin : (
                  <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
