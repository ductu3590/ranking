const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, [require('path').join(__dirname, 'participant-contract.test.js')], { stdio: 'inherit' });
process.exit(result.status || 0);
