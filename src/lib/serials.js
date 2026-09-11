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
 * The serial numbers a click can be pinned with, kept apart from everything the
 * menu renders: they go to `switch --serial` and nowhere else. A failure here
 * carries no text, because what that run wrote is the unredacted report.
 */

/** @typedef {import('./model.js').ClientResult} ClientResult */
/** @typedef {import('./model.js').DisplayModel} DisplayModel */
/** @typedef {import('./model.js').Problem} Problem */

/**
 * The code for serials that could not be read. reasons.js has its sentence.
 */
export const SERIALS_UNREADABLE = 'serials-unreadable';

/**
 * @typedef {object} Serials
 * @property {Map<string, string>} byLabel Each display's serial, by the label
 *   the menu shows it under.
 * @property {?Problem} problem Why no serial could be read, with no detail, or
 *   null.
 */

/**
 * No serials, because none were asked for.
 *
 * @returns {Serials} An empty map and no problem.
 */
export function noSerials() {
    return {byLabel: new Map(), problem: null};
}

/**
 * No serials, because reading them failed.
 *
 * @returns {Serials} An empty map, and a problem with no detail.
 */
export function unreadable() {
    return {byLabel: new Map(), problem: {reasonCode: SERIALS_UNREADABLE, detail: null}};
}

/**
 * Read the serials out of an `info --show-serial` result.
 *
 * A refusal is read like a success: `info` prints its whole report when the
 * backend's preflight declines, and the serials in it are as real as in any
 * other. Anything else - a failure, an answer outside the contract, a flag the
 * binary does not know - is unreadable, and nothing it carried is kept.
 *
 * The report is a second enumeration, made after the redacted one the menu was
 * built from, and the two are joined on nothing firmer than the label. So a
 * serial is kept only when its display still looks, in model, match and
 * writability, like the one the menu shows under that label: if the cables
 * moved in between, a click made under one monitor must not be pinned to
 * whichever monitor is on that connector now. Two identical units swapped
 * between the two reads look the same here, and nothing in the redacted report
 * could tell them apart.
 *
 * A display with no alphanumeric serial is left out, and so is every display
 * under a label that appears twice: a click on either is left unpinned rather
 * than pinned to a guess.
 *
 * @param {ClientResult} result The result of `info({showSerial: true})`. A
 *   cancelled run is never passed in.
 * @param {DisplayModel[]} displays The displays the menu shows, from the
 *   redacted report.
 * @returns {Serials} The serials, or why there are none.
 */
export function readSerials(result, displays) {
    const doc = result.kind === 'ok' || result.kind === 'refused' ? result.doc : null;
    if (!isObject(doc) || !Array.isArray(doc.displays))
        return unreadable();

    /** @type {Map<string, DisplayModel>} */
    const shown = new Map();
    for (const display of displays) {
        if (display.label !== null)
            shown.set(display.label, display);
    }

    /** @type {Map<string, string>} */
    const byLabel = new Map();
    const seen = new Set();
    const repeated = new Set();

    for (const display of doc.displays) {
        if (!isObject(display) || !isNonEmptyString(display.label))
            continue;

        if (seen.has(display.label))
            repeated.add(display.label);

        seen.add(display.label);

        const modelled = shown.get(display.label);
        if (modelled === undefined || !sameDisplay(display, modelled))
            continue;

        const serial = isObject(display.identity) ? display.identity.serialString : null;
        if (isNonEmptyString(serial))
            byLabel.set(display.label, serial);
    }

    for (const label of repeated)
        byLabel.delete(label);

    return {byLabel, problem: null};
}

/**
 * The serial a click on a display is pinned with.
 *
 * @param {DisplayModel} display The display the clicked input is listed under.
 * @param {?Map<string, string>} byLabel The serials, by label.
 * @param {boolean} enabled Whether the user turned serial targeting on.
 * @returns {string} The serial, or the empty string to leave the click
 *   unpinned: when targeting is off, when monmux can pick without one, or when
 *   there is no serial for this display. Never a guess.
 */
export function serialFor(display, byLabel, enabled) {
    if (!enabled || !display.needsSerial || display.label === null || byLabel === null)
        return '';

    return byLabel.get(display.label) ?? '';
}

/**
 * Whether an entry of the serial report is the display the menu shows under the
 * same label, as far as the redacted report can say.
 *
 * @param {{[field: string]: any}} display An entry of the serial report.
 * @param {DisplayModel} modelled The display the menu shows under its label.
 * @returns {boolean} Whether model, match and writability all agree.
 */
function sameDisplay(display, modelled) {
    const model = isNonEmptyString(display.model) ? display.model : null;

    return model === modelled.model &&
        display.match === modelled.match &&
        display.writable === modelled.writable;
}

/**
 * @param {unknown} value Anything.
 * @returns {value is {[field: string]: any}} Whether it is a plain object.
 */
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value Anything.
 * @returns {value is string} Whether it is a string with something in it.
 */
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}
