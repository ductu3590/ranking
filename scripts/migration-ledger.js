const fs = require('fs');
const path = require('path');
const { buildMigrationLedger, renderLedgerSql } = require('../lib/migrationLedger');

function readOption(args, index, name) {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
        throw new Error(`${name} requires a value`);
    }
    return value;
}

function parseArguments(args) {
    const options = {
        directory: path.resolve(process.cwd(), 'database/migrations'),
        format: 'json',
        output: null,
    };

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--directory') {
            options.directory = path.resolve(readOption(args, index, '--directory'));
            index += 1;
        } else if (argument === '--format') {
            options.format = readOption(args, index, '--format');
            index += 1;
        } else if (argument === '--output') {
            options.output = path.resolve(readOption(args, index, '--output'));
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }

    if (!['json', 'sql'].includes(options.format)) {
        throw new Error('--format must be json or sql');
    }

    return options;
}

function run(args) {
    const options = parseArguments(args);
    const ledger = buildMigrationLedger(options.directory);
    const output = options.format === 'sql'
        ? renderLedgerSql(ledger.migrations)
        : `${JSON.stringify(ledger, null, 2)}\n`;

    if (options.output) {
        fs.mkdirSync(path.dirname(options.output), { recursive: true });
        fs.writeFileSync(options.output, output);
    }

    return output;
}

if (require.main === module) {
    try {
        const output = run(process.argv.slice(2));
        if (!process.argv.includes('--output')) {
            process.stdout.write(output);
        }
    } catch (error) {
        process.stderr.write(`migration-ledger: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { parseArguments, run };
