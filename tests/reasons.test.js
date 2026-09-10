/*
 * This file is part of the monmux GNOME Shell extension.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * The monmux GNOME Shell extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * The monmux GNOME Shell extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import GLib from 'gi://GLib';

import {CODES, Reasons} from '../src/lib/reasons.js';
import {assertDeepEqual, assertEqual, describe, fail, it} from './harness.js';

/**
 * What monmux emits, copied from its source rather than derived from this
 * extension's own table.
 *
 * Deriving the expectation from CODES would make the assertion circular:
 * deleting an entry from reasons.js would delete it from the expectation too,
 * and the suite would stay green. These lists are the contract, so they are
 * written out, and a code monmux adds or removes shows up here as a failure.
 *
 * Sources, in the monmux repository: internal/refusal/refusal.go for the
 * refusal reasons, internal/backend/display.go for the statuses,
 * internal/catalog/catalog.go for the match results and the grades. The monmux
 * states and the input states are this extension's own, from the model.
 */
const EXPECTED = Object.freeze({
    refusal: Object.freeze([
        'backend-unavailable',
        'backend-not-ready',
        'enumeration-failed',
        'no-displays',
        'display-not-writable',
        'unknown-monitor',
        'ambiguous-catalog',
        'multiple-candidates',
        'input-not-enabled',
        'serial-mismatch',
        'target-not-ready',
        'identity-changed',
        'invalid-operation',
    ]),
    // `ok` is deliberately absent: a display in that state gets no sentence.
    status: Object.freeze(['no-ddc-channel', 'edid-unreadable', 'no-uuid']),
    // `exact` is deliberately absent, for the same reason.
    match: Object.freeze(['none', 'ambiguous']),
    inputState: Object.freeze(['enabled', 'recorded']),
    grade: Object.freeze(['verified', 'documented', 'reported', 'quoted']),
    // `ok` is deliberately absent: the menu shows the displays, not a sentence.
    monmux: Object.freeze(['missing', 'too-old', 'unknown']),
});

/** Every code, flattened out of the groups. */
const everyCode = Object.values(CODES).flat();

/**
 * A table of code groups in a form two of them can be compared in.
 *
 * @param {{[group: string]: readonly string[]}} table The groups.
 * @returns {[string, string[]][]} Each group and its codes, both sorted.
 */
function sortedGroups(table) {
    return Object.entries(table)
        .map(([group, codes]) => /** @type {[string, string[]]} */ ([group, [...codes].sort()]))
        .sort(([left], [right]) => left.localeCompare(right));
}

/**
 * A gettext that marks what it was given, so a string that never reached it is
 * visible in the assertion rather than merely equal to itself.
 *
 * @param {string} message The msgid.
 * @returns {string} The msgid, marked.
 */
function translate(message) {
    return `[${message}]`;
}

describe('Reasons', () => {
    it('covers exactly the codes monmux emits, no more and no fewer', () => {
        // Compared as whole tables rather than group by group, so a group that
        // appears on one side and not the other fails here too.
        assertDeepEqual(sortedGroups(CODES), sortedGroups(EXPECTED), 'codes by group');
    });

    it('has a translated entry for every code the model can emit', () => {
        const reasons = new Reasons(translate);

        for (const code of everyCode) {
            const {text} = reasons.describe(code);

            if (text === code)
                fail(`${code} has no entry: it rendered as itself`);

            if (!text.startsWith('[') || !text.endsWith(']'))
                fail(`${code} produced ${text}, which did not go through gettext`);

            if (text === '[]')
                fail(`${code} has an empty sentence`);
        }
    });

    it('uses each code in exactly one group', () => {
        // A code in two groups would collapse in the flat lookup, and one
        // group would silently take the other's sentence.
        const seen = new Set();

        for (const code of everyCode) {
            if (seen.has(code))
                fail(`${code} appears in more than one group`);

            seen.add(code);
        }
    });

    it('renders an unknown code as itself rather than as nothing', () => {
        // A value from a monmux newer than this extension. Showing it verbatim
        // is what lets somebody report it; hiding it loses the only evidence.
        const reasons = new Reasons(translate);
        const {text, link} = reasons.describe('some-future-reason');

        assertEqual(text, 'some-future-reason', 'text');
        assertEqual(link, null, 'link');
    });

    it('gives every refusal reason a link to its own troubleshooting section', () => {
        const reasons = new Reasons(translate);

        for (const code of CODES.refusal) {
            const {link} = reasons.describe(code);

            if (link === null) {
                fail(`${code} has no link`);

                continue;
            }

            assertEqual(link.endsWith(`#${code}`), true, `${code} fragment`);
        }
    });

    it('produces only absolute https links, with a host', () => {
        const reasons = new Reasons(translate);

        for (const code of everyCode) {
            const {link} = reasons.describe(code);
            if (link === null)
                continue;

            const parsed = GLib.Uri.parse(link, GLib.UriFlags.NONE);
            assertEqual(parsed.get_scheme(), 'https', `${code} scheme`);

            const host = parsed.get_host();
            if (host === null || host === '')
                fail(`${code} links to ${link}, which has no host`);
        }
    });

    it('translates lazily, so one table serves every locale', () => {
        const first = new Reasons(message => `one:${message}`);
        const second = new Reasons(message => `two:${message}`);

        const code = CODES.refusal[0];
        assertEqual(first.text(code).startsWith('one:'), true, 'first');
        assertEqual(second.text(code).startsWith('two:'), true, 'second');
    });

    it('says nothing about a monitor that monmux did not say', () => {
        // The catalog records evidence grades; it does not record why an input
        // is disabled, who reported a value, or which project a quoted one came
        // from. The grade is how strong the evidence is, and that is all this
        // may claim.
        const reasons = new Reasons(message => message);

        assertEqual(reasons.text('recorded'), 'Recorded, not write-enabled.');
        assertEqual(reasons.text('verified'), 'tested directly on this model');
        assertEqual(
            reasons.text('quoted'),
            'quoted in a report, inputs not tried one by one');

        for (const grade of CODES.grade) {
            const text = reasons.text(grade);

            for (const claim of ['user', 'project', 'wiki', 'GitHub']) {
                if (text.includes(claim))
                    fail(`the ${grade} grade claims a source: ${text}`);
            }
        }
    });
});
