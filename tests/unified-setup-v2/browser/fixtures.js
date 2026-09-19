'use strict';

const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const QA_PREFIX = 'T1D';

function athleteFixture(count, groupId = null) {
    return Array.from({ length: count }, (_, index) => ({
        memberId: `${QA_PREFIX}-${count}-${String(index + 1).padStart(2, '0')}`,
        athleteId: `${QA_PREFIX}-athlete-${count}-${String(index + 1).padStart(2, '0')}`,
        groupId,
        displayName: `${QA_PREFIX} VDV ${String(index + 1).padStart(2, '0')}`,
    }));
}

const fixtures = {
    fourteen: {
        key: 'fourteen',
        participantCount: 14,
        expectedPairs: 7,
        expectedGroups: { A: 4, B: 3 },
        expectedGroupMatches: 9,
        expectedMatches: { withoutThirdPlace: 12, withThirdPlace: 13 },
        athletes: athleteFixture(14),
    },
    oddFifteen: {
        key: 'odd-fifteen',
        participantCount: 15,
        expectedPairs: 7,
        unpairedMemberCount: 1,
        finalizeMustBeBlocked: true,
        expectedChoices: ['add_member', 'reserve_member', 'switch_format'],
        athletes: athleteFixture(15),
    },
};

function requiredEnvironment() {
    return {
        baseUrl: process.env.PICKHUB_QA_BASE_URL || '',
        adminSession: process.env.PICKHUB_QA_ADMIN_SESSION || '',
        groupId: process.env.PICKHUB_QA_GROUP_ID || '',
        chrome: process.env.CHROME_EXECUTABLE || '',
    };
}

function missingEnvironment(env = requiredEnvironment()) {
    return Object.entries(env)
        .filter(([, value]) => !value)
        .map(([key]) => key);
}

function skipReason(missing) {
    return `SKIP: thiếu env ${missing.join(', ')}; cần provision harness riêng và chạy server checkout này trước release gate`;
}

module.exports = { ROOT, fixtures, requiredEnvironment, missingEnvironment, skipReason };
