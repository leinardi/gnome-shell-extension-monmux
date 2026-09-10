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
 * Everything that talks to monmux, in the one file allowed to spawn it.
 *
 * Two halves. The client is pure: it builds argv arrays, calls a runner it was
 * given, and classifies what came back. The adapter is the runner the Shell
 * passes it, and it is the only code in this repository that starts a process.
 * They live together because AGENTS.md names this file as the single spawner
 * and nothing here is worth moving that boundary for.
 *
 * The split is what makes the classification testable. The suite drives the
 * client with a runner that records argv and answers from a fixture, so every
 * exit code and every malformed answer is exercised without a subprocess
 * existing; the adapter is verified in the nested Shell against the fake, where
 * the argv log proves the array arrived intact.
 *
 * Classification happens in a fixed order, and the order is the point: the exit
 * code first, because it is monmux's authority on what it is willing to
 * promise; then a stderr shape that means the flag was never understood; and
 * only then the document. Nothing here believes a document over the code that
 * came with it, and a disagreement between the two is reported as such rather
 * than resolved by choosing a side.
 *
 * Which command was run is passed in, never inferred from what came back.
 * Inferring it would mean a malformed answer decides how strictly it is judged,
 * which is exactly backwards: the command is what fixes the fields its document
 * must carry, and a document missing one of them is a protocol error whatever
 * else it happens to look like.
 *
 * Two invariants come out of that, and the phase 4 menu is written against
 * both. A `refused` result always carries a document with a reason. A `failed`
 * result always carries text: either a document with a non-empty `error`, or a
 * non-empty stderr. Where neither exists the answer is a protocol error, which
 * keeps the raw output instead of reporting a failure with nothing in it.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {Outcome, outcomeForExitCode} from './exitCode.js';

// The one thing importing this module does. It is idempotent in GJS, it touches
// nothing outside the Gio prototype, and it has to happen before the first call
// rather than inside one.
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

/** The name resolved from PATH. Never a path, and never a configurable one. */
const PROGRAM = 'monmux';

/**
 * How a run is reported to the caller.
 *
 * @enum {string}
 */
export const ResultKind = Object.freeze({
    /** Exit 0, and a document that says what was asked for. */
    OK: 'ok',
    /** Exit 0, and a document that says nothing was executed. */
    DRY_RUN: 'dry-run',
    /** Exit 2. monmux declined, and nothing was written. Always carries a document. */
    REFUSED: 'refused',
    /** Exit 1. The write status is unknown. Always carries text. */
    FAILED: 'failed',
    /** monmux is too old to know `--json`. */
    UNSUPPORTED_FLAG: 'unsupported-flag',
    /** The answer did not follow the contract. The raw text is kept. */
    PROTOCOL: 'protocol',
});

/**
 * A decoded monmux document.
 *
 * Deliberately untyped past this point. The contract says a client ignores
 * fields it does not know and tolerates ones it has never seen, so pinning a
 * shape here would turn a newer monmux into a type error rather than into the
 * forward compatibility the contract promises. What each command *requires* is
 * checked at run time instead, by the contracts below.
 *
 * @typedef {{[field: string]: any}} Document
 */

/**
 * @typedef {object} RunnerResult
 * @property {number} exitCode The process exit status.
 * @property {string} stdout Everything the process wrote to stdout.
 * @property {string} stderr Everything the process wrote to stderr.
 */

/**
 * @callback Runner
 * @param {string[]} argv The command line, as an array.
 * @param {?Gio.Cancellable} cancellable Cancels the run.
 * @returns {Promise<?RunnerResult>} What the process said, or null when the
 *   run was cancelled.
 */

/**
 * @typedef {object} Result
 * @property {string} kind One of {@link ResultKind}.
 * @property {Document} [doc] The decoded document, where there is one.
 * @property {number} [exitCode] The exit status, on a failure or a protocol
 *   error.
 * @property {string} [stdout] Raw stdout, on a protocol error only.
 * @property {string} [stderr] Raw stderr, where monmux wrote any.
 */

/**
 * @typedef {object} Answer
 * @property {RunnerResult} answer What the process said.
 * @property {string} stdout Raw stdout.
 * @property {string} stderr Raw stderr.
 * @property {?Document} doc The decoded document, or null.
 */

/**
 * What cobra prints when it is handed a flag it has never heard of.
 *
 * Anchored to `--json` on purpose. Any unknown flag produces this shape, and
 * reading `unknown flag: --serial` as "this monmux predates `--json`" would be
 * a wrong and very confusing verdict: the only flag whose absence dates the
 * binary is the one every command here passes.
 */
const UNKNOWN_JSON_FLAG = /unknown flag:\s*--json/;

/**
 * What one command's answer has to carry.
 *
 * @typedef {object} Contract
 * @property {boolean} isSwitch Whether the outcome and write status are checked
 *   against the exit code.
 * @property {(doc: Document) => boolean} requires Whether a decoded document
 *   carries the fields this command's contract promises.
 */

/**
 * The contract for `switch --json`, whose pair is checked against the exit code.
 *
 * @type {Contract}
 */
const SWITCH_CONTRACT = Object.freeze({isSwitch: true, requires: () => true});

/**
 * The contract for `version --json`.
 *
 * @type {Contract}
 */
const VERSION_CONTRACT = Object.freeze({
    isSwitch: false,
    requires: doc => isNonEmptyString(doc.version),
});

/**
 * The contract for `info --json`.
 *
 * @type {Contract}
 */
const REPORT_CONTRACT = Object.freeze({
    isSwitch: false,
    requires: doc => Array.isArray(doc.displays) && Array.isArray(doc.checks),
});

/**
 * The contract for `catalog list --json`.
 *
 * @type {Contract}
 */
const CATALOG_CONTRACT = Object.freeze({
    isSwitch: false,
    requires: doc => Array.isArray(doc.models),
});

/**
 * Runs monmux and says what it answered, without ever deciding anything a
 * monitor depends on.
 */
export class Monmux {
    /**
     * @param {Runner} runner Executes a command line. In the Shell this is
     *   {@link spawn}; in a test it is a function that answers from a fixture.
     */
    constructor(runner) {
        this._runner = runner;
    }

    /**
     * Ask which monmux this is.
     *
     * @param {?Gio.Cancellable} [cancellable] Cancels the run.
     * @returns {Promise<?Result>} The result, or null when cancelled.
     */
    version(cancellable = null) {
        return this._run(['version', '--json'], cancellable, VERSION_CONTRACT);
    }

    /**
     * Ask what is attached.
     *
     * @param {object} [options] Options.
     * @param {boolean} [options.showSerial] Ask monmux to print the serials it
     *   redacts by default. Only the explicit opt-in passes this, and nothing
     *   logs any part of what it returns.
     * @param {?Gio.Cancellable} [cancellable] Cancels the run.
     * @returns {Promise<?Result>} The result, or null when cancelled.
     */
    info({showSerial = false} = {}, cancellable = null) {
        const argv = ['info', '--json'];
        if (showSerial)
            argv.push('--show-serial');

        return this._run(argv, cancellable, REPORT_CONTRACT);
    }

    /**
     * Ask what the catalog records.
     *
     * @param {?Gio.Cancellable} [cancellable] Cancels the run.
     * @returns {Promise<?Result>} The result, or null when cancelled.
     */
    catalogList(cancellable = null) {
        return this._run(['catalog', 'list', '--json'], cancellable, CATALOG_CONTRACT);
    }

    /**
     * Ask monmux to switch an input.
     *
     * @param {string} input The input's name, as monmux spells it.
     * @param {object} [options] Options.
     * @param {boolean} [options.dryRun] Ask monmux to execute nothing.
     * @param {string} [options.serial] Pin the display with this serial.
     * @param {?Gio.Cancellable} [cancellable] Cancels the run.
     * @returns {Promise<?Result>} The result, or null when cancelled.
     * @throws {TypeError} When the input name could be read as a flag. That is
     *   a caller's bug rather than a monmux answer, so it is raised here rather
     *   than returned: the name reaches a shortcut slot from a settings key the
     *   user can write, and one starting with `-` would be parsed by cobra as a
     *   flag instead of as the input to switch to.
     */
    switchInput(input, {dryRun = false, serial = ''} = {}, cancellable = null) {
        if (!isNonEmptyString(input) || input.startsWith('-'))
            throw new TypeError(`not an input name: ${JSON.stringify(input)}`);

        const argv = ['switch', input, '--json'];
        if (dryRun)
            argv.push('--dry-run');

        // Two elements, never one interpolated string: the value is a serial
        // read off a monitor, and it reaches execve as its own argument.
        if (serial !== '')
            argv.push('--serial', serial);

        return this._run(argv, cancellable, SWITCH_CONTRACT);
    }

    /**
     * Run one command line and classify the answer.
     *
     * @param {string[]} argv The command line.
     * @param {?Gio.Cancellable} cancellable Cancels the run.
     * @param {Contract} contract What this command's document must carry.
     * @returns {Promise<?Result>} The result, or null when cancelled.
     */
    async _run(argv, cancellable, contract) {
        const answer = await this._runner(argv, cancellable);
        if (answer === null || answer === undefined)
            return null;

        return classify(answer, contract);
    }
}

/**
 * Turn one answer into a result.
 *
 * The document is decoded up front because decoding is pure and cheap, but the
 * decisions below are taken in the documented order: exit code, then stderr,
 * then the document.
 *
 * @param {RunnerResult} answer What the process said.
 * @param {Contract} contract What this command's document must carry.
 * @returns {Result} What it means.
 */
function classify(answer, contract) {
    const stdout = answer.stdout ?? '';
    const stderr = answer.stderr ?? '';
    const exit = outcomeForExitCode(answer.exitCode);
    const context = {answer, stdout, stderr, doc: decode(stdout)};

    // A monmux that predates `--json` rejects the flag before running anything,
    // so there is no document and never will be. This is the one case where the
    // absence of an answer is itself the answer.
    if (exit.outcome === Outcome.FAILED && context.doc === null &&
        UNKNOWN_JSON_FLAG.test(stderr))
        return {kind: ResultKind.UNSUPPORTED_FLAG, stderr};

    return contract.isSwitch
        ? classifySwitch(exit.outcome, context)
        : classifyReadOnly(exit.outcome, context, contract.requires);
}

/**
 * Classify an answer to `switch --json`.
 *
 * monmux prints one document for every run that reaches the switch handler, and
 * the errors raised before it exit 1 with prose. So at exit 0 and exit 2 a
 * document is not optional: its absence, or a pair its exit code contradicts,
 * is a protocol error rather than something to make the best of.
 *
 * @param {string} outcome What the exit code said, from {@link Outcome}.
 * @param {Answer} context The answer and its decoded document.
 * @returns {Result} What it means.
 */
function classifySwitch(outcome, context) {
    const {answer, stdout, stderr, doc} = context;

    if (doc === null) {
        // A failure cobra raised never reached the handler: prose on stderr,
        // and nothing on stdout. That is the only answer with no document that
        // still has something to report.
        if (outcome === Outcome.FAILED && stderr.trim() !== '')
            return {kind: ResultKind.FAILED, exitCode: answer.exitCode, stderr};

        return protocol(answer, stdout, stderr);
    }

    const pair = pairOf(doc);

    switch (outcome) {
    case Outcome.SENT:
        // Exit 0 cannot tell a send from a dry run; only the document can. So
        // the pair is read strictly, and a document claiming to have sent
        // something while also promising that nothing was written is a
        // contradiction rather than a send.
        if (pair === 'sent/sent' && hasDecision(doc))
            return {kind: ResultKind.OK, doc};

        if (pair === 'dry-run/none' && hasDecision(doc) && isNonEmptyString(doc.command))
            return {kind: ResultKind.DRY_RUN, doc};

        return protocol(answer, stdout, stderr);
    case Outcome.REFUSED:
        if (pair === 'refused/none' && hasRefusal(doc))
            return {kind: ResultKind.REFUSED, doc, stderr};

        return protocol(answer, stdout, stderr);
    case Outcome.FAILED:
        // A failure the handler itself raised writes its document to stdout and
        // nothing to stderr, so the document is read here too. Anything else at
        // exit 1 - a document with the wrong pair, or a failed document with no
        // error text - has nothing to report and is not reported as a failure.
        if (pair === 'failed/unknown' && isNonEmptyString(doc.error))
            return {kind: ResultKind.FAILED, exitCode: answer.exitCode, doc, stderr};

        return protocol(answer, stdout, stderr);
    default:
        // An exit code monmux does not document. Reporting it as a failure
        // would be a guess about a code nobody has defined.
        return protocol(answer, stdout, stderr);
    }
}

/**
 * Classify an answer to a command that only reads.
 *
 * @param {string} outcome What the exit code said, from {@link Outcome}.
 * @param {Answer} context The answer and its decoded document.
 * @param {(doc: Document) => boolean} requires This command's required fields.
 * @returns {Result} What it means.
 */
function classifyReadOnly(outcome, context, requires) {
    const {answer, stdout, stderr, doc} = context;

    if (doc === null || !requires(doc)) {
        // A failure is the one outcome with somewhere else to get its text
        // from. Everything else has lost the document it was supposed to carry.
        if (outcome === Outcome.FAILED && stderr.trim() !== '')
            return {kind: ResultKind.FAILED, exitCode: answer.exitCode, stderr};

        return protocol(answer, stdout, stderr);
    }

    switch (outcome) {
    case Outcome.SENT:
        return {kind: ResultKind.OK, doc};
    case Outcome.REFUSED:
        // A read-only command refuses too: `info` prints its whole report and
        // exits 2 when the backend's preflight declined, and that report is
        // precisely the diagnostic the user needs. So the document travels with
        // the refusal - and a refusal without one is a protocol error, because
        // every caller of a refusal reads its document.
        return {kind: ResultKind.REFUSED, doc, stderr};
    case Outcome.FAILED:
        // Here the failure text is stderr: an `info` that got far enough to
        // print a report still puts what went wrong on stderr. With nothing
        // there, there is nothing to tell the user, so the raw output is kept
        // instead of reporting an empty failure.
        if (stderr.trim() === '')
            return protocol(answer, stdout, stderr);

        return {kind: ResultKind.FAILED, exitCode: answer.exitCode, doc, stderr};
    default:
        return protocol(answer, stdout, stderr);
    }
}

/**
 * An answer that did not follow the contract.
 *
 * The raw text is kept so the menu can show what actually arrived. Guessing
 * what it meant is the one thing this module must never do.
 *
 * @param {RunnerResult} answer What the process said.
 * @param {string} stdout Raw stdout.
 * @param {string} stderr Raw stderr.
 * @returns {Result} A protocol result.
 */
function protocol(answer, stdout, stderr) {
    return {kind: ResultKind.PROTOCOL, exitCode: answer.exitCode, stdout, stderr};
}

/**
 * The document's outcome and write status, as one string to compare.
 *
 * @param {Document} doc The decoded document.
 * @returns {?string} `outcome/writeStatus`, or null when either is missing.
 */
function pairOf(doc) {
    if (typeof doc.outcome !== 'string' || typeof doc.writeStatus !== 'string')
        return null;

    return `${doc.outcome}/${doc.writeStatus}`;
}

/**
 * Whether a switch document carries the decision it claims to have reached.
 *
 * monmux fills these in for `sent` and `dry-run` and for nothing else, and the
 * menu renders every one of them. A document that reports one of those outcomes
 * without them is not a decision this extension can show.
 *
 * @param {Document} doc The decoded document.
 * @returns {boolean} Whether the decision fields are there.
 */
function hasDecision(doc) {
    return isObject(doc.display) && isNonEmptyString(doc.display.label) &&
        isNonEmptyString(doc.model) && isNonEmptyString(doc.input);
}

/**
 * Whether a refusal document carries the reason the menu has to show.
 *
 * @param {Document} doc The decoded document.
 * @returns {boolean} Whether the reason is there.
 */
function hasRefusal(doc) {
    return isObject(doc.refusal) && isNonEmptyString(doc.refusal.reason);
}

/**
 * Decode a document, without throwing on text that is not one.
 *
 * @param {string} stdout What the process wrote.
 * @returns {?Document} The document, or null.
 */
function decode(stdout) {
    if (stdout.trim() === '')
        return null;

    let parsed;
    try {
        parsed = JSON.parse(stdout);
    } catch {
        return null;
    }

    return isObject(parsed) ? parsed : null;
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

/**
 * Where monmux is, if it is installed.
 *
 * Resolved from PATH by name. A configurable path would turn a menu item into
 * a way to run an arbitrary program as the user.
 *
 * @returns {?string} The absolute path, or null when there is no monmux.
 */
export function locate() {
    return GLib.find_program_in_path(PROGRAM);
}

/**
 * Run monmux. This is the only function in the extension that starts a process.
 *
 * It rejects for one reason that is not a cancellation: output that is not
 * valid UTF-8, which `communicate_utf8_async` refuses to decode. Every caller
 * has to catch that, because it is monmux's own output arriving in a form this
 * function cannot hand on - not a failure monmux reported.
 *
 * @param {string[]} argv The arguments, without the program name.
 * @param {?Gio.Cancellable} [cancellable] Cancels the run. On cancellation the
 *   process is asked to exit and the promise resolves to null, so a caller that
 *   was torn down gets nothing to render rather than an error to report.
 * @returns {Promise<?RunnerResult>} What monmux said, or null when cancelled.
 */
export async function spawn(argv, cancellable = null) {
    const proc = Gio.Subprocess.new(
        [PROGRAM, ...argv],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);

    // Cancelling the read leaves the process running; this ends it. The handler
    // is disconnected in every case, because a cancellable outlives one call
    // and would otherwise accumulate one handler per run.
    const handler = cancellable !== null
        ? cancellable.connect(() => proc.force_exit())
        : 0;

    try {
        const [stdout, stderr] = await proc.communicate_utf8_async(null, cancellable);

        return {
            // A process killed by a signal has no exit status to read. NaN is
            // not one of monmux's codes, and exitCode.js reports it as
            // unexpected - which is exactly what it is.
            exitCode: proc.get_if_exited() ? proc.get_exit_status() : NaN,
            stdout: stdout ?? '',
            stderr: stderr ?? '',
        };
    } catch (error) {
        // A cancelled call rejects, and that is not a failure worth telling
        // anybody about: whoever cancelled it is gone.
        if (cancellable !== null && cancellable.is_cancelled())
            return null;

        throw error;
    } finally {
        if (cancellable !== null && handler !== 0)
            cancellable.disconnect(handler);
    }
}
