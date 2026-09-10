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

import {MINIMUM, VersionState, checkVersion, compare, parse} from '../src/lib/version.js';
import {assertDeepEqual, assertEqual, describe, fail, it} from './harness.js';

/**
 * The client's result for a `version --json` that decoded.
 *
 * @param {string} version What the document reported.
 * @returns {{kind: string, doc: {version: string}}} An `ok` result.
 */
function ok(version) {
    return {kind: 'ok', doc: {version}};
}

/**
 * Parse a version the test knows is well formed.
 *
 * @param {string} version The version string.
 * @returns {{major: number, minor: number, patch: number}} Its components.
 */
function mustParse(version) {
    const parsed = parse(version);
    if (parsed === null)
        return fail(`${version} did not parse`);

    return parsed;
}

describe('parse', () => {
    it('reads a release tag, leading v and all', () => {
        assertDeepEqual(parse('v0.6.0'), {major: 0, minor: 6, patch: 0});
    });

    it('reads a plain semantic version', () => {
        assertDeepEqual(parse('1.20.3'), {major: 1, minor: 20, patch: 3});
    });

    it('refuses a git describe string', () => {
        // Reading 0.5.0 out of this would call a local build of the newest
        // source "too old", which is exactly backwards.
        assertEqual(parse('v0.5.0-4-gabc123def456-dirty'), null);
    });

    it('refuses everything that is not X.Y.Z', () => {
        for (const value of ['dev', '', 'v', '0.6', '0.6.0.1', 'x0.6.0', '0.6.0-rc1'])
            assertEqual(parse(value), null, value);
    });

    it('ignores surrounding whitespace', () => {
        assertDeepEqual(parse('  v0.6.0\n'), {major: 0, minor: 6, patch: 0});
    });

    it('refuses a value that is not a string', () => {
        for (const value of [null, undefined, 42, {}])
            assertEqual(parse(/** @type {any} */ (value)), null, String(value));
    });
});

describe('compare', () => {
    it('orders by major, then minor, then patch', () => {
        const older = mustParse('0.5.9');
        const newer = mustParse('0.6.0');

        assertEqual(compare(older, newer) < 0, true, 'older is older');
        assertEqual(compare(newer, older) > 0, true, 'newer is newer');
        assertEqual(compare(newer, mustParse('0.6.0')), 0, 'equal');
        assertEqual(compare(mustParse('1.0.0'), mustParse('0.99.99')) > 0, true, 'major wins');
        assertEqual(compare(mustParse('0.6.1'), mustParse('0.6.0')) > 0, true, 'patch decides');
    });
});

describe('checkVersion', () => {
    it('accepts the minimum itself', () => {
        assertEqual(checkVersion(ok(`v${MINIMUM}`)), VersionState.OK);
    });

    it('accepts anything above the minimum', () => {
        assertEqual(checkVersion(ok('v0.7.0')), VersionState.OK, 'minor');
        assertEqual(checkVersion(ok('v1.0.0')), VersionState.OK, 'major');
        assertEqual(checkVersion(ok('v0.6.1')), VersionState.OK, 'patch');
    });

    it('refuses a parsable version below the minimum', () => {
        assertEqual(checkVersion(ok('v0.5.0')), VersionState.TOO_OLD, 'previous release');
        assertEqual(checkVersion(ok('v0.0.1')), VersionState.TOO_OLD, 'much older');
    });

    it('accepts dev, because answering version --json is the contract', () => {
        // A binary that knows the flag has the JSON contract by construction,
        // and this is what lets somebody test a `make go-build` output before
        // the release that carries it exists.
        assertEqual(checkVersion(ok('dev')), VersionState.OK);
    });

    it('accepts a git describe string for the same reason', () => {
        assertEqual(checkVersion(ok('v0.5.0-4-gabc123def456-dirty')), VersionState.OK);
    });

    it('reads an unknown flag as a monmux too old to have the flag', () => {
        // What v0.5.0 does: exit 1, empty stdout, cobra's message on stderr.
        assertEqual(
            checkVersion({kind: 'unsupported-flag', stderr: 'Error: unknown flag: --json'}),
            VersionState.TOO_OLD);
    });

    it('says unknown rather than guessing when monmux failed', () => {
        assertEqual(
            checkVersion({kind: 'failed', exitCode: 1, stderr: 'boom'}),
            VersionState.UNKNOWN);
    });

    it('says unknown when the answer did not follow the contract', () => {
        assertEqual(
            checkVersion({kind: 'protocol', exitCode: 0, stdout: 'not json', stderr: ''}),
            VersionState.UNKNOWN);
    });

    it('says unknown when the document carries no version at all', () => {
        // The generous rule is for a version that cannot be parsed. A field
        // that is absent was never a version to be generous about.
        assertEqual(checkVersion({kind: 'ok', doc: {}}), VersionState.UNKNOWN, 'missing');
        assertEqual(checkVersion(ok('   ')), VersionState.UNKNOWN, 'blank');
    });

    it('says unknown for a result it does not recognise', () => {
        assertEqual(checkVersion({kind: 'something-new'}), VersionState.UNKNOWN, 'new kind');
        assertEqual(checkVersion(/** @type {any} */ (null)), VersionState.UNKNOWN, 'nothing');
    });
});
