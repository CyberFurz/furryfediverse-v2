import React, { useState, useCallback, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCheck, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import type { RemoteAccount, RemoteLookupScopeStatus } from "@/lib/social/remote-accounts";
import { isBlueskyBridgedHandle } from "@/lib/social/handles";
import { BLUESKY_CARD_CLASSES, BlueskyAvatarBadge, BlueskyLabel } from "./BlueskyBadge";

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
  scopeStatus: RemoteLookupScopeStatus | null;
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

// --- Permissions banner ---
function ScopeBanner({ status, slug }: { status: RemoteLookupScopeStatus | null; slug: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!status) {
    return (
      <div className="p-4 bg-amber-500/10 border border-amber-400/40 rounded-xl text-sm">
        <p className="text-amber-200 font-semibold mb-1">Link a fediverse account to search other servers</p>
        <p className="text-amber-100/80 text-xs">
          Searching for accounts on other servers (and Bluesky accounts bridged to the fediverse) runs through your own
          fediverse account. <a href="/auth/links" className="text-[#31dcb2] underline">Link an account</a> to enable it.
        </p>
      </div>
    );
  }
  if (status.missingScopes.length === 0) return null;

  const reauthorize = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/auth/link/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow: "reauthorize", linkedProfileId: status.linkedProfileId, returnTo: `/packs/${slug}/accounts` }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to start re-authorization");
      window.location.href = d.authUrl;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="p-4 bg-amber-500/10 border border-amber-400/40 rounded-xl">
      <p className="text-amber-200 text-sm font-semibold mb-1">Re-authorize @{status.handle} to search other servers</p>
      <p className="text-amber-100/80 text-xs mb-3">
        Searching runs through your account on <strong>{status.instanceDomain}</strong>. It hasn't granted these permissions yet,
        so accounts your server hasn't seen before (including bridged Bluesky accounts) won't show up:
      </p>
      <ul className="space-y-2 mb-3">
        {status.missingScopes.map((m) => (
          <li key={m.scope} className="text-xs">
            <span className="text-white font-semibold">{m.label}</span>
            <code className="ml-1 text-[10px] text-white/50 bg-white/10 px-1 py-0.5 rounded">{m.scope}</code>
            <p className="text-white/70 mt-0.5">{m.purpose}</p>
          </li>
        ))}
      </ul>
      <p className="text-white/50 text-xs mb-3">
        You'll approve this on {status.instanceDomain} and come right back here. We never post, read your messages, or change your profile.
      </p>
      <button onClick={reauthorize} disabled={busy}
        className="text-xs bg-[#31dcb2] text-[#12384b] font-semibold hover:bg-[#28c4a0] disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
        {busy ? "Redirecting..." : `Re-authorize on ${status.instanceDomain}`}
      </button>
      {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
    </div>
  );
}

// --- Avatar / row helpers ---
function RowAvatar({ src, name, bluesky }: { src?: string | null; name?: string | null; bluesky: boolean }) {
  return (
    <div className="relative shrink-0">
      {src ? (
        <img src={src} alt="" className="w-10 h-10 rounded-full object-cover bg-white/10" loading="lazy" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#31dcb2]/20 flex items-center justify-center text-[#31dcb2] text-sm font-bold">
          {(name || "@")[0].toUpperCase()}
        </div>
      )}
      {bluesky && <BlueskyAvatarBadge />}
    </div>
  );
}

function RowName({ name, bluesky }: { name: string; bluesky: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <p className="text-white font-semibold text-sm truncate">{name}</p>
      {bluesky && <BlueskyLabel />}
    </div>
  );
}

const rowClasses = (bluesky: boolean) =>
  `flex items-center gap-3 p-4 rounded-xl border transition-colors ${
    bluesky ? BLUESKY_CARD_CLASSES : "bg-white/5 border-white/10 hover:border-white/20"
  }`;

// --- Account row ---
function AccountRow({ a, toggling, status, onToggle }: {
  a: SearchResult; toggling: boolean; status: string | null; onToggle: () => void;
}) {
  const label = status === "adding" ? "Adding..." : status === "added" ? "Added"
    : status === "removing" ? "Removing..." : status === "removed" ? "Removed" : null;

  const bluesky = isBlueskyBridgedHandle(a.handle);
  return (
    <div className={rowClasses(bluesky)}>
      <RowAvatar src={a.avatar} name={a.displayName} bluesky={bluesky} />
      <div className="min-w-0 flex-1">
        <RowName name={a.displayName || a.handle} bluesky={bluesky} />
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
  const [editingLive, setEditingLive] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, "added" | "removed">>({});
  const [scopeStatus, setScopeStatus] = useState<RemoteLookupScopeStatus | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  // Result of returning from a re-authorization redirect
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("success") === "reauthorized") setNotice("Permissions updated. You can now search accounts on other servers, including bridged Bluesky accounts.");
    else if (sp.get("error") === "reauthorize_account_mismatch") setError("Re-authorization failed: you approved a different account than the one linked here. Sign in as that account on your server and try again.");
    if (sp.has("success") || sp.has("error")) {
      sp.delete("success"); sp.delete("error");
      const qs = sp.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  // Fetch actual pack count and handle accounts on mount
  const refreshPackData = useCallback(async () => {
    try {
      const [packRes, acctsRes] = await Promise.all([
        fetch(`/api/packs/${slug}?following=0&draft=1`),
        fetch(`/api/packs/${slug}/accounts`),
      ]);
      const packData = await packRes.json();
      if (packData.numAccounts !== undefined) setTotalInPack(packData.numAccounts);
      setEditingLive(!!packData.revision || (packData.status === "approved" && !!packData.published_at));
      const acctsData = await acctsRes.json();
      setHandleAccounts(acctsData.handleAccounts || []);
      if ("scopeStatus" in acctsData) setScopeStatus(acctsData.scopeStatus);
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
      if ("scopeStatus" in d) setScopeStatus(d.scopeStatus);
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

      {editingLive && (
        <div className="p-3 rounded-lg border bg-sky-500/10 border-sky-500/30 text-sky-100 text-sm">
          This pack is live. Account changes are saved as pending changes and won't affect the published pack until
          you <a href={`/packs/${slug}`} className="underline text-sky-200">submit them for review</a> and they're approved.
        </div>
      )}
      {notice && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm">{notice}</div>}
      {scopeStatus !== undefined && <ScopeBanner status={scopeStatus} slug={slug} />}

      {/* Search */}
      <div>
        <div className="relative">
          {searchIcon}
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by @user@instance, Bluesky handle, or display name..."
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
          <p className="text-white/30 text-xs mt-2">
            Bluesky accounts bridged via Bridgy Fed can be added too — enter their Bluesky handle (e.g. alice.bsky.social).
          </p>
        </div>
      )}

      {/* Empty results */}
      {!loading && searched && results.length === 0 && remoteAccounts.length === 0 && (
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
            .map((remoteAccount) => {
              const bluesky = isBlueskyBridgedHandle(remoteAccount.handle);
              return (
              <div key={remoteAccount.handle} className={rowClasses(bluesky)}>
                <RowAvatar src={remoteAccount.avatar} name={remoteAccount.displayName} bluesky={bluesky} />
                <div className="min-w-0 flex-1">
                  <RowName name={remoteAccount.displayName || remoteAccount.handle} bluesky={bluesky} />
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
              );
            })}
        </div>
      )}

      {/* Handle-based accounts (only when not searching) */}
      {!debounced && handleAccounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">
            Handle-based accounts ({handleAccounts.length})
          </h3>
          {handleAccounts.map((acct) => {
            const bluesky = isBlueskyBridgedHandle(acct.handle);
            return (
            <div key={acct.handle} className={rowClasses(bluesky)}>
              <RowAvatar src={acct.avatarUrl} name={acct.displayName} bluesky={bluesky} />
              <div className="min-w-0 flex-1">
                <RowName name={acct.displayName || acct.handle} bluesky={bluesky} />
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
            );
          })}
        </div>
      )}
    </div>
  );
}
