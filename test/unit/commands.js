import { expect } from "chai";
import sinon from "sinon";
import { AccessLevel } from "../../src/bot/commands/access.js";
import { isAliveCommand, resetElection, setAccessCommand, setThrottleCommand, timetravelCommand } from "../../src/bot/commands/commands.js";
import { CommandManager } from "../../src/bot/commands/index.js";
import { User } from "../../src/bot/commands/user.js";
import Election from "../../src/bot/election.js";
import { dateToUtcTimestamp } from "../../src/shared/utils/dates.js";
import { getMockBotConfig } from "../mocks/bot.js";
import { getMockNominee } from "../mocks/nominee.js";
import { getMockUserProfile } from "../mocks/user.js";

/**
 * @typedef {import("../../src/bot/election.js").ModeratorUser} ModeratorUser
 */

describe('Commands', () => {

    beforeEach(() => sinon.stub(console, "log"));
    afterEach(() => sinon.restore());

    describe(CommandManager.name, () => {

        describe('adding', () => {
            it("bulkAdd should correctly add commands", () => {
                const user = new User(getMockUserProfile());

                const commander = new CommandManager(user);
                commander.bulkAdd({
                    build: ["builds something", () => void 0, void 0],
                    test: ["tests something", () => true, void 0]
                });

                expect(commander.run("build")).to.be.undefined;
                expect(commander.run("test")).to.be.true;
            });
        });

        describe('aliasing', () => {
            it('"alias" should correctly add aliases', () => {
                const user = new User(getMockUserProfile());

                const commander = new CommandManager(user);
                commander.add({
                    name: "bark",
                    description: "barks, what else?",
                    handler: () => "bark!",
                    access: AccessLevel.all
                });
                commander.alias("bark", ["say"]);

                expect(commander.commands.bark.aliases).length(1);
                expect(commander.commands.say.aliasFor).to.not.be.null;
            });

            it('"aliases" method should correct set aliases', () => {
                const user = new User(getMockUserProfile());

                const commander = new CommandManager(user);
                commander.add({ name: "♦", description: "gets a diamond", handler: () => "♦" });
                commander.add({ name: "gold", description: "gets some gold", handler: () => "#FFD700" });

                const goldAliases = ["aurum"];
                const diamondAliases = ["diamond", "mod"];

                commander.aliases({
                    "♦": diamondAliases,
                    "gold": goldAliases
                });

                const { commands } = commander;

                expect(commands.gold.aliases.map((a) => a.name)).to.deep.equal(goldAliases);
                expect(commands["♦"].aliases.map((a) => a.name)).to.deep.equal(diamondAliases);
            });
        });

        describe('help', () => {

            it('should only list available commands', () => {
                const user = new User(getMockUserProfile());

                const commander = new CommandManager(user);
                commander.add({ name: "alive", description: "pings the bot", handler: () => "I am alive", access: AccessLevel.all });
                commander.add({ name: "stop", description: "stops the bot", handler: () => "stopping...", access: AccessLevel.dev });

                const aliveRegex = /\[alive\] pings the bot/;
                const stopRegex = /\[stop\] stops the bot/;

                const userHelp = commander.help();
                expect(userHelp).to.match(aliveRegex);
                expect(userHelp).to.not.match(stopRegex);

                user.access = AccessLevel.dev;

                const devHelp = commander.help();
                expect(devHelp).to.match(aliveRegex);
                expect(devHelp).to.match(stopRegex);
            });

            it('should correctly list aliases', () => {
                const user = new User(getMockUserProfile());

                const commander = new CommandManager(user);
                commander.add({ name: "bark", description: "barks, what else?", handler: () => "bark!", access: AccessLevel.all });
                commander.alias("bark", ["say"]);

                const help = commander.help();
                expect(help).to.equal(`Commands\n- [bark] (say) barks, what else?`);
            });
        });

        describe('AccessLevel', () => {
            const user = new User(getMockUserProfile());

            const commander = new CommandManager(user);
            commander.add({ name: "destroy", description: "Destroys the universe", handler: () => "💥", access: AccessLevel.dev });
            commander.add({ name: "restart", description: "Restarts the bot", handler: () => true, access: AccessLevel.privileged });
            commander.add({ name: "pet", description: "Pets the bot", handler: () => "good bot! Who's a good bot?", access: AccessLevel.all });

            it('should allow privileged commands for privileged users', () => {
                user.access = AccessLevel.dev;

                const boom = commander.run("destroy");
                expect(boom).to.not.be.undefined;

                const pet = commander.run("pet");
                expect(pet).to.not.be.undefined;

                const restart = commander.run("restart");
                expect(restart).to.not.be.undefined;
            });

            it('should disallow privileged commands for underprivileged users', () => {
                user.access = AccessLevel.user;

                const poof = commander.run("destroy");
                expect(poof).to.be.undefined;

                const restart = commander.run("restart");
                expect(restart).to.be.undefined;
            });
        });

    });

    describe('Individual commands', () => {

        describe(timetravelCommand.name, () => {

            it('should fail if date is not valid', () => {
                const config = getMockBotConfig();
                const election = new Election("https://stackoverflow.com/election/12");

                const response = timetravelCommand(config, election, "take me to the moon");
                expect(response).to.match(/invalid/i);
            });

            it('should correctly update election state', () => {
                const endingDate = new Date();
                endingDate.setDate(endingDate.getDate() + 1);

                const futureDate = new Date();
                futureDate.setDate(endingDate.getDate() + 365);

                const config = getMockBotConfig({
                    flags: {
                        announcedWinners: true,
                        saidElectionEndingSoon: true,
                        debug: false,
                        fun: false,
                        verbose: false
                    }
                });
                const election = new Election("https://stackoverflow.com/election/12");
                election.phase = "nomination";
                election.dateEnded = endingDate.toISOString();

                const isoDate = futureDate.toISOString().slice(0, 10);

                const response = timetravelCommand(config, election, `timetravel to ${isoDate}`);
                expect(response).to.match(/phase.+?ended/);

                expect(election.phase).to.equal("ended");
                expect(config.flags.announcedWinners).to.be.false;
                expect(config.flags.saidElectionEndingSoon).to.be.false;

                election.dateEnded = "";

                const noDate = timetravelCommand(config, election, `timetravel to ${isoDate}`);
                expect(noDate).to.contain("no phase");
            });

        });

        describe(setAccessCommand.name, () => {

            it('should fail if access level is not valid', () => {
                const user = getMockUserProfile();
                const config = getMockBotConfig();
                config.adminIds.clear();

                const response = setAccessCommand(config, user, "make me the Emperor of Bots");
                expect(response).to.contain("provide access");
                expect(config.adminIds).to.be.empty;
            });

            it('should deelevate privileges correctly', () => {
                const user = getMockUserProfile();
                const config = getMockBotConfig({ adminIds: new Set([user.id]) });

                const response = setAccessCommand(config, user, `set access ${user.id} user`);
                expect(response).to.match(/changed access/i);
                expect(config.adminIds).to.be.empty;
            });

            it('should allow special value "me"', () => {
                const user = getMockUserProfile();
                const config = getMockBotConfig();
                config.adminIds.clear();
                config.devIds.clear();
                config.devIds.add(user.id);

                const response = setAccessCommand(config, user, `set access me admin`);
                expect(response).to.match(/changed access/i);
                expect(config.devIds).to.be.empty;
                expect(config.adminIds).to.include(user.id);
            });

        });

        describe(setThrottleCommand.name, () => {

            it('should do nothing if new throttle is invalid', () => {
                const throttleSecs = 5;

                const config = getMockBotConfig({ throttleSecs });

                const status = setThrottleCommand("oupsy-daisy, forgot the throttle", config);

                expect(status).to.contain("invalid");
                expect(config.throttleSecs).to.equal(5);
            });

            it('should correctly update throttle value', () => {
                const throttleSecs = 5;

                const config = getMockBotConfig({ throttleSecs });

                const status = setThrottleCommand("set throttle to 10", config);

                expect(status).to.contain("throttle set");
                expect(config.throttleSecs).to.equal(10);
            });

        });

        describe(isAliveCommand.name, () => {

            it('should correctly build responses', () => {
                const config = getMockBotConfig();
                const mockHost = "hosting.com";
                const mockStart = new Date();

                const hostStub = sinon.stub(config, "scriptHostname");

                hostStub.get(sinon.stub().onFirstCall().returns(void 0).onSecondCall().returns(mockHost));

                const notHosted = isAliveCommand(config);
                expect(notHosted).to.contain("planet Earth");

                const hosted = isAliveCommand(config);
                expect(hosted).to.contain(mockHost);

                const dateStub = sinon.stub(config, "scriptInitDate");
                dateStub.get(() => mockStart);

                const started = isAliveCommand(config);
                expect(started).to.contain(dateToUtcTimestamp(mockStart));
                expect(started).to.match(/\b\d+ seconds of uptime/);

                config.flags.debug = true;
                const debug = isAliveCommand(config);
                expect(debug).to.contain("debug mode");

                config.flags.debug = false;
                const noDebug = isAliveCommand(config);
                expect(noDebug).to.not.contain("debug mode");

                config.flags.verbose = true;
                const verbose = isAliveCommand(config);
                expect(verbose).to.contain("verbose ");

                config.flags.verbose = false;
                const noVerbose = isAliveCommand(config);
                expect(noVerbose).to.not.contain("verbose ");
            });

        });

        describe(resetElection.name, () => {

            it('should make current election forget the last state', () => {
                const election = new Election("https://stackoverflow.com/election/13");

                election.pushHistory();

                resetElection(getMockBotConfig(), election);

                expect(election.prev).to.be.null;
            });

            it('should reset current election state', () => {
                const election = new Election("https://stackoverflow.com/election/13");
                election.addActiveNominee(getMockNominee(election));
                election.arrWinners.push(getMockNominee(election));
                election.moderators.set(-1, /** @type {ModeratorUser} */({}));
                election.phase = "primary";

                resetElection(getMockBotConfig(), election);

                expect(election.numNominees).to.equal(0);
                expect(election.numWinners).to.equal(0);
                expect(election.numMods).to.equal(0);
                expect(election.phase).to.be.null;
            });

        });
    });
});