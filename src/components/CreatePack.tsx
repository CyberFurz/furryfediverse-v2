import React, { useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCircleCheck, faFileArrowUp } from "@fortawesome/free-solid-svg-icons";

export default function CreatePack() {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [touched, setTouched] = useState({ title: false, description: false });
    const fileRef = useRef<HTMLInputElement>(null);

    const titleError = touched.title && !title.trim() ? "Title is required" : null;
    const descError = touched.description && !description.trim() ? "Description is required" : null;
    const isValid = title.trim().length > 0 && description.trim().length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTouched({ title: true, description: true });
        if (!title.trim() || !description.trim()) return;

        setSubmitting(true);
        setError(null);

        try {
            // Step 1: Create the pack
            const res = await fetch("/api/packs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim(), description: description.trim() }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to create pack");
            }

            const pack = await res.json();

            // Step 2: If CSV was provided, import accounts
            if (csvFile) {
                const formData = new FormData();
                formData.append("csv", csvFile);

                const importRes = await fetch(`/api/packs/${pack.slug}/import-csv`, {
                    method: "POST",
                    body: formData,
                });

                if (!importRes.ok) {
                    const data = await importRes.json().catch(() => ({}));
                    // Non-fatal: pack was created, just warn
                    setError(`Pack created but CSV import had issues: ${data.error || "Unknown error"}`);
                    setTimeout(() => setError(null), 5000);
                } else {
                    const importData = await importRes.json();
                    if (importData.skipped > 0) {
                        setError(`Imported ${importData.imported} accounts, skipped ${importData.skipped} (not found in database). You can add more manually.`);
                        setTimeout(() => setError(null), 6000);
                    }
                }
            }

            window.location.href = `/packs/${pack.slug}/accounts`;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto bg-white/5 rounded-xl border border-white/10 p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Title */}
                <div>
                    <label htmlFor="pack-title" className="block text-sm font-medium text-white/80 mb-2">
                        Title <span className="text-red-400">*</span>
                    </label>
                    <input
                        id="pack-title"
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
                    {titleError && (
                        <p className="text-red-400 text-xs mt-1">{titleError}</p>
                    )}
                </div>

                {/* Description */}
                <div>
                    <label htmlFor="pack-desc" className="block text-sm font-medium text-white/80 mb-2">
                        Description <span className="text-red-400">*</span>
                    </label>
                    <textarea
                        id="pack-desc"
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
                    {descError && (
                        <p className="text-red-400 text-xs mt-1">{descError}</p>
                    )}
                </div>

                {/* CSV Upload */}
                <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                        Import from Mastodon Takeout CSV <span className="text-white/40">(optional)</span>
                    </label>
                    <div
                        className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                            dragOver
                                ? "border-[#31dcb2] bg-[#31dcb2]/10"
                                : csvFile
                                    ? "border-[#31dcb2] bg-[#31dcb2]/5"
                                    : "border-white/20 hover:border-white/40 bg-white/5"
                        }`}
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOver(false);
                            const files = e.dataTransfer.files;
                            if (files.length > 0) {
                                setCsvFile(files[0]);
                            }
                        }}
                    >
                        {csvFile ? (
                            <div className="space-y-1">
                                <FontAwesomeIcon icon={faCircleCheck} className="w-8 h-8 mx-auto text-[#31dcb2]" />
                                <p className="text-[#31dcb2] font-medium text-sm">{csvFile.name}</p>
                                <p className="text-white/40 text-xs">Click to change file</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <FontAwesomeIcon icon={faFileArrowUp} className="w-8 h-8 mx-auto text-white/40" />
                                <p className="text-white/60 text-sm">
                                    <span className="text-[#31dcb2] font-medium">Click to upload</span> or drag and drop
                                </p>
                                <p className="text-white/40 text-xs">CSV/JSON-File</p>
                            </div>
                        )}
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                                setCsvFile(e.target.files?.[0] || null);
                                // Reset so re-selecting the same file triggers onChange
                                if (e.target) e.target.value = "";
                            }}
                        />
                    </div>
                    <p className="text-white/40 text-xs mt-2">
                        Packs hold up to 150 accounts. Larger imports are truncated.
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className={`p-3 rounded-lg text-sm ${
                        error.includes("Imported") || error.includes("Pack created")
                            ? "bg-blue-500/10 border border-blue-500/30 text-blue-300"
                            : "bg-red-500/10 border border-red-500/30 text-red-400"
                    }`}>
                        {error}
                    </div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={submitting || !isValid}
                    className="w-full py-3 bg-[#31dcb2] text-[#12384b] font-semibold rounded-lg hover:bg-[#28c4a0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base"
                >
                    {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                            <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
                            Creating...
                        </span>
                    ) : (
                        "Create Pack"
                    )}
                </button>
            </form>
        </div>
    );
}
