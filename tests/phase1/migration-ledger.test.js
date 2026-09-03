const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let ledger;
try {
    ledger = require('../../lib/migrationLedger');
} catch (error) {
    assert.fail(`Migration ledger module must load: ${error.message}`);
}

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pickhub-ledger-'));

try {
    fs.writeFileSync(path.join(fixtureDir, '001_first.sql'), 'SELECT 1;\r\n');
    fs.writeFileSync(path.join(fixtureDir, '002_second.sql'), "SELECT 'second';\n");
    fs.writeFileSync(path.join(fixtureDir, '002_duplicate.sql'), 'SELECT 2;\n');
    fs.writeFileSync(path.join(fixtureDir, "003_o'brien.sql"), 'SELECT 3;\n');
    fs.writeFileSync(path.join(fixtureDir, 'notes.md'), 'not a migration');

    assert.strictEqual(ledger.normalizeSql('SELECT 1;\r\n'), 'SELECT 1;\n');

    const result = ledger.buildMigrationLedger(fixtureDir);
    assert.deepStrictEqual(
        result.migrations.map((migration) => migration.filename),
        ['001_first.sql', '002_duplicate.sql', '002_second.sql', "003_o'brien.sql"]
    );
    assert.strictEqual(
        result.migrations[0].checksum,
        'b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd'
    );
    assert.deepStrictEqual(result.duplicateVersions, [
        {
            version: 2,
            filenames: ['002_duplicate.sql', '002_second.sql'],
        },
    ]);

    const sql = ledger.renderLedgerSql(result.migrations);
    assert.match(sql, /INSERT INTO public\.pickhub_schema_migrations/);
    assert.match(sql, /003_o''brien\.sql/);
    assert.match(sql, /ON CONFLICT \(filename\) DO NOTHING/);
    assert.doesNotMatch(sql, /DO UPDATE/);

    const cli = require('../../scripts/migration-ledger');
    const cliJson = cli.run(['--directory', fixtureDir, '--format', 'json']);
    assert.deepStrictEqual(JSON.parse(cliJson).duplicateVersions, result.duplicateVersions);

    const outputPath = path.join(fixtureDir, 'ledger.sql');
    const cliSql = cli.run([
            '--directory',
            fixtureDir,
            '--format',
            'sql',
            '--output',
            outputPath,
        ]);
    assert.strictEqual(cliSql, sql);
    assert.strictEqual(fs.readFileSync(outputPath, 'utf8'), sql);
} finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
}

console.log('phase 1 migration ledger behavior ok');
