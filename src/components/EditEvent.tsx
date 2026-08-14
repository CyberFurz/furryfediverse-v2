import React, { useState, useEffect } from "react";

export default function EditEvent({ slug }: { slug: string }) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [location, setLocation] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [website, setWebsite] = useState("");
    const [tags, setTags] = useState("");
    const [days, setDays] = useState("");
    const [dayStyles, setDayStyles] = useState("");
    const [tagBlacklist, setTagBlacklist] = useState("");
    const [numberMatch, setNumberMatch] = useState(false);
    const [instances, setInstances] = useState("");
    const [mastodon, setMastodon] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const fetchEvent = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/events/${slug}`);
                if (!res.ok) throw new Error("Failed to load event");
                const data = await res.json();
                const { event } = data;
                setName(event.name || "");
                setDescription(event.description || "");
                setLocation(event.location || "");
                setStartDate(event.startDate ? event.startDate.split("T")[0] : "");
                setEndDate(event.endDate ? event.endDate.split("T")[0] : "");
                setWebsite(event.website || "");
                setTags(event.tags || "");
                setDays(event.days || "");
                setDayStyles(event.dayStyles || "");
                setTagBlacklist(event.tagBlacklist || "");
                setNumberMatch(event.numberMatch || false);
                setInstances(event.instances || "");
                setMastodon(event.mastodon || "");
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load event");
            } finally {
                setLoading(false);
            }
        };
        fetchEvent();
    }, [slug]);

    const nameError = touched.name && !name.trim() ? "Name is required" : null;
    const startError = touched.startDate && !startDate ? "Start date is required" : null;
    const endError = touched.endDate && !endDate ? "End date is required" : null;
    const isValid = name.trim().length > 0 && startDate && endDate;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTouched({ name: true, startDate: true, endDate: true });
        if (!name.trim() || !startDate || !endDate) return;

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/events/${slug}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    location: location.trim(),
                    startDate,
                    endDate,
                    website: website.trim(),
                    tags: tags.trim(),
                    days: days.trim(),
                    dayStyles: dayStyles.trim(),
                    tagBlacklist: tagBlacklist.trim(),
                    numberMatch,
                    instances: instances.trim(),
                    mastodon: mastodon.trim(),
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to update event");
            }

            window.location.href = `/events/${slug}`;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto bg-white/5 rounded-xl border border-white/10 p-6 md:p-8 animate-pulse">
                <div className="space-y-6">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i}>
                            <div className="h-4 bg-white/10 rounded w-1/4 mb-2" />
                            <div className="h-12 bg-white/10 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error && !name) {
        return (
            <div className="max-w-2xl mx-auto bg-white/5 rounded-xl border border-white/10 p-8 text-center">
                <p className="text-white/60 text-lg mb-2">Failed to load event</p>
                <p className="text-white/40 text-sm">{error}</p>
                <a href={`/events/${slug}`} className="inline-block mt-4 bg-[#31dcb2] text-[#12384b] font-semibold px-6 py-2 rounded-lg hover:bg-[#28c4a0] transition-colors no-underline">
                    Go Back
                </a>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto bg-white/5 rounded-xl border border-white/10 p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Name */}
                <div>
                    <label htmlFor="edit-event-name" className="block text-sm font-medium text-white/80 mb-2">
                        Name <span className="text-red-400">*</span>
                    </label>
                    <input id="edit-event-name" type="text" value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                        maxLength={255}
                        className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors ${nameError ? "border-red-400" : "border-white/20"}`}
                        disabled={submitting} />
                    {nameError && <p className="text-red-400 text-xs mt-1">{nameError}</p>}
                </div>

                {/* Description */}
                <div>
                    <label htmlFor="edit-event-desc" className="block text-sm font-medium text-white/80 mb-2">Description</label>
                    <textarea id="edit-event-desc" value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4} maxLength={2000}
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors resize-vertical"
                        disabled={submitting} />
                </div>

                {/* Location */}
                <div>
                    <label htmlFor="edit-event-location" className="block text-sm font-medium text-white/80 mb-2">Location</label>
                    <input id="edit-event-location" type="text" value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        maxLength={255}
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        disabled={submitting} />
                </div>

                {/* Date range */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="edit-event-start" className="block text-sm font-medium text-white/80 mb-2">
                            Start Date
                        </label>
                        <input id="edit-event-start" type="date" value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, startDate: true }))}
                            className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors ${startError ? "border-red-400" : "border-white/20"}`}
                            disabled={submitting} />
                        {startError && <p className="text-red-400 text-xs mt-1">{startError}</p>}
                    </div>
                    <div>
                        <label htmlFor="edit-event-end" className="block text-sm font-medium text-white/80 mb-2">
                            End Date
                        </label>
                        <input id="edit-event-end" type="date" value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, endDate: true }))}
                            className={`w-full px-4 py-3 bg-white/5 border rounded-lg text-white focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors ${endError ? "border-red-400" : "border-white/20"}`}
                            disabled={submitting} />
                        {endError && <p className="text-red-400 text-xs mt-1">{endError}</p>}
                    </div>
                </div>

                {/* Website */}
                <div>
                    <label htmlFor="edit-event-website" className="block text-sm font-medium text-white/80 mb-2">Website</label>
                    <input id="edit-event-website" type="url" value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        disabled={submitting} />
                </div>

                {/* Mastodon */}
                <div>
                    <label htmlFor="edit-event-mastodon" className="block text-sm font-medium text-white/80 mb-2">Mastodon Profile</label>
                    <input id="edit-event-mastodon" type="url" value={mastodon}
                        onChange={(e) => setMastodon(e.target.value)}
                        placeholder="https://meow.social/@eurofurence"
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        disabled={submitting} />
                </div>

                {/* Instances to poll */}
                <div className="bg-[#0D3559] rounded-xl p-4 border border-white/10">
                    <label htmlFor="edit-event-instances" className="block text-sm font-medium text-white/80 mb-2">
                        Instances to Index <span className="text-amber-400">(admin only)</span>
                    </label>
                    <input id="edit-event-instances" type="text" value={instances}
                        onChange={(e) => setInstances(e.target.value)}
                        placeholder="mastodon.social, meow.social, furry.engineer"
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors font-mono text-sm"
                        disabled={submitting} />
                    <p className="text-xs text-white/40 mt-2">
                        Comma-separated list of Mastodon instances to poll for event hashtags.
                        Only poll instances whose admins have given consent.
                    </p>
                </div>

                {/* Tags */}
                <div>
                    <label htmlFor="edit-event-tags" className="block text-sm font-medium text-white/80 mb-2">
                        Hashtags <span className="text-white/40">(comma separated)</span>
                    </label>
                    <input id="edit-event-tags" type="text" value={tags}
                        onChange={(e) => setTags(e.target.value.replace(/#/g, ""))}
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        disabled={submitting} />
                </div>

                {/* Number Matching */}
                <div className="bg-[#0D3559] rounded-xl p-4 border border-white/10">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={numberMatch}
                            onChange={(e) => setNumberMatch(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-[#31dcb2] focus:ring-[#31dcb2]"
                            disabled={submitting} />
                        <div>
                            <span className="block text-sm font-medium text-white/80">Number Matching</span>
                            <span className="text-xs text-white/40">Auto-exclude posts with different edition numbers. E.g. event tag <code className="text-[#31dcb2]">EF30</code> will skip posts tagged <code className="text-[#31dcb2]">EF29</code>, <code className="text-[#31dcb2]">EF31</code>, etc.</span>
                        </div>
                    </label>
                </div>

                {/* Tag Blacklist */}
                <div>
                    <label htmlFor="edit-event-blacklist" className="block text-sm font-medium text-white/80 mb-2">
                        Tag Blacklist <span className="text-white/40">(comma separated)</span>
                    </label>
                    <input id="edit-event-blacklist" type="text" value={tagBlacklist}
                        onChange={(e) => setTagBlacklist(e.target.value)}
                        placeholder="EF29, EF2025"
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        disabled={submitting} />
                    <p className="text-xs text-white/40 mt-2">Posts containing these hashtags will be skipped during indexing.</p>
                </div>

                {/* Days */}
                <div>
                    <label htmlFor="edit-event-days" className="block text-sm font-medium text-white/80 mb-2">
                        Day Names <span className="text-white/40">(comma separated, e.g. Tutorials, Tutorials, Talks, Talks)</span>
                    </label>
                    <input id="edit-event-days" type="text" value={days}
                        onChange={(e) => setDays(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#31dcb2] focus:ring-1 focus:ring-[#31dcb2] transition-colors"
                        disabled={submitting} />
                </div>

                {/* Day Styles */}
                <div>
                    <label htmlFor="edit-event-daystyles" className="block text-sm font-medium text-white/80 mb-2">
                        Day Styles <span className="text-white/40">(comma separated, e.g. blue, blue, red, red)</span>
                    </label>
                    <input id="edit-event-daystyles" type="text" value={dayStyles}
                        onChange={(e) => setDayStyles(e.target.value)}
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
                            Saving...
                        </span>
                    ) : "Save Changes"}
                </button>
            </form>
        </div>
    );
}
