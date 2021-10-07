import { getBadges, getStackApiKey, getUserInfo } from "./api.js";
import Election from "./election.js";
import { getRandomOops, RandomArray } from "./random.js";
import { calculateScore } from "./score.js";
import {
    capitalize, dateToRelativetime, linkToRelativeTimestamp,
    linkToUtcTimestamp, listify, makeURL, mapToName, mapToRequired, pluralize, pluralizePhrase
} from "./utils.js";
import { parsePackage } from "./utils/package.js";

/**
 * @typedef {import("./index").ElectionBadge} Badge
 * @typedef {import("./config").BotConfig} BotConfig
 * @typedef {import("./api").ModeratorInfo} ModeratorInfo
 */

/**
 * @summary makes bot remind users that they are here
 * @param {Election} election
 * @returns {string}
 */
export const sayHI = (election) => {
    const { arrNominees, electionUrl, phase } = election;

    const { length } = arrNominees;

    const electionLink = makeURL("election", `${electionUrl}?tab=${phase}`);
    const phasePrefix = `The ${electionLink} is in the ${phase} phase`;

    const pluralCandidates = pluralizePhrase(length, `are ${length} candidates`, `is ${length} candidate`);

    const phaseMap = {
        "null": `The ${electionLink} has not begun yet.`,
        "ended": `The ${electionLink} has ended.`,
        "cancelled": `The ${electionLink} has been cancelled.`,
        "election": `The ${electionLink} is happening at the moment!`,
        "nomination": `${phasePrefix}, and currently there ${pluralCandidates}.`,
        "primary": `${phasePrefix}, and currently there ${pluralCandidates}.`,
    };

    const greeting = 'Welcome to the election chat room! ';
    const phaseText = phaseMap[phase] || "";
    const helpCommand = `@ElectionBot help`;

    return `${greeting}${phaseText} I can answer commonly-asked questions about elections (type *${helpCommand}* for more info).`;
};

/**
 * @summary builds a response why nomination is removed
 * @returns {string}
 */
export const sayWhyNominationRemoved = () => {
    const freeToRemove = `Candidates may withdraw their nomination any time before the election phase.`;
    return `${freeToRemove} Nominations made in bad faith, or candidates who do not meet the requirements may also be removed by community managers.`;
};

/**
 * @summary builds a response on how to nominate self or others
 * @param {Election} election
 * @param {object} electionBadges list of election badges
 * @param {boolean} mentionsAnother if user asks about nominating others
 * @returns {string}
 */
export const sayHowToNominate = (election, electionBadges, mentionsAnother = false) => {

    const requiredBadges = electionBadges.filter(mapToRequired);
    const requiredBadgeNames = requiredBadges.map(mapToName);

    const { siteHostname } = election;

    // Markup to bold additional text if talking about nominating others
    const mentionsAnotherBold = mentionsAnother ? '**' : '';

    let requirements = [`at least ${election.repNominate} reputation`];
    if (election.isStackOverflow) requirements.push(`have these badges (*${requiredBadgeNames.join(', ')}*)`);
    if (siteHostname && /askubuntu\.com$/.test(siteHostname)) requirements.push(`[signed the Ubuntu Code of Conduct](https://askubuntu.com/q/100275)`);
    requirements.push(`and cannot have been suspended anywhere on the [Stack Exchange network](https://stackexchange.com/sites?view=list#traffic) within the past year`);

    return `You can only nominate yourself as a candidate during the nomination phase. You'll need ${requirements.join(', ')}. ${mentionsAnotherBold}You cannot nominate another user.${mentionsAnotherBold}`;
};

/**
 * @summary builds a response to if mods are paid
 * @param {Election} election
 * @returns {string}
 */
export const sayAreModsPaid = (election) => {
    const { siteUrl } = election;

    const modsURI = makeURL("Elected ♦ moderators", `${siteUrl}/help/site-moderators`);

    return `${modsURI} is an entirely voluntary role, and they are not paid by Stack Exchange.`;
};

/**
 * TODO: do not add nomination phase if not started
 * @summary Default election message
 * @param {Election} election
 * @returns {string}
 */
export const sayNotStartedYet = ({ dateNomination, electionUrl }) => `The ${makeURL("election", electionUrl)} has not started yet. The **nomination** phase is starting at ${linkToUtcTimestamp(dateNomination)} (${dateToRelativetime(dateNomination)}).`;

/**
 * @summary gets election is over response text
 * @param {Election} election
 * @returns {string}
 */
export const sayElectionIsOver = ({ electionUrl }) => `The ${makeURL("election", electionUrl)} is over. See you next time!`;

/**
 * @summary Calculate num of days/hours to start of final election, so we can remind users in the primary to come back
 * @returns {string}
 */
export const sayInformedDecision = () => `If you want to make an informed decision on who to vote for, you should read the candidates' answers to the questionnaire, and also look at examples of their participation on Meta and how they conduct themselves.`;

/**
 * @summary builds a response to voting info query
 * @param {Election} election
 * @returns {string}
 */
export const sayAboutVoting = (
    election
) => {
    const { dateElection, electionUrl, phase, repVote, statVoters } = election;

    const comeBackFinalPhaseText = ` Don't forget to come back ${linkToRelativeTimestamp(dateElection)} to also vote in the election's final voting phase!`;

    const phaseMap = {
        cancelled: statVoters,
        ended: `The ${makeURL("election", electionUrl)} has ended. You can no longer vote.`,
        election: `If you have at least ${repVote} reputation, you can cast your ballot in order of preference on up to three candidates in [the election](${electionUrl}?tab=election). ${sayInformedDecision()}`,
        nomination: `You cannot vote yet. In the meantime you can read and comment on the [candidates' nominations](${electionUrl}?tab=nomination) as well as their answers to the questionnaire to find out more about their moderation style.${comeBackFinalPhaseText}`,
        primary: `If you have at least ${repVote} reputation, you can freely [vote on the candidates](${electionUrl}?tab=primary). ${sayInformedDecision()}${comeBackFinalPhaseText}`
    };

    return phaseMap[phase] || sayNotStartedYet(election);
};

/**
 * @summary builds a response to badges of a certain type query
 * @param {Badge[]} badges
 * @param {Badge["type"]} type
 * @param {boolean} [isSO]
 * @returns {string}
 */
export const sayBadgesByType = (badges, type, isSO = true) => {
    const filtered = badges.filter(({ type: btype }) => btype === type);

    const { length } = filtered;

    const numBadgesPrefix = `The ${length} ${type} badge${pluralize(length)} ${pluralize(length, "are", "is")}: `;

    return numBadgesPrefix + (
        isSO ?
            filtered.map(({ badge_id, name }) => makeURL(name, `https://stackoverflow.com/help/badges/${badge_id}`)) :
            filtered.map(({ name }) => name)
    ).join(", ");
};

/**
 * @summary builds a response to the required badges query
 * @param {Election} election
 * @param {Badge[]} badges
 * @returns {string}
 */
export const sayRequiredBadges = (election, badges, isSO = true) => {

    if (!isSO) {
        return "There are no required badges for elections on this site.";
    }

    const { repNominate } = election;

    const required = badges.filter(({ required }) => required);

    const { length } = required;

    const numBadgesPrefix = `The ${length} required badge${pluralize(length)} to nominate yourself ${pluralize(length, "are", "is")}: `;

    const badgeList = required.map(({ badge_id, name }) => makeURL(name, `https://stackoverflow.com/help/badges/${badge_id}`)).join(", ");

    const repPostfix = ` You'll also need ${repNominate} reputation.`;

    return numBadgesPrefix + badgeList + repPostfix;
};

/**
 * @summary builds missing badges response message
 * @param {string[]} badgeNames
 * @param {number} count
 * @param {boolean} [required]
 * @returns {string}
 */
export const sayMissingBadges = (badgeNames, count, ownSelf = false, required = false) =>
    ` ${ownSelf ? "You are" : "The user is"} missing ${pluralizePhrase(count, "these", "this")} ${required ? "required" : ""} badge${pluralize(count)}: ${badgeNames.join(', ')}.`;

/**
 * @summary builds current mods list response message
 * @param {Election} election
 * @param {import("./api.js").ModeratorInfo[]} currMods
 * @param {import("html-entities")["decode"]} decodeEntities
 * @returns {string}
 */
export const sayCurrentMods = (election, currMods, decodeEntities) => {
    const { length: numCurrMods } = currMods;

    const { siteUrl } = election;

    const currModNames = currMods.map(({ display_name }) => display_name);

    const toBe = numCurrMods > 1 ? "are" : "is";

    return "The current " + (numCurrMods > 0 ?
        `${numCurrMods} ${makeURL(`moderator${pluralize(numCurrMods)}`, `${siteUrl}/users?tab=moderators`)} ${toBe}: ${decodeEntities(currModNames.join(', '))}`
        : `moderators can be found on ${makeURL("this page", `${siteUrl}/users?tab=moderators`)}`);
};

/**
 * @summary builds another site's mods list response message
 * @param {string} otherSiteUrl
 * @param {import("./api.js").ModeratorInfo[]} currMods
 * @param {import("html-entities")["decode"]} decodeEntities
 * @returns {string}
 */
export const sayOtherSiteMods = (otherSiteText, otherSiteUrl, currMods, decodeEntities) => {
    const { length: numCurrMods } = currMods;

    const currModNames = currMods.map(({ display_name }) => display_name);

    const toBe = numCurrMods > 1 ? "are" : "is";

    const responseText = "The current " + (numCurrMods > 0 ?
        `${numCurrMods} ${otherSiteText} ${makeURL(`moderator${pluralize(numCurrMods)}`, `${otherSiteUrl}/users?tab=moderators`)} ${toBe}: ${decodeEntities(currModNames.join(', '))}`
        : `${otherSiteText} moderators can be found on ${makeURL("this page", `${otherSiteUrl}/users?tab=moderators`)}`);

    console.log("sayOtherSiteMods", otherSiteText, otherSiteUrl, currModNames, toBe, responseText);

    return responseText;
};

/**
 * @summary builds next phase response message
 * @param {Election} election
 * @returns {string}
 */
export const sayNextPhase = (election) => {
    const { phase, datePrimary, dateElection, dateEnded, electionUrl, statVoters } = election;

    const phaseMap = {
        "cancelled": statVoters,
        "election": `The [election](${electionUrl}?tab=election) is currently in the final voting phase, ending at ${linkToUtcTimestamp(dateEnded)} (${dateToRelativetime(dateEnded)}).`,
        "ended": sayElectionIsOver(election),
        "null": sayNotStartedYet(election),
        "nomination": `The next phase is the ${datePrimary ?
            `**primary** at ${linkToUtcTimestamp(datePrimary)} (${dateToRelativetime(datePrimary)}).` :
            `**election** at ${linkToUtcTimestamp(dateElection)} (${dateToRelativetime(dateElection)}).`}`,
        "primary": `The next phase is the **election** at ${linkToUtcTimestamp(dateElection)} (${dateToRelativetime(dateElection)}).`
    };

    return phaseMap[phase];
};

/**
 * @summary builds current winners message
 * @param {Election} election
 * @returns {string}
 */
export const sayCurrentWinners = (election) => {
    const { phase, arrWinners = [], siteUrl, electionUrl } = election;

    const phaseMap = {
        "default": `The election is not over yet. Stay tuned for the winners!`,
        "null": sayNotStartedYet(election),
        "ended": `The winners can be found on the ${makeURL("election page", electionUrl)}.`
    };

    const { length } = arrWinners;

    if (phase === 'ended' && length > 0) {
        const winnerNames = arrWinners.map(({ userName, userId }) => makeURL(userName, `${siteUrl}/users/${userId}`));
        return `The winner${pluralize(length)} ${length > 1 ? 'are' : 'is'}: ${winnerNames.join(', ')}.`;
    }

    return phaseMap[phase] || phaseMap.default;
};

/**
  * @summary builds the election schedule message
  * @param {Election} election
  * @returns {string}
  */
export const sayElectionSchedule = (election) => {
    const { dateElection, dateNomination, datePrimary, dateEnded, phase, siteName, electionNum } = election;

    const arrow = ' <-- current phase';

    const prefix = `    ${siteName} Election ${electionNum} Schedule`;

    const dateMap = [
        ["nomination", dateNomination],
        ["primary", datePrimary],
        ["election", dateElection],
        ["ended", dateEnded]
    ];

    const maxPhaseLen = Math.max(...dateMap.map(([{ length }]) => length));

    const phases = dateMap.map(
        ([ph, date]) => `    ${capitalize(ph)}: ${" ".repeat(maxPhaseLen - ph.length)}${date || "never"}${ph === phase ? arrow : ""}`
    );

    return [prefix, ...phases].join("\n");
};

/**
 * @summary builds an off-topic warning message
 * @param {Election} election
 * @param {string} asked
 * @returns {string}
 */
export const sayOffTopicMessage = (election, asked) => {
    const { electionUrl } = election;

    const text = `This room is for discussion about the ${makeURL("election", electionUrl)}. Please try to keep the room on-topic. Thank you!`;

    const [, messageId] = asked.split('offtopic');

    // Reply to specific message if valid message id
    return +messageId ? `:${messageId} ${text}` : text;
};

/**
 * @summary builds a message about mod responsibilities
 * @param {Election} election
 * @returns {string}
 */
export const sayWhatModsDo = (election) => {
    const { siteUrl } = election;

    const modActivities = [
        `investigating sockpuppet accounts`,
        `suspending users`,
        `migrating questions to any network site`,
        `and performing post redactions`
    ];

    const modsAre = `essential to keeping the site clean, fair, and friendly by enforcing the ${makeURL("Code of Conduct", `${siteUrl}/conduct`)}`;

    const modsDo = `They are volunteers who are granted [additional privileges](https://meta.stackexchange.com/q/75189) to handle situations regular users can't, like ${modActivities.join(", ")}`;

    return `${makeURL("Elected ♦ moderators", `${siteUrl}/help/site-moderators`)} are ${modsAre}. ${modsDo}.`;
};

/**
 * @summary builds a candidate score formula message
 * @param {Badge[]} badges
 * @returns {string}
 */
export const sayCandidateScoreFormula = (badges) => {

    const badgeCounts = { moderation: 0, editing: 0, participation: 0 };

    const numModBadges = badges.reduce((a, { type }) => {
        a[type] += 1;
        return a;
    }, badgeCounts);

    const counts = Object.entries(numModBadges).map(([type, count]) => `${count} ${type}`);

    const badgeSum = Object.values(numModBadges).reduce((a, c) => a + c);

    const maxRepPts = 20;

    const allPts = badgeSum + maxRepPts;

    const repPts = `1 point for each 1,000 reputation up to 20,000 reputation (${maxRepPts} point${pluralize(badgeSum)})`;

    const badgePts = `and 1 point for each of the ${listify(...counts)} badges (${badgeSum} point${pluralize(badgeSum)})`;

    const formula = `${repPts}; ${badgePts}`;

    return `The ${allPts}-point ${makeURL("candidate score", "https://meta.stackexchange.com/a/252643")} is calculated this way: ${formula}`;
};

/**
 * @summary builds a candidate score formula message
 * @param {string} electionSiteApiSlug
 * @returns {string}
 */
export const sayCandidateScoreLeaderboard = (electionSiteApiSlug) => {
    return `Here are the top ${makeURL("users sorted by candidate score and reputation", `https://data.stackexchange.com/${electionSiteApiSlug}/query/1467000`)}.`;
};

/**
 * @summary builds an election definition message
 * @param {Election} election
 * @returns {string}
 */
export const sayWhatIsAnElection = (election) => {
    const { repVote } = election;

    const diamondURL = makeURL("diamond ♦ moderator", "https://meta.stackexchange.com/q/75189");
    const electionURL = makeURL("election", "https://meta.stackexchange.com/q/135360");
    const eligibility = `users with at least ${repVote} reputation can vote for them`;

    return `An ${electionURL} is where users nominate themselves as candidates for the role of ${diamondURL}, and ${eligibility}.`;
};

/**
 * @summary builds a contributor list message
 * @param {BotConfig} config
 * @returns {Promise<string>}
 */
export const sayWhoMadeMe = async (config) => {
    const info = await parsePackage("./package.json");
    if (!info) {
        if (config.debug) console.log("failed to parse bot package");
        return `${makeURL("Samuel", "https://so-user.com/584192?tab=profile")} made me.`;
    }

    const { author, contributors } = info;

    const created = `${makeURL(author.name, /** @type {string} */(author.url))} created me`;
    const contributed = listify(...contributors.map(({ name, url }) => makeURL(name, /** @type {string} */(url))));
    const maintainers = `I am also maintained by ${contributed}`;

    return `${created}. ${maintainers}.`;
};

/**
 * @summary builds an "already a diamond" message
 * @param {boolean} isModerator is user a current moderator
 * @param {boolean} wasModerator was user a moderator
 * @returns {string}
 */
export const sayDiamondAlready = (isModerator, wasModerator) => {

    /**
     * @type {[boolean, string][]}
     */
    const messageMap = [
        [isModerator, `${getRandomOops()} you already have a diamond!`],
        [wasModerator, `are you *really* sure you want to be a moderator again?`]
    ];

    const [, message] = messageMap.find(([condition]) => condition) || [];
    return message || `diamonds are forever!`;
};

/**
 * @summary builds a "number of positions" message
 * @param {BotConfig} _config bot configuration
 * @param {Election} election current election
 * @param {string} _text message content
 * @returns {string}
 */
export const sayNumberOfPositions = (_config, election, _text) => {
    const { numPositions = 0 } = election;

    const suffix = pluralize(numPositions, "s", "");
    const pastBe = pluralize(numPositions, "were", "was");
    const currBe = pluralize(numPositions, "are", "is");
    const future = pluralize(numPositions, "will be", "shall be");

    const rules = [
        [election.isActive(), currBe],
        [election.isNotStartedYet(), future],
        [election.isEnded(), pastBe]
    ];

    const [_rule, modal] = rules.find(([rule]) => rule) || [, `${currBe}/${pastBe}/${future}`];

    return `${numPositions} mod${suffix} ${modal} elected`;
};

/**
 * @param {BotConfig} config bot configuration
 * @param {Election} election current election
 * @param {string} text message content
 * @returns {Promise<string>}
 */
export const sayUserEligibility = async (config, election, text) => {
    const userId = +text.replace(/\D/g, "");

    const { apiKeyPool } = config;

    const { apiSlug } = election;

    const userBadges = await getBadges(config, userId, apiSlug, getStackApiKey(apiKeyPool));

    const requestedUser = await getUserInfo(config, userId, apiSlug, getStackApiKey(apiKeyPool));

    if (!requestedUser) {
        return `Can't answer now, please ask me about it later`;
    };

    const { isEligible } = calculateScore(requestedUser, userBadges, election);

    const nlp = new RandomArray("nominate", "be elected", "become a mod");

    return `User ${requestedUser.display_name} is${isEligible ? "" : " not"} eligible to ${nlp.getRandom()}`;
};

/**
 * @fun
 * @summary builds a "how many mods it takes" response message
 * @param {ModeratorInfo[]} moderators current moderators
 * @returns {string}
 */
export const sayHowManyModsItTakesToFixLightbulb = (moderators) => {
    const names = moderators.map(({ display_name }) => display_name);

    const requires = new RandomArray(...names);

    const times = Math.floor(Math.random() * requires.length);
    if (!times) return `Sorry, mods do not fix lightbulbs`;

    return `It only takes ${times} mod${pluralize(times, "s")}! Just ask ${requires.getRandom()}`;
};