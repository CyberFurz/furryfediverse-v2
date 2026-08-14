import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";

interface PackData {
  title: string;
  description: string;
  publishedAt: string | null;
}

export default function EditPack({ slug }: { slug: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ title: false, description: false });
  const [fetchError, setFetchError] = useState<string | null>(null);

  const titleError = touched.title && !title.trim() ? "Title is required" : null;
  const descError = touched.description && !description.trim() ? "Description is required" : null;
  const isValid = title.trim().length > 0 && description.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/packs/${slug}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Failed to load pack");
        const data: PackData = await res.json();
        if (!cancelled) {
          setTitle(data.title);
          setDescription(data.description);
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Something went wrong");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ title: true, description: true });
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/packs/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update pack");
      }
      window.location.href = `/packs/${slug}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto bg-white/5 rounded-xl border border-white/10 p-6 md:p-8">
        <div className="space-y-6 animate-pulse">
          <div className="h-4 bg-white/10 rounded w-1/4" />
          <div className="h-12 bg-white/5 rounded-lg" />
          <div className="h-4 bg-white/10 rounded w-1/4" />
          <div className="h-24 bg-white/5 rounded-lg" />
          <div className="h-12 bg-white/5 rounded-lg" />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20 bg-white/5 rounded-xl border border-white/10">
        <p className="text-white/60 text-lg mb-2">Something went wrong</p>
        <p className="text-white/40 text-sm mb-6">{fetchError}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-white/10 text-white px-6 py-2 rounded-lg hover:bg-white/20 transition-colors text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white/5 rounded-xl border border-white/10 p-6 md:p-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="edit-pack-title" className="block text-sm font-medium text-white/80 mb-2">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="edit-pack-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, title: true }))}
            placeholder="e.g. Mustelid Lovers Pack"
            maxLength={120}
            className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors ${
              titleError ? "border-red-400" : "border-white/20"
            }`}
            disabled={submitting}
          />
          {titleError && <p className="text-red-400 text-xs mt-1">{titleError}</p>}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="edit-pack-desc" className="block text-sm font-medium text-white/80 mb-2">
            Description <span className="text-red-400">*</span>
          </label>
          <textarea
            id="edit-pack-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, description: true }))}
            placeholder="Describe what this pack is about..."
            rows={4}
            maxLength={500}
            className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors resize-vertical ${
              descError ? "border-red-400" : "border-white/20"
            }`}
            disabled={submitting}
          />
          {descError && <p className="text-red-400 text-xs mt-1">{descError}</p>}
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !isValid}
            className="flex-1 py-3 bg-[#31dcb2] text-[#12384b] font-semibold rounded-lg hover:bg-[#28c4a0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
                Saving...
              </span>
            ) : (
              "Save Changes"
            )}
          </button>
          <a
            href={`/packs/${slug}`}
            className="px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm no-underline text-center"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
