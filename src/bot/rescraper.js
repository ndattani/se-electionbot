import { HerokuClient } from "./herokuClient.js";
import { sayEndingSoon } from "./messages/elections.js";
import { sayBusyGreeting, sayIdleGreeting } from "./messages/greetings.js";
import { sayElectionSchedule } from "./messages/phases.js";
import { sendMessage, sendMessageList } from "./queue.js";
import { makeURL, wait } from "./utils.js";
import { SEC_IN_MINUTE } from "../shared/utils/dates.js";
import { mapMap } from "../shared/utils/maps.js";

/**
 * @typedef {import("./config.js").BotConfig} BotConfig
 * @typedef {import("chatexchange").default} Client
 * @typedef {import("./election.js").default} Election
 * @typedef {import("chatexchange/dist/Room").default} Room
 * @typedef {import("./announcement.js").default} Announcement
 */

/**
 * @summary rescrapes election data and processes updates
 */
export default class Rescraper {

    /**
     * @summary next reschedule timeout
     * @type {NodeJS.Timeout|void}
     */
    timeout;

    /**
     * @summary elections announcer
     * @type {Announcement|undefined}
     */
    announcement;

    /**
     * @param {BotConfig} config bot config
     * @param {Client} client ChatExchange client
     * @param {Room} room chatroom the bot is connected to
     * @param {Map<number, Election>} elections site elections
     * @param {Election} election current election
     * @param {Announcement} [announcement] announcer instance
     */
    constructor(config, client, room, elections, election, announcement) {
        this.client = client;
        this.config = config;
        this.election = election;
        this.elections = elections;
        this.announcement = announcement;
        this.room = room;
    }

    /**
     * @summary convenience method for updating Announcement
     * @param {Announcement} announcement announcement instance
     */
    setAnnouncement(announcement) {
        this.announcement = announcement;
    }

    /**
     * @summary Function to rescrape election data, and process election or chat room updates
     */
    async rescrape() {
        const { client, elections, election, config, announcement, room } = this;

        if (config.debugOrVerbose) {
            console.log(`RESCRAPER - Rescrape function called.`);
        }

        try {
            const bot = await client.getMe();

            const rescraped = await election.scrapeElection(config);
            const { status, errors } = election.validate();

            if (!status || !rescraped) {
                console.log(`RESCRAPER - Invalid election data:\n${errors.join("\n")}`);
                return this.start();
            }

            if (config.verbose) {
                console.log('RESCRAPER -', election.updated, election);
            }

            if (config.debugOrVerbose) {
                const { nominees, arrWinners, phase } = election;

                console.log(`RESCRAPER - Candidates: ${mapMap(nominees, x => x.userName).join(', ')}`);

                if (phase === 'ended') {
                    console.log(`RESCRAPER - Winners: ${arrWinners.map(x => x.userName).join(', ')}`);
                }

                const {
                    roomReachedMinActivityCount, roomBecameIdleAWhileAgo,
                    roomBecameIdleHoursAgo, botHasBeenQuiet, botSentLastMessage,
                    canIdleGreet: idleCanSayHi
                } = config;

                console.log(`RESCRAPER - IDLE? idleCanSayHi: ${idleCanSayHi}
                    ----------- reachedMinActivity: ${roomReachedMinActivityCount};
                    ----------- roomBecameIdleAWhileAgo: ${roomBecameIdleAWhileAgo}; roomBecameIdleHoursAgo: ${roomBecameIdleHoursAgo}
                    ----------- botHasBeenQuiet: ${botHasBeenQuiet}; botSentLastMessage: ${botSentLastMessage}`
                );
            }

            // No previous scrape results yet, do not proceed (prev can be null)
            if (!election.prev) {

                if (config.debug) {
                    console.log(`RESCRAPER - No previous scrape.`);
                }
                return;
            }

            // Election chat room has changed
            if (election.electionChatRoomChanged) {

                // Restart Heroku dyno via API
                const heroku = new HerokuClient(config);
                return await heroku.restartApp() || process.exit(1);
            }

            // New nominations
            if (election.phase === 'nomination' && election.hasNewNominees) {
                await announcement?.announceNewNominees();
                console.log(`RESCRAPER - New nominees announced.`);
            }

            // Withdrawn nominations
            if (election.isActive() && election.newlyWithdrawnNominees.size) {
                await announcement?.announceWithdrawnNominees();
                console.log(`RESCRAPER - Withdrawn nominees announced.`);
            }

            // Primary phase was activated (due to >10 candidates)
            if (!announcement?.hasPrimary && election.datePrimary) {
                announcement?.initPrimary(election.datePrimary);
                await announcement?.announcePrimary();
            }

            // Election dates has changed (manually by CM)
            if (election.electionDatesChanged) {
                announcement?.stopAll();
                announcement?.initAll();

                await sendMessageList(
                    config, room,
                    [
                        `The ${makeURL("election", election.electionUrl)} dates have changed:`,
                        sayElectionSchedule(election)
                    ],
                    { isPrivileged: true }
                );
            }

            // The election was cancelled
            if (election.phase === 'cancelled' && election.isNewPhase()) {
                await announcement?.announceCancelled(room, election);
                console.log(`RESCRAPER - Election was cancelled.`);

                // Scale Heroku dynos to free (restarts app)
                const heroku = new HerokuClient(config);
                await heroku.scaleFree();
            }

            // Official results out
            if (election.phase === 'ended' && election.hasNewWinners) {
                await announcement?.announceWinners(room, election);
                console.log(`RESCRAPER - Winners announced.`);
            }

            // Election just over, there are no winners yet (waiting for CM)
            else if (election.phase === 'ended' && election.numWinners === 0) {

                // Reduce scrape interval further
                config.scrapeIntervalMins = 0.2;

                // Log this the first time only
                if (election.prev.phase !== 'ended' && config.debugOrVerbose) {
                    console.log(`RESCRAPER - Election ended with no results - Scrape interval reduced to ${config.scrapeIntervalMins}.`);
                }
            }

            // The election is ending within the next X seconds (default 15 mins) or less, do once only
            else if (election.isEnding() && !config.flags.saidElectionEndingSoon) {

                config.flags.saidElectionEndingSoon = true;

                // Reduce scrape interval
                config.scrapeIntervalMins = 1;

                // Scale Heroku dynos to paid (restarts app)
                const heroku = new HerokuClient(config);
                await heroku.scaleHobby();

                // Announce election ending soon
                await sendMessage(config, room, sayEndingSoon(election));

                if (config.debugOrVerbose) {
                    console.log(`RESCRAPER - Election ending - Scrape interval reduced to ${config.scrapeIntervalMins}.`);
                }
            }

            // If room is idle, remind users that bot is around to help
            else if (config.canIdleGreet) {
                await sayIdleGreeting(config, elections, election, bot, room);
            }
            else if (config.canBusyGreet) {
                await sayBusyGreeting(config, elections, election, bot, room);
            }

            // The election is over
            else if (election.isInactive() && config.scrapeIntervalMins !== 10) {

                // Increase scrape interval since we don't need to scrape often
                config.scrapeIntervalMins = 10;

                if (config.debugOrVerbose) {
                    console.log(`RESCRAPER - Scrape interval increased to ${config.scrapeIntervalMins}.`);
                }

                // Stay in room a while longer
                await wait(config.electionAfterpartyMins * SEC_IN_MINUTE);

                // Scale Heroku dynos to free (restarts app)
                const heroku = new HerokuClient(config);
                await heroku.scaleFree();
            }

            this.start();
        } catch (error) {
            console.error(`RESCRAPER - Failure`, error);
        }

        if (config.debugOrVerbose) {
            console.log(`RESCRAPER - Rescrape function completed.`);
        }
    };

    /**
     * @summary stops the rescraper
     */
    stop() {
        const { config, timeout } = this;

        if (timeout) this.timeout = clearTimeout(timeout);

        if (config.debugOrVerbose) {
            console.log(`RESCRAPER - Next rescrape cleared.`);
        }
    }

    /**
     * @summary starts the rescraper
     */
    start() {
        const { config } = this;

        this.timeout = setTimeout(this.rescrape.bind(this), config.scrapeIntervalMins * 60000);

        if (config.debugOrVerbose) {
            console.log(`RESCRAPER - Next rescrape scheduled in ${config.scrapeIntervalMins} mins.`);
        }
    }
}
