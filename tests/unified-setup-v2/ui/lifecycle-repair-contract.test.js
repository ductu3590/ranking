'use strict';

const { assert, read } = require('../_harness');

const dashboard = read('app/giai-dau/v2/TournamentV2DashboardClient.js');
const wizard = read('app/giai-dau/v2/TournamentWizard.js');
const context = read('app/giai-dau/v2/setup/SetupContext.js');

assert.match(dashboard, /const creating = createMode === 'internal';/, 'create view derives from the current URL');
assert.doesNotMatch(dashboard, /useState\(createMode === 'internal'\)/, 'create mode is not copied into initial component state');
assert.match(dashboard, /function setCreateMode\(enabled\)/, 'create mode changes are reflected in the URL');
assert.match(context, /useEffect\(\(\) => \{[\s\S]*type: 'hydrate'/, 'provider hydrates a changed initial draft');
assert.match(context, /state\.saveStatus === 'dirty' \|\| state\.saveStatus === 'saving' \|\| state\.isFinalizing/, 'hydrate preserves in-progress local work');
assert.match(context, /idempotencyKey: safeDraft\.idempotencyKey \|\| null/, 'normalization preserves the idempotency key');
assert.match(context, /clientDraftKey: safeDraft\.clientDraftKey \|\| null/, 'normalization preserves the client draft key');
assert.match(context, /matchState: safeDraft\.matchState \|\| \{\}/, 'normalization preserves match state');
assert.match(wizard, /function ReviewFinalizeStepWithLifecycle\(\)/, 'review action bridge reads provider lifecycle actions');
assert.match(wizard, /onSaveDraft=\{saveDraft\}/, 'review save uses provider save lifecycle');
assert.match(wizard, /onFinalize=\{finalizeDraft\}/, 'review finalize uses provider finalize lifecycle');
assert.doesNotMatch(wizard, /onSaveDraft=\{\(\) => adapter\.saveDraft/, 'review does not bypass provider save state');
assert.match(wizard, /const persisted = aggregate\.draft/, 'wizard hydrates from the persisted aggregate snapshot first');
assert.match(wizard, /\.\.\.persisted,[\s\S]*clientDraftKey: persisted\.clientDraftKey/, 'wizard preserves server draft ids, revision, and durable client key on reload');

console.log('R1/R2 lifecycle repair contract ok');