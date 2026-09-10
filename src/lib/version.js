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

/*
 * Whether the installed monmux is new enough to talk to.
 *
 * The gate is deliberately generous in one direction and strict in the other. A
 * binary that answers `version --json` at all has the JSON contract by
 * construction, so a version this module cannot parse — `dev`, or the
 * `git describe` string a local build reports — is accepted: that is what lets
 * somebody test a `make go-build` output before a release exists. A version it
 * can parse and that is below the minimum is refused, because there the answer
 * is not a guess.
 */

/** The oldest monmux that carries `switch --json` and `version --json`. */
export const MINIMUM = '0.6.0';

/**
 * What the version says about whether this extension can work.
 *
 * @enum {string}
 */
export const VersionState = Object.freeze({
    /** New enough, or new enough to be given the benefit of the doubt. */
    OK: 'ok',
    /** Parsed, and below {@link MINIMUM}. */
    TOO_OLD: 'too-old',
    /** monmux answered in a way that says nothing about its version. */
    UNKNOWN: 'unknown',
});

/**
 * @typedef {object} SemanticVersion
 * @property {number} major The major component.
 * @property {number} minor The minor component.
 * @property {number} patch The patch component.
 */

/**
 * A plain `X.Y.Z`, optionally with the leading `v` a release tag carries.
 *
 * Anchored at both ends on purpose: `v0.5.0-4-gabc123def456-dirty` is a
 * `git describe` string, not a release, and reading `0.5.0` out of it would
 * turn a local build of the newest source into a "too old" verdict.
 */
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parse a version string.
 *
 * @param {string} version The string monmux reported.
 * @returns {?SemanticVersion} The components, or null when it is not a plain
 *   semantic version.
 */
export function parse(version) {
    if (typeof version !== 'string')
        return null;

    const match = SEMVER.exec(version.trim());
    if (match === null)
        return null;

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}

/**
 * Order two parsed versions.
 *
 * @param {SemanticVersion} left The first version.
 * @param {SemanticVersion} right The second version.
 * @returns {number} Negative when left is older, 0 when equal, positive when
 *   left is newer.
 */
export function compare(left, right) {
    if (left.major !== right.major)
        return left.major - right.major;

    if (left.minor !== right.minor)
        return left.minor - right.minor;

    return left.patch - right.patch;
}

/**
 * @typedef {object} VersionResult
 * @property {string} kind The discriminator the client classified the run as.
 * @property {{version?: string}} [doc] The decoded document, when there is one.
 * @property {number} [exitCode] The exit code, when the run failed.
 * @property {string} [stdout] Raw stdout, when it did not follow the contract.
 * @property {string} [stderr] Raw stderr, when monmux wrote any.
 */

/**
 * Decide what a `version()` result says about the installed monmux.
 *
 * The states map from the client's discriminated result rather than from an
 * exit code, so this module never has to know which number means what.
 *
 * @param {?VersionResult} result What the client returned for `version --json`.
 * @returns {string} One of {@link VersionState}.
 */
export function checkVersion(result) {
    switch (result?.kind) {
    case 'ok':
        return stateForReportedVersion(result.doc?.version);
    case 'unsupported-flag':
        // A monmux that does not know `--json` predates the contract. That is
        // the one case where the absence of an answer *is* the answer.
        return VersionState.TOO_OLD;
    default:
        // `failed`, `protocol`, and anything a newer client learns to return.
        // The menu shows the raw text the result carries rather than guessing
        // a version out of it.
        return VersionState.UNKNOWN;
    }
}

/**
 * The state for the version string in a document that parsed.
 *
 * A document with no `version` at all is unknown rather than acceptable: the
 * generous rule is for a version that cannot be *parsed*, and a field that is
 * missing was never a version to begin with.
 *
 * @param {string} [version] The `version` field, if the document had one.
 * @returns {string} One of {@link VersionState}.
 */
function stateForReportedVersion(version) {
    if (typeof version !== 'string' || version.trim() === '')
        return VersionState.UNKNOWN;

    const reported = parse(version);
    if (reported === null)
        return VersionState.OK;

    const minimum = parse(MINIMUM);
    if (minimum === null)
        return VersionState.UNKNOWN;

    return compare(reported, minimum) < 0 ? VersionState.TOO_OLD : VersionState.OK;
}
