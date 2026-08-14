import React, { useState } from "react";

export default function CreateEvent() {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [location, setLocation] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [website, setWebsite] = useState("");
    const [tags, setTags] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    const nameError = touched.name && !name.trim() ? "Name is required" : null;
    const startError = false;
    const endError = false;
    const isValid = name.trim().length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTouched({ name: true, startDate: true, endDate: true });
        if (!name.trim() || !startDate || !endDate) return;

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch("/api/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    location: location.trim(),
                    startDate,
                    endDate,
                    website: website.trim(),
                    tags: tags.trim(),
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to create event");
            }

            const event = await res.json();
            window.location.href = `/events/${event.slug}`;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto bg-white/5 rounded-xl border border-white/10 p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Name */}
                <div>
                    <label htmlFor="event-name" className="block text-sm font-medium text-white/80 mb-2">
                        Name <span className="text-red-400">*</span>
                    </label>
                    <input id="event-name" type="text" value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                        placeholder="e.g. Anthrocon 2025"
                        maxLength={255}
                        className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors ${nameError ? "border-red-400" : "border-white/20"}`}
                        disabled={submitting} />
                    {nameError && <p className="text-red-400 text-xs mt-1">{nameError}</p>}
                </div>

                {/* Description */}
                <div>
                    <label htmlFor="event-desc" className="block text-sm font-medium text-white/80 mb-2">Description</label>
                    <textarea id="event-desc" value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe this event..."
                        rows={4} maxLength={2000}
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors resize-vertical"
                        disabled={submitting} />
                </div>

                {/* Location */}
                <div>
                    <label htmlFor="event-location" className="block text-sm font-medium text-white/80 mb-2">Location</label>
                    <input id="event-location" type="text" value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="e.g. Pittsburgh, PA"
                        maxLength={255}
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        disabled={submitting} />
                </div>

                {/* Date range */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="event-start" className="block text-sm font-medium text-white/80 mb-2">
                            Start Date
                        </label>
                        <input id="event-start" type="date" value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, startDate: true }))}
                            className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors ${startError ? "border-red-400" : "border-white/20"}`}
                            disabled={submitting} />
                        {startError && <p className="text-red-400 text-xs mt-1">{startError}</p>}
                    </div>
                    <div>
                        <label htmlFor="event-end" className="block text-sm font-medium text-white/80 mb-2">
                            End Date
                        </label>
                        <input id="event-end" type="date" value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, endDate: true }))}
                            className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors ${endError ? "border-red-400" : "border-white/20"}`}
                            disabled={submitting} />
                        {endError && <p className="text-red-400 text-xs mt-1">{endError}</p>}
                    </div>
                </div>

                {/* Website */}
                <div>
                    <label htmlFor="event-website" className="block text-sm font-medium text-white/80 mb-2">Website</label>
                    <input id="event-website" type="url" value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        disabled={submitting} />
                </div>

                {/* Tags */}
                <div>
                    <label htmlFor="event-tags" className="block text-sm font-medium text-white/80 mb-2">
                        Hashtags <span className="text-white/40">(comma separated)</span>
                    </label>
                    <input id="event-tags" type="text" value={tags}
                        onChange={(e) => setTags(e.target.value.replace(/#/g, ""))}
                        placeholder="e.g. anthrocon, ac2025"
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        disabled={submitting} />
                </div>

                {/* Error */}
                {error && (
                    <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/30 text-red-400">
                        {error}
                    </div>
                )}

                {/* Submit */}
                <button type="submit" disabled={submitting || !isValid}
                    className="w-full py-3 bg-[#31dcb2] text-[#12384b] font-semibold rounded-lg hover:bg-[#28c4a0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base">
                    {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Creating...
                        </span>
                    ) : "Create Event"}
                </button>
            </form>
        </div>
    );
}
