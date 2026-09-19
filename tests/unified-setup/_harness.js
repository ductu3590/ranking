'use strict';

// QA harness for the unified tournament setup work.
// Every check records HOW it was obtained so a reader can never mistake a source
// grep for end-to-end proof:
//   'static'  = static source/SQL text inspection (no product code executed)
//   'runtime' = node executed the module under test
//   'live'    = a real HTTP call against a running server
//   'browser' = a real browser drove the real UI
// Nothing in this directory produces 'live' or 'browser' evidence unless the
// browser harness is run with all of its prerequisites present.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function abs(relPath) {
    return path.join(ROOT, relPath);
}

function exists(relPath) {
    return fs.existsSync(abs(relPath));
}

// Loud read: a missing file is a FAILURE with a precise message, never a skip.
// Line endings vary per file in this tree (some app/ files are CRLF on disk, most
// lib/ and tests/ files are LF), so normalise: assertions must never fail for EOL
// reasons, that would be a false finding.
function readSource(relPath) {
    const full = abs(relPath);
    if (!fs.existsSync(full)) {
        const error = new Error(`MISSING FILE: ${relPath} (expected at ${full}). This is a FAIL, not a skip: the frozen contract requires this file to exist.`);
        error.missingFile = relPath;
        throw error;
    }
    return fs.readFileSync(full, 'utf8').split(CR_LF).join(LF);
}

const CR_LF = String.fromCharCode(13) + String.fromCharCode(10);
const LF = String.fromCharCode(10);

function createChecker(label, evidenceKind) {
    const failures = [];
    const passes = [];

    function record(passed, message, detail) {
        if (passed) passes.push(message);
        else failures.push(detail ? `${message}${LF}      detail: ${detail}` : message);
        return passed;
    }

    return {
        label,
        evidenceKind,
        ok(condition, message, detail) {
            return record(Boolean(condition), message, detail);
        },
        match(text, regex, message) {
            return record(regex.test(text), message, `expected to find ${regex}`);
        },
        noMatch(text, regex, message) {
            const hit = regex.exec(text);
            return record(!hit, message, hit ? `forbidden pattern ${regex} found: ${JSON.stringify(String(hit[0]).slice(0, 200))}` : null);
        },
        // Asserts patterns appear in this order inside one text body.
        ordered(text, patterns, message) {
            let cursor = -1;
            let broken = null;
            for (const pattern of patterns) {
                const rest = text.slice(cursor + 1);
                const index = rest.search(pattern);
                if (index < 0) { broken = `${pattern} not found after position ${cursor}`; break; }
                cursor = cursor + 1 + index;
            }
            return record(!broken, message, broken);
        },
        fail(message, detail) {
            return record(false, message, detail);
        },
        done() {
            const total = passes.length + failures.length;
            if (failures.length) {
                console.error(`${LF}[${evidenceKind.toUpperCase()} EVIDENCE] ${label}: ${passes.length}/${total} checks passed, ${failures.length} FAILED`);
                failures.forEach((failure, index) => console.error(`  ${index + 1}. ${failure}`));
                console.error('');
                process.exitCode = 1;
                return false;
            }
            console.log(`[${evidenceKind.toUpperCase()} EVIDENCE] ${label}: ${passes.length}/${total} checks passed`);
            return true;
        },
    };
}

// Strips comments so "forbidden pattern" checks are neither satisfied nor tripped
// by prose inside comments.
function stripJsComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*/g, '$1 ');
}

function stripSqlComments(sql) {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--.*/g, ' ');
}

module.exports = { ROOT, abs, exists, readSource, createChecker, stripJsComments, stripSqlComments, LF };
