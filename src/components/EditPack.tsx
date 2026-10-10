import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faImage, faRotate } from "@fortawesome/free-solid-svg-icons";

interface PackData {
  title: string;
  description: string;
  publishedAt: string | null;
  splash_image?: string | null;
  splash_custom?: boolean;
  status?: string;
  published_at?: string | null;
  revision?: { status: string } | null;
}

const MAX_SPLASH_BYTES = 5 * 1024 * 1024;

function SplashEditor({ slug, initialImage, initialCustom }: { slug: string; initialImage: string | null; initialCustom: boolean }) {
  const [image, setImage] = useState(initialImage);
  const [custom, setCustom] = useState(initialCustom);
  const [busy, setBusy] = useState<"upload" | "regen" | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const res = await fetch(`/api/packs/${slug}?draft=1&following=0`, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data: PackData = await res.json();
      setImage(data.splash_image ?? null);
      setCustom(!!data.splash_custom);
    }
  };

  const upload = async (file: File) => {
    setMessage(null);
    if (!file.type.startsWith("image/")) {
      setMessage({ kind: "error", text: "Please choose an image file." });
      return;
    }
    if (file.size > MAX_SPLASH_BYTES) {
      setMessage({ kind: "error", text: "Image must be 5 MB or smaller." });
      return;
    }
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`/api/packs/${slug}/splash`, { method: "PUT", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setImage(data.splash_image);
      setCustom(true);
      setMessage({ kind: "ok", text: "Cover image updated." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    setMessage(null);
    setBusy("regen");
    try {
      const res = await fetch(`/api/packs/${slug}/splash`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Regeneration failed");
      await refresh();
      setMessage({ kind: "ok", text: "Generated cover image from pack accounts." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Regeneration failed" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <span className="block text-sm font-medium text-white/80 mb-2">
        Cover Image{" "}
        <span className="text-white/40">({custom ? "custom upload" : "auto-generated"})</span>
      </span>
      <div className="relative aspect-[1200/630] rounded-lg overflow-hidden border border-white/20 bg-white/5">
        {image ? (
          <img src={image} alt="Pack cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white/80 text-sm">
            No cover image yet
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <FontAwesomeIcon icon={faSpinner} spin className="w-6 h-6 text-white" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-40 transition-colors text-sm"
        >
          <FontAwesomeIcon icon={faImage} className="w-4 h-4" />
          Upload Image
        </button>
        <button
          type="button"
          onClick={regenerate}
          disabled={!!busy}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-40 transition-colors text-sm"
        >
          <FontAwesomeIcon icon={faRotate} className="w-4 h-4" />
          {custom ? "Use Generated Image" : "Regenerate"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
      </div>
      <p className="text-white/40 text-xs mt-2">
        PNG, JPEG, WebP, or GIF up to 5 MB. Cropped to 1200×630. Changes apply immediately.
      </p>
      {message && (
        <p className={`text-xs mt-2 ${message.kind === "error" ? "text-red-400" : "text-[#31dcb2]"}`}>{message.text}</p>
      )}
    </div>
  );
}

export default function EditPack({ slug }: { slug: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ title: false, description: false });
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<null | "new" | "draft" | "pending" | "rejected">(null);
  const [splash, setSplash] = useState<{ image: string | null; custom: boolean }>({ image: null, custom: false });

  const titleError = touched.title && !title.trim() ? "Title is required" : null;
  const descError = touched.description && !description.trim() ? "Description is required" : null;
  const isValid = title.trim().length > 0 && description.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // draft=1: show pending changes (if any) rather than the live content.
        const res = await fetch(`/api/packs/${slug}?draft=1&following=0`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Failed to load pack");
        const data: PackData = await res.json();
        if (!cancelled) {
          setTitle(data.title);
          setDescription(data.description);
          setSplash({ image: data.splash_image ?? null, custom: !!data.splash_custom });
          if (data.revision) {
            setLiveNotice(data.revision.status as "draft" | "pending" | "rejected");
          } else if (data.status === "approved" && data.published_at) {
            setLiveNotice("new");
          }
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
      {liveNotice && (
        <div className="mb-6 p-3 rounded-lg border bg-sky-500/10 border-sky-500/30 text-sky-100 text-sm">
          {liveNotice === "new"
            ? "This pack is live. Your edits will be saved as pending changes. The published version stays up until you submit them and they're approved."
            : liveNotice === "pending"
              ? "You're editing changes that are awaiting review. The published version stays up until they're approved."
              : "You're editing your pending changes. The published version stays up until you submit them and they're approved."}
        </div>
      )}
      <div className="mb-6">
        <SplashEditor slug={slug} initialImage={splash.image} initialCustom={splash.custom} />
      </div>
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
