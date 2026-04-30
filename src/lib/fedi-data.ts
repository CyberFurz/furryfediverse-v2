import type {
  FunkwhaleInstance,
  MastodonInstance,
  MisskeyInstance,
  PixelfedInstance
} from "../utils/fedi-types";

export class InstanceFetcher {
    public static async checkAvailable(
        instanceURI: string,
        instanceType: string
    ) {
        let init = undefined;
        let metaURI = "";
        let parsedMasterData: any = {};
        switch (instanceType) {
            case "mastodon":
                init = {
                    headers : { "Content-Type": "application/json;charset=utf-8" },
                };
                let mastometaURI = `https://${instanceURI}/api/v1/instance`;
                try {
                    const fetchingData = await fetch(mastometaURI, init);
                    const mastodonData = (await fetchingData.json()) as MastodonInstance;
                    parsedMasterData = {
                        title: mastodonData.title,
                        description: mastodonData.short_description !== undefined ? mastodonData.short_description : mastodonData.description,
                        thumbnail: mastodonData.thumbnail,
                        user_count: mastodonData.stats.user_count,
                        instance_contact: mastodonData.contact_account.username,
                        registrations: mastodonData.registrations,
                        approval_required: mastodonData.approval_required,
                    };
                    return parsedMasterData;
                } catch (error) {
                    console.error(error);
                    return false;
                }
                break;
            case "pixelfed":
                init = {
                    headers : { "Content-Type": "application/json;charset=utf-8" },
                };
                let pixelmetaURI = `https://${instanceURI}/api/v1/instance`;
                try {
                    const fetchingData = await fetch(pixelmetaURI, init);
                    const pixelData = (await fetchingData.json()) as PixelfedInstance;
                    parsedMasterData = {
                        title: pixelData.title,
                        description: pixelData.short_description !== undefined ? pixelData.short_description : pixelData.description,
                        thumbnail: pixelData.thumbnail,
                        user_count: pixelData.stats.user_count,
                        instance_contact: "null",
                        registrations: pixelData.registrations,
                        approval_required: pixelData.approval_required,
                    };
                    return parsedMasterData;
                } catch (error) {
                    console.error(error);
                    return false;
                }
                break;
            case "misskey":
                // biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
                const getDetails = { detail: true };
                init = {
                    headers: { "Content-Type": "application/json;charset=UTF-8" },
                    body: JSON.stringify(getDetails),
                    method: "POST",
                };
                // biome-ignore lint/style/useTemplate: <explanation>
                let misskeymetaURI = `https://${instanceURI}/api/meta`;
                // biome-ignore lint/correctness/noSwitchDeclarations: <explanation>
                let statsURI = `https://${instanceURI}/api/stats`;
                try {
                    const fetchingData = await fetch(misskeymetaURI, init);
                    //console.log(await fetchingData.json())
                    const fetchingData2 = await fetch(statsURI, init);
                    //console.log(await fetchingData2.json())
                    const misskeyMetaData =
                        (await fetchingData.json()) as MisskeyInstance;
                    const misskeyStatsData =
                        (await fetchingData2.json()) as MisskeyInstance;
                    parsedMasterData = {
                        title: misskeyMetaData.name,
                        description: misskeyMetaData.description,
                        thumbnail: misskeyMetaData.bannerUrl,
                        user_count: misskeyStatsData.originalUsersCount,
                        instance_contact: "null",
                        registrations: misskeyMetaData.disableRegistration === false,
                        approval_required: false,
                    };
                    console.log(parsedMasterData)
                    return parsedMasterData;
                } catch (err) {
                    return false;
                }
                break;
            case "funkwhale":
                init = {
                headers: { "Content-Type": "application/json;charset=UTF-8" },
                };
                let funkmetaURI = `https://${instanceURI}/api/v1/instance/nodeinfo/2.0/`;
                try {
                const fetchingData = await fetch(funkmetaURI);
                const funkwhaleData =
                    (await fetchingData.json()) as FunkwhaleInstance;
                parsedMasterData = {
                    title: funkwhaleData.metadata.nodeName,
                    description: funkwhaleData.metadata.shortDescription,
                    thumbnail: funkwhaleData.banner,
                    user_count: funkwhaleData.usage.users.total,
                    instance_contact: funkwhaleData.metadata.contactemail,
                    registrations: funkwhaleData.openRegistrations,
                    approval_required: false,
                };
                return parsedMasterData;
                } catch (err) {
                return false;
                }
                break;
            default:
                return false;
            }
        }
    }