import { apiBase, apiVer, fetchUrl } from "./utils.js";

/**
 * @typedef {import("./utils.js").BadgeItem} BadgeItem
 *
 * @summary gets badges from the API
 * @param {import("./index.js").BotConfig} config
 * @param {number} userId userId to request badges for
 * @param {string} site election site slug
 * @param {string} key api key
 * @param {number} [page]
 * @returns {Promise<BadgeItem[]>}
 */
export const getBadges = async (config, userId, site, key, page = 1) => {

    const badgeURI = new URL(`${apiBase}/${apiVer}/users/${userId}/badges`);
    badgeURI.search = new URLSearchParams({
        site,
        order: "asc",
        sort: "type",
        pagesize: "100",
        filter: "7W_5Hvzzo",
        key
    }).toString();

    const { items = [], has_more } = /**@type {{ items: BadgeItem[], has_more: boolean }} */(await fetchUrl(config, badgeURI.toString(), true)) || {};

    if (has_more) {
        const otherItems = await getBadges(config, userId, site, key, page + 1);
        return [...items, ...otherItems];
    }

    return items;
};