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
 * What the menu shows, decided from what monmux reported and from nothing else.
 *
 * The model carries codes, never sentences. Every code becomes text in
 * reasons.js, so a translated menu has no untranslated sentence hiding in here,
 * and nothing in this file can word a reason more strongly than monmux gave it.
 * The only human strings that pass through are monmux's own, verbatim: the
 * label its catalog records for each input, the display and model names, a
 * failing check, and the raw output of a run that produced no usable document.
 * None of them is translated, because each is what monmux itself prints.
 *
 * Nothing here is policy. Which inputs are enabled comes from `enabledInputs`
 * and from nowhere else. The catalog's `writeEnabled` is never read: whether a
 * display may be written to is monmux's decision, and it has already taken it by
 * the time `info` answers. The catalog is joined only to label what `info`
 * named, and to show - greyed - what the entry records beyond that.
 *
 * A greyed input says what the fields say and stops there: that the input is
 * recorded and not enabled, and the grade of the evidence behind it. The JSON
 * carries no reason an input is disabled, so no such reason is emitted. If
 * monmux starts exposing one, that is a change to its docs/json.md first and to
 * this file second.
 *
 * Where two of monmux's answers disagree - an input enabled that the catalog
 * entry does not record, a display matched to a model the catalog does not
 * list - the model says `protocol` rather than filling the gap. Nothing with a
 * protocol code is ever offered as something to click.
 */

import {VersionState, checkVersion} from './version.js';

/**
 * Whether monmux can be used at all.
 *
 * @enum {string}
 */
export const MonmuxState = Object.freeze({
    /** No monmux on PATH. */
    MISSING: 'missing',
    /** Older than the contract this extension reads. */
    TOO_OLD: 'too-old',
    /** It answered, and the answer says nothing about its version. */
    UNKNOWN: 'unknown',
    /** Usable. */
    OK: 'ok',
});

/**
 * Where an input in the menu came from.
 *
 * @enum {string}
 */
export const InputState = Object.freeze({
    /** Named in the display's `enabledInputs`. */
    ENABLED: 'enabled',
    /** Recorded by the catalog entry, and not named in `enabledInputs`. */
    RECORDED: 'recorded',
});

/** The codes this module writes itself, rather than passing on from monmux. */
const Code = Object.freeze({
    REPORT_REFUSED: 'report-refused',
    REPORT_FAILED: 'report-failed',
    CATALOG_FAILED: 'catalog-failed',
    PROTOCOL: 'protocol',
    DISPLAY_NOT_WRITABLE: 'display-not-writable',
    RECORDED: 'recorded',
    ADDING_A_MONITOR: 'adding-a-monitor',
});

/** The status of a display monmux found nothing wrong with. */
const STATUS_OK = 'ok';

/** The match result of a display the catalog identified. */
const MATCH_EXACT = 'exact';

/** The match result of a display the catalog does not know. */
const MATCH_NONE = 'none';

/**
 * Every code the model can emit, by the field it appears in.
 *
 * A field that passes one of monmux's closed sets through unchanged - a status,
 * a match result, a grade - lists the values monmux documents; a value from a
 * newer monmux is passed on as it is, and reasons.js renders a code it does not
 * know as itself. `ok` and `exact` appear nowhere: neither is ever a reason, and
 * a monmux or a display in that state gets no sentence.
 *
 * `displays[].status` and `displays[].match` are not listed because nothing
 * renders them directly: whatever about them needs a sentence is the display's
 * `reasonCode`, which is listed.
 *
 * Exported so the suite can hold three things together: the model emits nothing
 * outside this table, every code in it is reachable, and reasons.js has a
 * sentence for every one.
 *
 * @type {Readonly<{[field: string]: readonly string[]}>}
 */
export const EMITTED = Object.freeze({
    monmux: Object.freeze([
        MonmuxState.MISSING,
        MonmuxState.TOO_OLD,
        MonmuxState.UNKNOWN,
    ]),
    problem: Object.freeze([
        MonmuxState.MISSING,
        MonmuxState.TOO_OLD,
        MonmuxState.UNKNOWN,
        Code.REPORT_REFUSED,
        Code.REPORT_FAILED,
        Code.CATALOG_FAILED,
        Code.PROTOCOL,
    ]),
    displayReason: Object.freeze([
        'no-ddc-channel',
        'edid-unreadable',
        'no-uuid',
        Code.DISPLAY_NOT_WRITABLE,
        MATCH_NONE,
        'ambiguous',
        Code.PROTOCOL,
    ]),
    cta: Object.freeze([Code.ADDING_A_MONITOR]),
    inputState: Object.freeze([InputState.ENABLED, InputState.RECORDED]),
    inputReason: Object.freeze([Code.RECORDED, Code.PROTOCOL]),
    grade: Object.freeze(['verified', 'documented', 'reported', 'quoted']),
});

/**
 * A result from the client in monmux.js, as far as this module reads it.
 *
 * @typedef {object} ClientResult
 * @property {string} kind The client's discriminator.
 * @property {any} [doc] The decoded document, where there is one.
 * @property {string} [stdout] Raw stdout, on a protocol error.
 * @property {string} [stderr] Raw stderr, where monmux wrote any.
 */

/**
 * Something that stops the menu from showing what it normally would.
 *
 * @typedef {object} Problem
 * @property {string} reasonCode What went wrong, as a code.
 * @property {?string} detail What monmux wrote about it, verbatim, or null when
 *   it wrote nothing or the code says all there is.
 */

/**
 * @typedef {object} FailingCheck
 * @property {?string} name The check's name, as monmux reported it.
 * @property {?string} detail What monmux said about it.
 */

/**
 * @typedef {object} InputModel
 * @property {string} name The input's name, as monmux spells it.
 * @property {?string} label The catalog entry's label for it, or null when the
 *   entry gives none. Never one this extension made up.
 * @property {string} state One of {@link InputState}.
 * @property {?string} grade The catalog entry's evidence grade, or null.
 * @property {?string} reasonCode Why it is shown greyed, or null when it is not.
 */

/**
 * @typedef {object} DisplayModel
 * @property {?string} label How monmux names the display.
 * @property {?string} model The catalog entry it matched, or null.
 * @property {?string} status The backend's status for it.
 * @property {?string} match How it matched the catalog.
 * @property {boolean} writable Whether the backend could write to it at all.
 * @property {InputModel[]} inputs What the menu lists under it.
 * @property {?string} reasonCode Why the display itself is greyed, or null.
 * @property {?string} cta The call to action to show with it, or null.
 */

/**
 * @typedef {object} Model
 * @property {string} monmux One of {@link MonmuxState}.
 * @property {?string} version The version monmux reported, or null.
 * @property {Problem[]} problems Everything that went wrong, in the order the
 *   calls were made.
 * @property {FailingCheck[]} checks The checks that did not pass.
 * @property {DisplayModel[]} displays One entry per display monmux reported.
 */

/**
 * Build the menu's model from what monmux answered.
 *
 * @param {object} results What the client returned.
 * @param {?ClientResult} results.version The result of `version()`, or null
 *   when `locate()` found no monmux. A cancelled run is never passed in: whoever
 *   cancelled it has nothing to render.
 * @param {?ClientResult} results.info The result of a plain `info()`, never of
 *   one with `showSerial`: a run that failed keeps its raw output here, and that
 *   output must be the redacted one. Read only when the version is usable, and
 *   required then.
 * @param {?ClientResult} results.catalog The result of `catalogList()`, on the
 *   same terms.
 * @returns {Model} The model.
 * @throws {TypeError} When the version is usable and either of the other two
 *   results is missing. That is a caller building the model too early, not an
 *   answer from monmux.
 */
export function buildModel({version, info, catalog}) {
    if (version === null)
        return unusable(MonmuxState.MISSING, null, null);

    if (!needsReports(version)) {
        // The raw text of an unidentified binary is the only evidence of what
        // it is, so it travels with the state rather than being replaced by a
        // guess.
        return checkVersion(version) === VersionState.TOO_OLD
            ? unusable(MonmuxState.TOO_OLD, reportedVersion(version), null)
            : unusable(MonmuxState.UNKNOWN, reportedVersion(version), rawText(version));
    }

    if (info === null || catalog === null)
        throw new TypeError('buildModel: a usable monmux needs both the info and the catalog results');

    /** @type {Problem[]} */
    const problems = [];

    const report = readReport(info);
    if (report.problem !== null)
        problems.push(report.problem);

    const entries = readCatalog(catalog);
    if (entries.problem !== null)
        problems.push(entries.problem);

    // Without the catalog no enabled input can be labelled, and labelling one
    // here would be exactly the invention this module exists to prevent. The
    // checks do not depend on it, and they are what explains most failures.
    const checks = report.doc === null ? [] : failingChecks(report.doc.checks);
    const models = entries.models;
    const displays = report.doc === null || models === null
        ? []
        : report.doc.displays.map(/** @param {any} display */ display => describeDisplay(display, models));

    return {
        monmux: MonmuxState.OK,
        version: reportedVersion(version),
        problems,
        checks,
        displays,
    };
}

/**
 * Whether a model built on this version result reads the info and catalog
 * results.
 *
 * The one place that is decided. buildModel() follows it, and the extension
 * asks it before running `info` and `catalog list` at all: a monmux the version
 * gate turns away is asked nothing more, because nothing more it said would be
 * read.
 *
 * @param {?ClientResult} version The result of `version()`, or null when
 *   `locate()` found no monmux.
 * @returns {boolean} Whether `info` and `catalog list` have to be run.
 */
export function needsReports(version) {
    return version !== null && checkVersion(version) === VersionState.OK;
}

/**
 * Whether the menu may offer an input as something to click.
 *
 * Offering an input decides nothing: monmux still decides what a click does,
 * and refuses what it will not do. This only keeps the menu from putting a click
 * next to something monmux did not name as enabled, or next to an answer that
 * contradicts itself.
 *
 * @param {DisplayModel} display The display the input is listed under.
 * @param {InputModel} input The input.
 * @returns {boolean} Whether a click on it may be offered.
 */
export function canOffer(display, input) {
    return display.reasonCode === null &&
        input.state === InputState.ENABLED &&
        input.reasonCode === null;
}

/**
 * The model of a monmux that cannot be used.
 *
 * Nothing it reported past the version is read: a binary too old for the
 * contract, or one that could not say what it is, does not get its other
 * answers interpreted under a contract it may not follow.
 *
 * @param {string} state One of {@link MonmuxState}, not `ok`.
 * @param {?string} version The version it reported, if any.
 * @param {?string} detail What it wrote, when that is the only evidence.
 * @returns {Model} The model.
 */
function unusable(state, version, detail) {
    return {
        monmux: state,
        version,
        problems: [{reasonCode: state, detail}],
        checks: [],
        displays: [],
    };
}

/**
 * The version string a `version()` result carries.
 *
 * @param {ClientResult} result The result.
 * @returns {?string} The version, or null when there is no document with one.
 */
function reportedVersion(result) {
    if (result.kind !== 'ok' || !isObject(result.doc) || !isNonEmptyString(result.doc.version))
        return null;

    return result.doc.version.trim();
}

/**
 * Read the report out of an `info()` result.
 *
 * `info` prints its report even when it refuses or fails, because that report
 * is the diagnostic for exactly those runs. So a document that came with a
 * refusal or a failure is still read - and the refusal or failure is reported
 * next to it, because the exit code says the report may not be complete.
 *
 * @param {ClientResult} result The result.
 * @returns {{doc: any, problem: ?Problem}} The report, or null, and what went
 *   wrong getting it.
 */
function readReport(result) {
    const doc = isReport(result.doc) ? result.doc : null;

    // The client's kinds, spelled out rather than imported: monmux.js starts a
    // process, and this module has no business importing the file that does.
    if (result.kind === 'ok' && doc !== null)
        return {doc, problem: null};

    if (result.kind === 'refused' && doc !== null)
        return {doc, problem: problemBesideReport(Code.REPORT_REFUSED, result)};

    if (result.kind === 'failed') {
        return {
            doc,
            problem: doc === null
                ? problem(Code.REPORT_FAILED, result)
                : problemBesideReport(Code.REPORT_FAILED, result),
        };
    }

    // A protocol error, an unknown flag from a binary whose version said it
    // knows the flag, or a kind this module has never heard of.
    return {doc: null, problem: problem(Code.PROTOCOL, result)};
}

/**
 * Read the catalog entries out of a `catalogList()` result.
 *
 * @param {ClientResult} result The result.
 * @returns {{models: ?any[], problem: ?Problem}} The entries, or null, and
 *   what went wrong getting them.
 */
function readCatalog(result) {
    if (result.kind === 'ok' && isObject(result.doc) && Array.isArray(result.doc.models))
        return {models: result.doc.models, problem: null};

    const code = result.kind === 'failed' ? Code.CATALOG_FAILED : Code.PROTOCOL;

    return {models: null, problem: problem(code, result)};
}

/**
 * @param {string} reasonCode What went wrong.
 * @param {ClientResult} result The result it went wrong in.
 * @returns {Problem} The problem, carrying what monmux wrote.
 */
function problem(reasonCode, result) {
    return {reasonCode, detail: rawText(result)};
}

/**
 * A problem that came with a usable report.
 *
 * Only stderr travels with it. stdout was the report, and the report is
 * rendered - as displays and failing checks - rather than repeated as raw text:
 * verbatim it would be the whole document, identities and handles included, cut
 * off in the middle of the menu.
 *
 * @param {string} reasonCode What went wrong.
 * @param {ClientResult} result The result it went wrong in, whose document was
 *   read.
 * @returns {Problem} The problem, carrying what monmux wrote to stderr.
 */
function problemBesideReport(reasonCode, result) {
    const stderr = textOrNull(result.stderr);

    return {reasonCode, detail: stderr === null ? null : stderr.trim()};
}

/**
 * Everything monmux wrote in a result, verbatim apart from surrounding space.
 *
 * @param {ClientResult} result The result.
 * @returns {?string} stderr, then stdout, or null when there was neither.
 */
function rawText(result) {
    const parts = [];
    for (const text of [result.stderr, result.stdout]) {
        if (isNonEmptyString(text))
            parts.push(/** @type {string} */ (text).trim());
    }

    return parts.length === 0 ? null : parts.join('\n');
}

/**
 * The checks that did not pass.
 *
 * A check whose `ok` is anything but `true` is listed: a malformed check is not
 * evidence that something passed.
 *
 * @param {any[]} checks The report's checks.
 * @returns {FailingCheck[]} The failing ones, in monmux's order.
 */
function failingChecks(checks) {
    return checks
        .filter(check => !isObject(check) || check.ok !== true)
        .map(check => ({
            name: textOrNull(isObject(check) ? check.name : null),
            detail: textOrNull(isObject(check) ? check.detail : null),
        }));
}

/**
 * Model one display.
 *
 * The order of the checks is the order in which a reason is more fundamental:
 * an answer that contradicts itself, then a display the backend cannot reach,
 * then one it cannot write to, then one the catalog does not identify. Only a
 * display that passes all of them is joined with the catalog.
 *
 * @param {any} display One entry of the report's `displays`.
 * @param {any[]} models The catalog entries.
 * @returns {DisplayModel} The display.
 */
function describeDisplay(display, models) {
    if (!isDisplay(display))
        return greyed(display, Code.PROTOCOL, null);

    // monmux fills `enabledInputs` only for a writable display that matched
    // exactly. Inputs enabled on any other display are two of its answers
    // disagreeing, and neither is taken over the other.
    if (display.enabledInputs.length > 0 && (!display.writable || display.match !== MATCH_EXACT))
        return greyed(display, Code.PROTOCOL, null);

    // Greyed with the status as monmux spelled it, including one this
    // extension does not know yet. A display in a state other than `ok` has
    // nothing offered under it, whatever else its entry says.
    if (display.status !== STATUS_OK)
        return greyed(display, display.status, null);

    if (!display.writable)
        return greyed(display, Code.DISPLAY_NOT_WRITABLE, null);

    // The one greyed display the call to action is for: reachable, writable,
    // and simply not in the catalog yet.
    if (display.match === MATCH_NONE)
        return greyed(display, MATCH_NONE, Code.ADDING_A_MONITOR);

    if (display.match !== MATCH_EXACT)
        return greyed(display, display.match, null);

    return joinCatalog(display, models);
}

/**
 * A display with nothing listed under it.
 *
 * @param {any} display The report's entry, well formed or not.
 * @param {string} reasonCode Why it is greyed.
 * @param {?string} cta The call to action, or null.
 * @returns {DisplayModel} The display.
 */
function greyed(display, reasonCode, cta) {
    return {...displayFields(display), inputs: [], reasonCode, cta};
}

/**
 * Model an exactly matched, writable display by joining it with its entry.
 *
 * Enabled inputs are listed first, in the order `info` gave them, and labelled
 * from the entry; then whatever else the entry records, greyed. Nothing is
 * listed that neither of the two names.
 *
 * @param {any} display A well-formed report entry.
 * @param {any[]} models The catalog entries.
 * @returns {DisplayModel} The display.
 */
function joinCatalog(display, models) {
    let malformed = false;

    /** @type {string[]} */
    const enabled = [];
    for (const name of display.enabledInputs) {
        if (isNonEmptyString(name) && !enabled.includes(name))
            enabled.push(name);
        else
            malformed = true;
    }

    // Joined on the full name, and on nothing looser. No entry, or more than
    // one, leaves the enabled inputs with nothing to label them from.
    const matches = models.filter(entry => isObject(entry) && entry.fullName === display.model);
    if (display.model === '' || matches.length !== 1 || !Array.isArray(matches[0].inputs)) {
        return {
            ...displayFields(display),
            inputs: enabled.map(name => describeInput(name, InputState.ENABLED, undefined)),
            reasonCode: Code.PROTOCOL,
            cta: null,
        };
    }

    /** @type {Map<string, any>} */
    const records = new Map();
    for (const record of matches[0].inputs) {
        if (isObject(record) && isNonEmptyString(record.name) && !records.has(record.name))
            records.set(record.name, record);
        else
            malformed = true;
    }

    const inputs = [
        ...enabled.map(name => describeInput(name, InputState.ENABLED, records.get(name))),
        ...[...records.keys()]
            .filter(name => !enabled.includes(name))
            .map(name => describeInput(name, InputState.RECORDED, records.get(name))),
    ];

    return {
        ...displayFields(display),
        inputs,
        reasonCode: malformed ? Code.PROTOCOL : null,
        cta: inputs.some(input => input.reasonCode === Code.RECORDED) ? Code.ADDING_A_MONITOR : null,
    };
}

/**
 * Model one input.
 *
 * An input whose record is missing, or lacks the label or the grade, is a
 * protocol condition whichever list it came from: monmux documents that every
 * enabled input is recorded, and the label is the one thing this extension will
 * not supply for it.
 *
 * @param {string} name The input's name.
 * @param {string} state One of {@link InputState}.
 * @param {any} record The catalog entry's record for it, if there is one.
 * @returns {InputModel} The input.
 */
function describeInput(name, state, record) {
    const label = textOrNull(record?.label);
    const grade = textOrNull(record?.grade);

    /** @type {?string} */
    let reasonCode = Code.PROTOCOL;
    if (label !== null && grade !== null)
        reasonCode = state === InputState.ENABLED ? null : Code.RECORDED;

    return {name, label, state, grade, reasonCode};
}

/**
 * The fields of a display the menu shows, and no others.
 *
 * Deliberately not the identity, and not the handle: the model is rendered and
 * may one day be logged by mistake, and neither belongs anywhere it can reach.
 *
 * @param {any} display The report's entry, well formed or not.
 * @returns {{label: ?string, model: ?string, status: ?string, match: ?string, writable: boolean}}
 *   The fields.
 */
function displayFields(display) {
    const entry = isObject(display) ? display : {};

    return {
        label: textOrNull(entry.label),
        model: textOrNull(entry.model),
        status: textOrNull(entry.status),
        match: textOrNull(entry.match),
        writable: entry.writable === true,
    };
}

/**
 * @param {any} doc Anything.
 * @returns {boolean} Whether it has the shape of an `info` report.
 */
function isReport(doc) {
    return isObject(doc) && Array.isArray(doc.displays) && Array.isArray(doc.checks);
}

/**
 * @param {any} display Anything.
 * @returns {boolean} Whether it carries every field a display is modelled from.
 */
function isDisplay(display) {
    return isObject(display) &&
        isNonEmptyString(display.label) &&
        isNonEmptyString(display.status) &&
        isNonEmptyString(display.match) &&
        typeof display.writable === 'boolean' &&
        typeof display.model === 'string' &&
        Array.isArray(display.enabledInputs);
}

/**
 * @param {unknown} value Anything.
 * @returns {?string} The value when it is a string with something in it.
 */
function textOrNull(value) {
    return isNonEmptyString(value) ? /** @type {string} */ (value) : null;
}

/**
 * @param {unknown} value Anything.
 * @returns {boolean} Whether it is a plain object, and not an array or null.
 */
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value Anything.
 * @returns {boolean} Whether it is a string with something in it.
 */
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}
