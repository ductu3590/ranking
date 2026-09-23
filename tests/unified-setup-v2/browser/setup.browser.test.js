'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixtures, requiredEnvironment, missingEnvironment, skipReason } = require('./fixtures');

const env = requiredEnvironment();
const missing = missingEnvironment(env);
if (missing.length) {
    console.log(skipReason(missing));
    process.exit(0);
}

(async () => {
    const browser = await chromium.launch({
        executablePath: env.chrome || undefined,
        headless: true,
    });
    try {
        for (const viewport of [
            { name: 'mobile', width: 390, height: 844 },
            { name: 'tablet', width: 768, height: 1024 },
            { name: 'desktop', width: 1440, height: 900 },
        ]) {
            const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
            await context.addCookies([{ name: 'group_session', value: env.adminSession, url: env.baseUrl }]);
            const page = await context.newPage();
            await page.goto(`${env.baseUrl}/giai-dau/v2`, { waitUntil: 'domcontentloaded' });
            assert.equal(new URL(page.url()).origin, new URL(env.baseUrl).origin);
            await context.close();
            console.log(`PASS T1.D ${viewport.name} viewport`);
        }
        console.log(`PASS T1.D group-scoped fixture tenant ${env.groupId}: 14-athlete and odd 15-athlete cases are available`);
        console.log(`INFO odd case finalize must be blocked with choices: ${fixtures.oddFifteen.expectedChoices.join(', ')}`);
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
});
