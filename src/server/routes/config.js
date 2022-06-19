import express from "express";
import { HerokuClient } from "../../bot/herokuClient.js";
import { sortMap } from "../../shared/utils/maps.js";
import { getHerokuInstancesForNav, onMountAddToRoutes, prettifyPath } from "../utils.js";

/**
 * @typedef {import("../").AuthQuery} AuthQuery
 * @typedef {import("chatexchange").default} BotClient
 * @typedef {import("../../bot/config").BotConfig} BotConfig
 * @typedef {import("chatexchange/dist/Room").default} BotRoom
 */

export const config = express();

onMountAddToRoutes(config);

config.get("/", async ({ query, path, app, baseUrl }, res) => {
    const { success, password = "" } = /** @type {AuthQuery} */(query);

    /** @type {BotConfig|undefined} */
    const botConfig = app.get("bot_config");
    /** @type {BotClient|undefined} */
    const botClient = app.get("bot_client");

    if (!botConfig || !botClient) {
        console.error("[server] bot config missing");
        return res.sendStatus(500);
    }

    try {
        const statusMap = {
            true: `<div class="alert alert-success fs-5" role="alert">Success! Bot will restart with updated environment variables.</div>`,
            false: `<div class="alert alert-danger fs-5" role="alert">Error. Could not save new values.</div>`,
            undefined: ""
        };

        // Fetch config vars
        const heroku = new HerokuClient(botConfig);

        const instances = await heroku.fetchInstances();

        /** @type {Map<string,Record<string, unknown>>} */
        const env = new Map();
        for (const app of instances) {
            env.set(app.name, await heroku.fetchConfigVars(app));
        }

        const botChatUser = await botClient.getMe();

        res.render('config', {
            page: {
                appName: process.env.HEROKU_APP_NAME,
                title: "Config"
            },
            current: "Config",
            heading: `Update ${await botChatUser.name} environment variables`,
            data: {
                env: sortMap(env, (k1, _, k2) => k1 < k2 ? -1 : 1),
                instances: await getHerokuInstancesForNav(botConfig, instances),
                password,
                path: prettifyPath(baseUrl + path),
                routes: app.get("routes"),
                statusText: statusMap[success],
            }
        });
    } catch (error) {
        console.error(`[server] failed to display config dashboard:`, error);
        res.sendStatus(500);
    }
});

config.post('/', async (req, res) => {
    const { body, app, query } = req;
    const { password, ...fields } = body;

    /** @type {BotConfig|undefined} */
    const botConfig = app.get("bot_config");
    if (!botConfig) {
        console.error("[server] bot config missing");
        return res.sendStatus(500);
    }

    try {
        if (botConfig.verbose) {
            console.log(`[server] submitted body:\n"${JSON.stringify(body)}"`);
        }

        const { instance } = query;
        if (typeof instance !== "string") {
            console.error(`[server] received unknown instance: "${instance}"`);
            return res.redirect(`/config?password=${password}&success=false`);
        }

        // Validation
        if (Object.keys(fields).length === 0) {
            console.error(`[server] invalid request`);
            return res.redirect(`/config?password=${password}&success=false`);
        }

        // Update environment variables
        const heroku = new HerokuClient(botConfig);
        const status = await heroku.updateConfigVars(instance, fields);

        /** @type {BotRoom|undefined} */
        const room = app.get("bot_room");

        if (status && room) {
            const status = await room.leave();
            console.log(`[server] left room ${room.id} after update: ${status}`);
        }

        res.redirect(`/config?password=${password}&success=true`);
    } catch (error) {
        console.error(`[server] config submit error:`, error);
        res.redirect(`/config?password=${password}&success=false`);
    }
});