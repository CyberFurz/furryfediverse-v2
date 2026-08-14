import { prisma } from "../prisma";
import { matchCategory } from "./constants";

export interface IndexResult {
    newPosts: number;
    totalPosts: number;
    errors: string[];
}

export async function indexEvent(slug: string, triggeredBy?: string): Promise<IndexResult> {
    const errors: string[] = [];
    let newPosts = 0;
    let totalPosts = 0;
    const accountsMap = new Map<string, { displayName: string; handle: string; avatarUrl: string }>();

    // 1. Fetch event with tags and instances
    const event = await prisma.event.findFirst({
        where: { slug },
        include: { minIds: true },
    });

    if (!event) {
        throw new Error(`Event not found: ${slug}`);
    }

    const log = await prisma.eventPollLog.create({
        data: {
            eventId: event.id,
            status: "running",
            triggeredBy: triggeredBy || null,
        },
    });

    async function finishLog(status: string, extra?: Partial<{ newPosts: number; totalPosts: number; errors: string }>) {
        await prisma.eventPollLog.update({
            where: { id: log.id },
            data: {
                status,
                completedAt: new Date(),
                ...(extra?.newPosts !== undefined ? { newPosts: extra.newPosts } : {}),
                ...(extra?.totalPosts !== undefined ? { totalPosts: extra.totalPosts } : {}),
                ...(extra?.errors !== undefined ? { errors: extra.errors } : {}),
            },
        });
    }

    if (!event.tags) {
        await finishLog("failed", { errors: `No tags configured for event: ${slug}` });
        throw new Error(`No tags configured for event: ${slug}`);
    }

    if (!event.instances) {
        errors.push("No instances configured. Admin must add instances first.");
        await finishLog("failed", { errors: errors.join("\n") });
        return { newPosts: 0, totalPosts: 0, errors };
    }

    const tags = event.tags.split(",").map((t: string) => t.trim().replace(/^#/, "")).filter(Boolean);
    const rawInstances = event.instances.split(",").map((i: string) => i.trim()).filter(Boolean);

    // Parse tag blacklist
    const blacklist = (event.tagBlacklist || "")
        .split(",").map((t: string) => t.trim().toLowerCase().replace(/^#/, ""))
        .filter(Boolean);

    // Build number-matching patterns from event tags
    const numberPatterns: Record<string, string[]> = {};
    if (event.numberMatch) {
        for (const tag of tags) {
            const match = tag.match(/^(\D+)(\d+)$/);
            if (match) {
                const prefix = match[1].toLowerCase();
                const num = match[2];
                if (!numberPatterns[prefix]) numberPatterns[prefix] = [];
                numberPatterns[prefix].push(num);
            }
        }
    }

    // Hard cap: stop indexing if event already has too many posts
    const MAX_POSTS = parseInt(process.env.EVENT_MAX_POSTS || "10000", 10);
    const existingCount = await prisma.eventPost.count({ where: { eventId: event.id } });
    let fetchedThisRun = 0;
    if (existingCount >= MAX_POSTS) {
        errors.push(`Event has reached the maximum of ${MAX_POSTS} posts. Skipping indexing.`);
        await finishLog("completed", { newPosts: 0, totalPosts: 0, errors: errors.join("\n") });
        return { newPosts: 0, totalPosts: 0, errors };
    }
    const remaining = MAX_POSTS - existingCount;

    // Auto-include the event's Mastodon profile instance if set
    if (event.mastodon) {
        try {
            const mastodonUrl = new URL(event.mastodon);
            if (!rawInstances.includes(mastodonUrl.hostname)) {
                rawInstances.push(mastodonUrl.hostname);
            }
        } catch {
            // Invalid URL, ignore
        }
    }

    // Only poll if event is published
    if (event.status !== "approved" || !event.publishedAt) {
        errors.push("Event must be approved and published before indexing.");
        await finishLog("failed", { errors: errors.join("\n") });
        return { newPosts: 0, totalPosts: 0, errors };
    }

    // Only poll instances that are in our directory, verified, AND have polling allowed
    const approvedInstances = await prisma.instance.findMany({
        where: {
            domain: { in: rawInstances },
            verified: true,
            pollingAllowed: true,
        },
        select: { domain: true, instanceType: true },
    });
    const approvedSet = new Set(approvedInstances.map((i) => i.domain));
    const instances = rawInstances.filter((i) => {
        const lower = i.toLowerCase();
        if (!approvedSet.has(lower)) {
            errors.push(`Skipping ${i}: not found, not verified, or polling not consented`);
            return false;
        }
        const inst = approvedInstances.find((a) => a.domain === lower);
        if (inst && inst.instanceType !== "mastodon") {
            errors.push(`Skipping ${i}: type "${inst.instanceType}". Only Mastodon instances support tag timeline polling`);
            return false;
        }
        return true;
    });

    if (instances.length === 0) {
        errors.push("No instances ready for polling. They must be in the directory, verified, and have polling enabled.");
        await finishLog("failed", { errors: errors.join("\n") });
        return { newPosts: 0, totalPosts: 0, errors };
    }

    // 2. For each instance + each tag, fetch posts
    for (const instance of instances) {
        for (const tag of tags) {
            let minId = "0";

            // Load cursor from MinId
            const minIdRecord = event.minIds?.find(
                (m) => m.instance === `${instance}:${tag}`
            );
            if (minIdRecord && minIdRecord.minId !== "0") {
                minId = minIdRecord.minId;
            }

            let pageCount = 0;
            let hasMore = true;

            while (hasMore && pageCount < 5 && fetchedThisRun < remaining) {
                try {
                    const url = `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?local=true&limit=40${minId !== "0" ? `&min_id=${minId}` : ""}`;

                    const response = await fetch(url, {
                        headers: { Accept: "application/json" },
                        signal: AbortSignal.timeout(15000),
                    });

                    if (response.status === 429) {
                        errors.push(`Rate limited by ${instance}, stopping for now`);
                        break;
                    }

                    if (response.status === 404) {
                        errors.push(`Tag timeline not found on ${instance}`);
                        break;
                    }

                    if (!response.ok) {
                        errors.push(`HTTP ${response.status} from ${instance}`);
                        break;
                    }

                    const posts: any[] = await response.json();
                    if (posts.length === 0) {
                        hasMore = false;
                        break;
                    }

                    totalPosts += posts.length;
                    fetchedThisRun += posts.length;
                    let lastId = minId;

                    for (const post of posts) {
                        const postId = post.id;
                        if (!postId) continue;
                        lastId = postId;

                        try {
                            const createdAt = post.created_at ? new Date(post.created_at) : null;

                            // Track account info
                            const acct = post.account;
                            if (acct?.id) {
                                const displayName = acct.display_name || acct.username || "";
                                const rawAcct = acct.acct || acct.username || "";
                                const handle = rawAcct.includes("@")
                                    ? `@${rawAcct}`
                                    : `@${rawAcct}@${instance}`;
                                const avatarUrl = acct.avatar || "";
                                if (!accountsMap.has(acct.id) && displayName) {
                                    accountsMap.set(acct.id, { displayName, handle, avatarUrl });
                                }
                            }

                            // Check post tags against blacklist and number patterns
                            const postTagNames: string[] = (post.tags || []).map((t: any) => t.name?.toLowerCase?.() || "").filter(Boolean);
                            if (postTagNames.length > 0) {
                                if (blacklist.length > 0 && postTagNames.some(t => blacklist.includes(t))) {
                                    continue;
                                }
                                if (Object.keys(numberPatterns).length > 0) {
                                    const exclude = postTagNames.some(tag => {
                                        const m = tag.match(/^(\D+)(\d+)$/);
                                        if (!m) return false;
                                        const prefix = m[1].toLowerCase();
                                        const num = m[2];
                                        const expected = numberPatterns[prefix];
                                        return expected && !expected.includes(num);
                                    });
                                    if (exclude) continue;
                                }
                            }

                            // Skip if account has #nobot in bio
                            const accountNote = (post.account?.note || "").toLowerCase();
                            if (/\b#?nobot\b/.test(accountNote)) continue;

                            // Upsert event post
                            const postContent = post.content || "";
                            const postUrl = post.url || post.uri || "";
                            // Extract account's home instance
                            const rawAcctStr = post.account?.acct || post.account?.username || "";
                            const accountInstance = rawAcctStr.includes("@") ? rawAcctStr.split("@").pop()! : instance;

                            const mediaCount = Array.isArray(post.media_attachments) ? post.media_attachments.length : 0;
                            await prisma.eventPost.upsert({
                                where: {
                                    eventId_postId: {
                                        eventId: event.id,
                                        postId,
                                    },
                                },
                                create: {
                                    eventId: event.id,
                                    postId,
                                    createdAt: createdAt,
                                    sourceInstance: accountInstance,
                                    favouritesCount: post.favourites_count ?? 0,
                                    reblogsCount: post.reblogs_count ?? 0,
                                    repliesCount: post.replies_count ?? 0,
                                    visibility: post.visibility || "public",
                                    accountId: post.account?.id || null,
                                    content: postContent,
                                    url: postUrl,
                                    mediaCount,
                                },
                                update: {
                                    sourceInstance: accountInstance,
                                    favouritesCount: post.favourites_count ?? 0,
                                    reblogsCount: post.reblogs_count ?? 0,
                                    repliesCount: post.replies_count ?? 0,
                                    content: postContent || undefined,
                                    url: postUrl || undefined,
                                    mediaCount,
                                },
                            });
                            newPosts++;
                        } catch (err) {
                            errors.push(`Error saving post ${postId}: ${err instanceof Error ? err.message : String(err)}`);
                        }
                    }

                    if (lastId !== minId) {
                        await prisma.minId.upsert({
                            where: {
                                eventId_instance: {
                                    eventId: event.id,
                                    instance: `${instance}:${tag}`,
                                },
                            },
                            create: {
                                eventId: event.id,
                                instance: `${instance}:${tag}`,
                                minId: lastId,
                            },
                            update: {
                                minId: lastId,
                            },
                        });
                        minId = lastId;
                    }

                    pageCount++;

                    // If fewer than 40 results, we've reached the end
                    if (posts.length < 40) {
                        hasMore = false;
                    }
                } catch (err) {
                    errors.push(`Error fetching ${instance}/${tag}: ${err instanceof Error ? err.message : String(err)}`);
                    hasMore = false;
                }
            }
        }
    }

    // 2b. If event has a Mastodon profile, fetch that account's posts as well
    if (event.mastodon) {
        try {
            const mastodonUrl = new URL(event.mastodon);
            const acctMatch = mastodonUrl.pathname.match(/^\/@?([^@]+@?.*)/);
            if (acctMatch) {
                const acct = acctMatch[1];
                const instance = mastodonUrl.hostname;
                const lookupUrl = `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`;
                const lookupRes = await fetch(lookupUrl, { signal: AbortSignal.timeout(10000) });
                if (lookupRes.ok) {
                    const accountData: any = await lookupRes.json();
                    const accountId = accountData.id;
                    let maxId = "";

                    for (let page = 0; page < 3 && fetchedThisRun < remaining; page++) {
                        let statusUrl = `https://${instance}/api/v1/accounts/${accountId}/statuses?limit=40`;
                        if (maxId) statusUrl += `&max_id=${maxId}`;

                        const statusRes = await fetch(statusUrl, { signal: AbortSignal.timeout(10000) });
                        if (!statusRes.ok) break;

                        const statuses: any[] = await statusRes.json();
                        if (statuses.length === 0) break;
                        totalPosts += statuses.length;

                        for (const status of statuses) {
                            const statusTags: string[] = (status.tags || []).map((t: any) => t.name?.toLowerCase?.() || "");
                            const matchesTag = tags.some(t => statusTags.includes(t.toLowerCase()));
                            if (!matchesTag) continue;

                            // Skip if account has #nobot in bio
                            const acctNote = (status.account?.note || "").toLowerCase();
                            if (/\b#?nobot\b/.test(acctNote)) continue;

                            // Check blacklist and number patterns
                            if (statusTags.length > 0) {
                                if (blacklist.length > 0 && statusTags.some(t => blacklist.includes(t))) {
                                    continue;
                                }
                                if (Object.keys(numberPatterns).length > 0) {
                                    const exclude = statusTags.some(tag => {
                                        const m = tag.match(/^(\D+)(\d+)$/);
                                        if (!m) return false;
                                        const prefix = m[1].toLowerCase();
                                        const num = m[2];
                                        const expected = numberPatterns[prefix];
                                        return expected && !expected.includes(num);
                                    });
                                    if (exclude) continue;
                                }
                            }

                            const postId = status.id;
                            if (!postId) continue;
                            maxId = postId;

                            // Track account info
                            const acctData = status.account;
                            if (acctData?.id && !accountsMap.has(acctData.id)) {
                                const displayName = acctData.display_name || acctData.username || "";
                                const rawAcct = acctData.acct || acctData.username || "";
                                const handle = rawAcct.includes("@") ? `@${rawAcct}` : `@${rawAcct}@${instance}`;
                                const avatarUrl = acctData.avatar || "";
                                if (displayName) accountsMap.set(acctData.id, { displayName, handle, avatarUrl });
                            }

                            const createdAt = status.created_at ? new Date(status.created_at) : null;
                            const acctStr = status.account?.acct || status.account?.username || "";
                            const sourceInst = acctStr.includes("@") ? acctStr.split("@").pop()! : instance;

                            const acctMediaCount = Array.isArray(status.media_attachments) ? status.media_attachments.length : 0;
                            try {
                                await prisma.eventPost.upsert({
                                    where: { eventId_postId: { eventId: event.id, postId } },
                                    create: {
                                        eventId: event.id, postId, createdAt,
                                        sourceInstance: sourceInst,
                                        favouritesCount: status.favourites_count ?? 0,
                                        reblogsCount: status.reblogs_count ?? 0,
                                        repliesCount: status.replies_count ?? 0,
                                        visibility: status.visibility || "public",
                                        accountId: status.account?.id || null,
                                        content: status.content || "",
                                        url: status.url || status.uri || "",
                                        mediaCount: acctMediaCount,
                                    },
                                    update: {
                                        sourceInstance: sourceInst,
                                        favouritesCount: status.favourites_count ?? 0,
                                        reblogsCount: status.reblogs_count ?? 0,
                                        repliesCount: status.replies_count ?? 0,
                                        content: status.content || undefined,
                                        url: status.url || status.uri || undefined,
                                        mediaCount: acctMediaCount,
                                    },
                                });
                                newPosts++;
                            } catch (err) {
                                errors.push(`Error saving account post ${postId}: ${err instanceof Error ? err.message : String(err)}`);
                            }
                        }
                    }
                    errors.push(`Fetched ${accountData.display_name || acct}'s timeline from ${instance}`);
                } else {
                    errors.push(`Could not look up account on ${instance} (HTTP ${lookupRes.status})`);
                }
            }
        } catch (err) {
            errors.push(`Error fetching account timeline: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // 3. Update account counts
    const accountCountResult = await prisma.eventPost.groupBy({
        by: ["accountId"],
        where: {
            eventId: event.id,
            accountId: { not: null },
        },
        _count: { id: true },
    });

    for (const acct of accountCountResult) {
        if (!acct.accountId) continue;
        const info = accountsMap.get(acct.accountId);
        await prisma.eventAccount.upsert({
            where: {
                eventId_accountId: {
                    eventId: event.id,
                    accountId: acct.accountId,
                },
            },
            update: {
                count: acct._count.id,
                ...(info?.displayName ? { displayName: info.displayName } : {}),
                ...(info?.handle ? { handle: info.handle } : {}),
                ...(info?.avatarUrl ? { avatarUrl: info.avatarUrl } : {}),
            },
            create: {
                eventId: event.id,
                accountId: acct.accountId,
                count: acct._count.id,
                displayName: info?.displayName || null,
                handle: info?.handle || null,
                avatarUrl: info?.avatarUrl || null,
                createdById: event.createdById,
            },
        });
    }

    // 4. Update event stats
    await prisma.event.update({
        where: { id: event.id },
        data: {
            numPosts: await prisma.eventPost.count({ where: { eventId: event.id } }),
            numAccounts: accountCountResult.length,
        },
    });

    // 5. Run classification
    const category = matchCategory(event.name, event.description);
    await prisma.eventLookup.upsert({
        where: {
            eventId_language: {
                eventId: event.id,
                language: category,
            },
        },
        update: {},
        create: {
            eventId: event.id,
            language: category,
        },
    });

    await finishLog("completed", {
        newPosts, totalPosts, errors: errors.join("\n"),
    });
    return { newPosts, totalPosts, errors };
}
