import { expect } from "chai";
import dotenv from "dotenv";
import { test } from "mocha";
import { HerokuClient } from "../../src/bot/herokuClient.js";
import { getMockBotConfig } from "../mocks/bot.js";

describe('Heroku API integration', function () {

    dotenv.config();

    const testInstanceName = "se-electionbot-test";
    const hasCreds = !!process.env.HEROKU_API_TOKEN;
    const testIf = hasCreds ? test : test.skip;

    if (!hasCreds) {
        console.log("Cannot test Heroku API integration with no API token, skipping");
    }

    this.timeout(5e3); // APIs can be slow

    const heroku = new HerokuClient(getMockBotConfig({
        flags: {
            debug: false,
            fun: false,
            verbose: false,
            announcedWinners: true,
            saidElectionEndingSoon: true
        }
    }));

    testIf('should be able to fetch environment variables', async () => {
        const app = await heroku.fetchInstance(testInstanceName);
        const configVars = await heroku.fetchConfigVars(app.name);
        expect(typeof configVars).to.equal("object");
    });

    testIf('should be able to update environment variables', async () => {
        const success = await heroku.updateConfigVars(testInstanceName, {
            "TEST": "pass"
        });
        expect(success).to.be.true;
    });

    testIf('should not be able to update sensitive environment variables', async () => {
        const success = await heroku.updateConfigVars(testInstanceName, {
            "TEST": "fail",
            "ACCOUNT_EMAIL": "fail",
            "ACCOUNT_PASSWORD": "fail"
        });
        expect(success).to.be.false;
    });

    testIf('should be able to fetch instances', async () => {
        const instances = await heroku.fetchInstances();
        expect(instances.length).to.be.at.least(6);
    });
});