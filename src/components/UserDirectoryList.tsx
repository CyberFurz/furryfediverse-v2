import React, { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

type DirProfile = {
  id: string;
  platform: string;
  instanceDomain: string;
  displayName: string | null;
  username: string;
  acct: string;
  avatarUrl: string | null;
  headerUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  statusesCount: number;
  profileUrl: string | null;
  isPrimaryNsfw: boolean;
  hashtags: Array<{ id: string; normalizedTag: string }>;
};

function sanitizeProfileHtml(input: string | null | undefined): string {
  if (!input) return "";

  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/\sstyle\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\sstyle\s*=\s*[^\s>]+/gi, "")
    .replace(/href\s*=\s*(['"])javascript:[\s\S]*?\1/gi, "href=\"#\"");
}

async function fetchProfiles(search: string): Promise<DirProfile[]> {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  const res = await fetch(`/api/users?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load users");
  const json = await res.json();
  return json.data || [];
}

function shuffleProfiles(profiles: DirProfile[]): DirProfile[] {
  const shuffled = [...profiles];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function DirectoryGrid() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [hideNsfw, setHideNsfw] = useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["user-directory", search],
    queryFn: () => fetchProfiles(search),
    staleTime: 1000 * 60,
  });

  const profiles = useMemo(() => {
    const base = data ?? [];
    const filtered = hideNsfw ? base.filter((p) => !p.isPrimaryNsfw) : base;
    return shuffleProfiles(filtered);
  }, [data, hideNsfw]);

  return (
    <div>
      <div className="mb-6">
        <label htmlFor="user-search" className="block text-sm font-medium text-white/80 mb-2">Search by name, handle, or hashtag</label>
        <input
          id="user-search"
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="e.g. artist, #furryart, @username"
          className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
        />
        <div className="mt-4 bg-[#0D3559] border border-white/15 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-white font-medium text-sm">Content Filter</p>
            <p className="text-white/60 text-xs">Hide profiles marked as primarily NSFW</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hideNsfw}
            onClick={() => setHideNsfw((v) => !v)}
            className={`relative inline-flex h-7 w-14 items-center rounded-full border transition-colors ${hideNsfw ? "bg-[#31dcb2]/30 border-[#31dcb2]/60" : "bg-white/10 border-white/25"}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full transition-transform ${hideNsfw ? "translate-x-8 bg-[#31dcb2]" : "translate-x-1 bg-white/80"}`}
            />
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-white/60">Loading profiles...</p>
      ) : isError ? (
        <p className="text-red-300">Unable to load profiles right now.</p>
      ) : profiles.length === 0 ? (
        <p className="text-white/60">No linked profiles found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {profiles.map((p) => (
            <a
              key={p.id}
              href={p.profileUrl || `https://${p.instanceDomain}/@${p.acct}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#0D3559] border border-white/10 rounded-xl overflow-hidden no-underline hover:border-[#31dcb2]/60 transition-colors"
            >
              <div className="h-28 bg-[#17496a] relative">
                {p.headerUrl ? <img src={p.headerUrl} className="w-full h-full object-cover" alt="" /> : null}
                <div className="absolute -bottom-8 left-4 w-16 h-16 rounded-full bg-[#12384b] border-3 border-[#0D3559] overflow-hidden">
                  {p.avatarUrl ? <img src={p.avatarUrl} className="w-full h-full object-cover" alt={p.displayName || p.username} /> : <div className="w-full h-full flex items-center justify-center text-white font-bold">{(p.displayName || p.username).charAt(0).toUpperCase()}</div>}
                </div>
              </div>
              <div className="pt-10 p-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-white font-bold">{p.displayName || p.username}</h3>
                  {p.isPrimaryNsfw ? <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/40">NSFW</span> : null}
                </div>
                <p className="text-[#31dcb2] text-sm mb-2">@{p.acct}@{p.instanceDomain}</p>
                <div className="text-white/70 text-sm max-h-36 overflow-y-auto pr-1 [&_p]:mb-2 [&_a]:text-[#31dcb2] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                  {p.bio ? (
                    <div dangerouslySetInnerHTML={{ __html: sanitizeProfileHtml(p.bio) }} />
                  ) : (
                    "No bio available."
                  )}
                </div>
                <div className="mt-3 flex gap-4 text-xs text-white/60">
                  <span>{p.followersCount.toLocaleString()} followers</span>
                  <span>{p.followingCount.toLocaleString()} following</span>
                </div>
                {p.hashtags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.hashtags.slice(0, 6).map((h) => (
                      <span key={h.id} className="text-[11px] px-2 py-1 rounded-full bg-[#31dcb2]/10 text-[#31dcb2]">#{h.normalizedTag}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UserDirectoryList() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <DirectoryGrid />
    </QueryClientProvider>
  );
}
