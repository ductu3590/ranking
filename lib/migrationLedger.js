const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MIGRATION_FILENAME = /^(\d{3})_(.+)\.sql$/;

function normalizeSql(sql) {
    const normalizedNewlines = String(sql).replace(/\r\n?/g, '\n');
    return `${normalizedNewlines.replace(/\n*$/, '')}\n`;
}

function checksumSql(sql) {
    return crypto.createHash('sha256').update(normalizeSql(sql)).digest('hex');
}

function buildMigrationLedger(directory) {
    const migrations = fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && MIGRATION_FILENAME.test(entry.name))
        .map((entry) => {
            const match = entry.name.match(MIGRATION_FILENAME);
            const sql = fs.readFileSync(path.join(directory, entry.name), 'utf8');
            return {
                version: Number(match[1]),
                filename: entry.name,
                checksum: checksumSql(sql),
            };
        })
        .sort((left, right) => left.filename.localeCompare(right.filename, 'en'));

    const filenamesByVersion = new Map();
    for (const migration of migrations) {
        const filenames = filenamesByVersion.get(migration.version) || [];
        filenames.push(migration.filename);
        filenamesByVersion.set(migration.version, filenames);
    }

    const duplicateVersions = [...filenamesByVersion.entries()]
        .filter(([, filenames]) => filenames.length > 1)
        .map(([version, filenames]) => ({ version, filenames }))
        .sort((left, right) => left.version - right.version);

    return { migrations, duplicateVersions };
}

function escapeSqlLiteral(value) {
    return String(value).replace(/'/g, "''");
}

function renderLedgerSql(migrations) {
    if (!migrations.length) {
        return '-- No migration files found.\n';
    }

    const values = migrations.map((migration) => (
        `    ('${escapeSqlLiteral(migration.filename)}', ${migration.version}, '${migration.checksum}', now(), current_user)`
    ));

    return [
        'INSERT INTO public.pickhub_schema_migrations',
        '    (filename, version, checksum, applied_at, applied_by)',
        'VALUES',
        values.join(',\n'),
        'ON CONFLICT (filename) DO NOTHING;',
        '',
    ].join('\n');
}

module.exports = {
    buildMigrationLedger,
    checksumSql,
    normalizeSql,
    renderLedgerSql,
};
