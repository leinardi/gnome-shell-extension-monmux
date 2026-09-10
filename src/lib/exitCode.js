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
 * monmux's exit codes are part of its interface, and the distinction between 1
 * and 2 is the whole point of them: only a refusal may promise that nothing was
 * written. This module is the one place that reads them, so no caller has to
 * remember which number means what, and so a notification never says "nothing
 * was written" about a run that may well have written something.
 *
 * Pure by construction: no gi:// import, no St, no Clutter, no subprocess. That
 * is what makes it testable under plain gjs.
 */

/**
 * What monmux did, as far as its exit code says.
 *
 * @enum {string}
 */
export const Outcome = Object.freeze({
    /** The command was sent to the monitor. */
    SENT: 'sent',
    /** monmux refused, and nothing was written. */
    REFUSED: 'refused',
    /** The tool ran and failed, or the request could not be made. */
    FAILED: 'failed',
    /** An exit code monmux does not document. */
    UNEXPECTED: 'unexpected',
});

/**
 * Whether a write reached the monitor.
 *
 * @enum {string}
 */
export const WriteStatus = Object.freeze({
    /** A write was performed. */
    WRITTEN: 'written',
    /** No write was performed. monmux promises this only on a refusal. */
    NONE: 'none',
    /** The tool may or may not have written before it failed. */
    UNKNOWN: 'unknown',
});

/**
 * @typedef {object} ExitOutcome
 * @property {number} code The exit code this was derived from.
 * @property {string} outcome One of {@link Outcome}.
 * @property {string} writeStatus One of {@link WriteStatus}.
 */

const EXIT_SENT = 0;
const EXIT_FAILED = 1;
const EXIT_REFUSED = 2;

/**
 * Map a monmux exit code onto what it says about the monitor.
 *
 * An undocumented code is reported as unexpected with an unknown write status,
 * never as a refusal: a refusal is a promise that nothing was written, and a
 * code monmux does not document makes no such promise.
 *
 * @param {number} code The process exit code.
 * @returns {ExitOutcome} What the code means.
 */
export function outcomeForExitCode(code) {
    if (!Number.isInteger(code)) {
        return {
            code,
            outcome: Outcome.UNEXPECTED,
            writeStatus: WriteStatus.UNKNOWN,
        };
    }

    switch (code) {
    case EXIT_SENT:
        return {
            code,
            outcome: Outcome.SENT,
            writeStatus: WriteStatus.WRITTEN,
        };
    case EXIT_REFUSED:
        return {
            code,
            outcome: Outcome.REFUSED,
            writeStatus: WriteStatus.NONE,
        };
    case EXIT_FAILED:
        return {
            code,
            outcome: Outcome.FAILED,
            writeStatus: WriteStatus.UNKNOWN,
        };
    default:
        return {
            code,
            outcome: Outcome.UNEXPECTED,
            writeStatus: WriteStatus.UNKNOWN,
        };
    }
}

/**
 * Whether an outcome allows the user to be told that nothing was written.
 *
 * @param {ExitOutcome} outcome The outcome to inspect.
 * @returns {boolean} True only when monmux promised that nothing was written.
 */
export function promisesNoWrite(outcome) {
    return outcome.writeStatus === WriteStatus.NONE;
}
