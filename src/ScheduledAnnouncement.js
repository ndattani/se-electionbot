import cron from "node-cron";
import { sendMessage } from "./queue.js";
import { dateToUtcTimestamp, makeURL, pluralize } from "./utils.js";

/**
 * @typedef {import("./config.js").BotConfig} BotConfig
 * @typedef {import("./election.js").default} Election
 * @typedef {import("chatexchange/dist/Room").default} Room
 * @typedef {import("./rescraper.js").default} Rescraper
 */

export default class ScheduledAnnouncement {

    /**
     * @param {BotConfig} config bot configuration
     * @param {Room} room room to announce in
     * @param {Election} election election to announce for
     * @param {Rescraper} rescraper election rescraper
     */
    constructor(config, room, election, rescraper) {
        this._room = room;
        this._election = election;
        this.rescraper = rescraper;
        this.config = config;

        // Run the sub-functions once only
        this._nominationSchedule = null;
        this._primarySchedule = null;
        this._electionStartSchedule = null;
        this._electionEndSchedule = null;

        // Store task so we can stop if needed
        this._nominationTask = null;
        this._primaryTask = null;
        this._electionStartTask = null;
        this._electionEndTask = null;
    }

    get hasPrimary() {
        return !this._primarySchedule;
    }

    get schedules() {
        return {
            nomination: this._nominationSchedule,
            primary: this._primarySchedule,
            election: this._electionStartSchedule,
            ended: this._electionEndSchedule
        };
    }

    /**
     * @summary Election cancelled
     * @param {Room} room chatroom to post to
     * @param {Election} [election] election to announce for
     * @returns {Promise<boolean>}
     */
    async announceCancelled(room, election) {

        if (!election) return false;

        const { cancelledText, phase } = election;

        // Needs to be cancelled
        if (!cancelledText || phase == 'cancelled') return false;

        // Stop all cron jobs
        this.cancelAll();

        this.rescraper.stop();

        // Announce
        await room.sendMessage(cancelledText);

        return true;
    }

    /**
     * @summary announces new nominees arrival
     * @returns {Promise<void>}
     */
    async announceNewNominees() {
        const { _room, config, _election } = this;

        const { newNominees, electionUrl } = _election;

        const nominationTab = `${electionUrl}?tab=nomination`;

        newNominees.forEach(async ({ permalink, userName }, i) => {
            await sendMessage(config, _room, `**We have a new ${makeURL("nomination", nominationTab)
                }!** Please welcome our latest candidate ${makeURL(userName, permalink)
                }!`);
            console.log(`NOMINATION`, newNominees[i]);
        });
    }

    /**
     * @summary Announces winners when available
     * @param {Room} room chatroom to post to
     * @param {Election} [election] election to announce for
     * @returns {Promise<boolean>}
     */
    async announceWinners(room, election) {
        const { config } = this;

        //exit early if no election
        if (!election) return false;

        const { arrWinners, phase, resultsUrl, siteUrl } = election;

        const { length } = arrWinners;

        if (config.debug) console.log('announceWinners() called: ', arrWinners);

        // Needs to have ended and have winners
        if (phase != 'ended' || length === 0) return false;

        this.cancelAll();

        this.rescraper.stop();

        const winnerList = arrWinners.map(({ userName, userId }) => makeURL(userName, `${siteUrl}/users/${userId}`));

        // Build the message
        let msg = `**Congratulations to the winner${pluralize(length)}** ${winnerList.join(', ')}!`;

        if (resultsUrl) {
            msg += ` You can ${makeURL("view the results online via OpaVote", resultsUrl)}.`;
        }

        // Announce
        await room.sendMessage(msg);

        return true;
    }

    /**
     * @summary convenience method for updating Rescraper
     * @param {Rescraper} rescraper rescraper instance
     */
    setRescraper(rescraper) {
        this.rescraper = rescraper;
    }

    /**
     * @summary convenience method for updating the Room
     * @param {Room} room the room to announce in
     */
    setRoom(room) {
        this._room = room;
    }

    /**
     * @summary convenience method for updating the Election
     * @param {Election} election election to announce for
     */
    setElection(election) {
        this._election = election;
    }

    initElectionEnd(date) {
        if (this._electionEndSchedule != null || this._electionEndTask != null) return false;

        const _endedDate = new Date(date);
        if (_endedDate.valueOf() > Date.now()) {
            const cs = `0 ${_endedDate.getHours()} ${_endedDate.getDate()} ${_endedDate.getMonth() + 1} *`;
            this._electionEndTask = cron.schedule(
                cs,
                async () => {
                    await this._election.scrapeElection(this.config);
                    await this._room.sendMessage(`**The [election](${this._election.electionUrl}?tab=election) has now ended.** The winners will be announced shortly.`);
                },
                { timezone: "Etc/UTC" }
            );
            console.log('CRON - election end     - ', cs);
            this._electionEndSchedule = cs;
        }
    }

    initElectionStart(date) {
        if (this._electionStartSchedule != null || this._electionStartTask != null || typeof date == 'undefined') return false;

        const _electionDate = new Date(date);
        if (_electionDate.valueOf() > Date.now()) {
            const cs = `0 ${_electionDate.getHours()} ${_electionDate.getDate()} ${_electionDate.getMonth() + 1} *`;
            this._electionStartTask = cron.schedule(
                cs,
                async () => {
                    await this._election.scrapeElection(this.config);
                    await this._room.sendMessage(`**The [election's final voting phase](${this._election.electionUrl}?tab=election) is now open.** You may now cast your election ballot for your top three preferred candidates. Good luck to all candidates!`);
                },
                { timezone: "Etc/UTC" }
            );
            console.log('CRON - election start   - ', cs);
            this._electionStartSchedule = cs;
        }
    }

    initPrimary(date) {
        if (this._primarySchedule != null || this._primaryTask != null || typeof date == 'undefined') return false;

        const _primaryDate = new Date(date);
        if (_primaryDate.valueOf() > Date.now()) {
            const cs = `0 ${_primaryDate.getHours()} ${_primaryDate.getDate()} ${_primaryDate.getMonth() + 1} *`;
            this._primaryTask = cron.schedule(
                cs,
                async () => {
                    await this._election.scrapeElection(this.config);
                    await this._room.sendMessage(`**The [primary phase](${this._election.electionUrl}?tab=primary) is now open.** You can now vote on the candidates' nomination posts. Don't forget to come back in a week for the final election phase!`);
                },
                { timezone: "Etc/UTC" }
            );
            console.log('CRON - primary start    - ', cs);
            this._primarySchedule = cs;
        }
    }

    initNomination(date) {
        if (this._nominationSchedule != null || this._nominationTask != null || typeof date == 'undefined') return false;

        const _nominationDate = new Date(date);
        if (_nominationDate.valueOf() > Date.now()) {
            const cs = `0 ${_nominationDate.getHours()} ${_nominationDate.getDate()} ${_nominationDate.getMonth() + 1} *`;
            this._nominationTask = cron.schedule(
                cs,
                async () => {
                    await this._election.scrapeElection(this.config);
                    await this._room.sendMessage(`**The [nomination phase](${this._election.electionUrl}?tab=nomination) is now open.** Users may now nominate themselves for the election. **You cannot vote yet.**`);
                },
                { timezone: "Etc/UTC" }
            );
            console.log('CRON - nomination start - ', cs);
            this._nominationSchedule = cs;
        }
    }

    // Test if cron works and if scrapeElection() can be called from cron.schedule
    initTest() {
        const dNow = new Date();
        const cs = `${dNow.getMinutes() + 2} ${dNow.getHours()} ${dNow.getDate()} ${dNow.getMonth() + 1} *`;
        cron.schedule(
            cs,
            async () => {
                console.log('TEST CRON STARTED');
                await this._election.scrapeElection(this.config);
                await this._room.sendMessage(`Test cron job succesfully completed at ${dateToUtcTimestamp(/**  @type {number} */(this._election.updated))}.`);
                console.log('TEST CRON ENDED', this._election, '\n', this._room);
            },
            { timezone: "Etc/UTC" }
        );
        console.log('CRON - testing cron     - ', cs);
    }

    initAll() {
        this.initNomination(this._election.dateNomination);
        this.initPrimary(this._election.datePrimary);
        this.initElectionStart(this._election.dateElection);
        this.initElectionEnd(this._election.dateEnded);
    }

    cancelElectionEnd() {
        if (this._electionEndTask != null) this._electionEndTask.stop();
        this._electionEndSchedule = null;
        console.log('CRON - cancelled election end cron job');
    }

    cancelElectionStart() {
        if (this._electionStartTask != null) this._electionStartTask.stop();
        this._electionStartSchedule = null;
        console.log('CRON - cancelled election start cron job');
    }

    cancelPrimary() {
        if (this._primaryTask != null) this._primaryTask.stop();
        this._primarySchedule = null;
        console.log('CRON - cancelled primary phase cron job');
    }

    cancelNomination() {
        if (this._nominationTask != null) this._nominationTask.stop();
        this._nominationSchedule = null;
        console.log('CRON - cancelled nomination phase cron job');
    }

    cancelAll() {
        this.cancelElectionEnd();
        this.cancelElectionStart();
        this.cancelPrimary();
        this.cancelNomination();
    }
}
