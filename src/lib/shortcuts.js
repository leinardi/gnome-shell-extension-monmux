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
 * The keyboard shortcut slots, and what pressing one asks monmux for.
 *
 * A slot is two settings keys: the accelerators the window manager binds, and
 * the name of the input a press switches to. It names an input and nothing
 * else. Which display that input belongs to stays monmux's decision, exactly as
 * for a click in the menu that is not pinned, so a slot never carries a serial.
 *
 * The input name is read from a settings key anybody can write, with
 * `gsettings` or `dconf` as much as with the preferences window, so it is
 * checked here before anything runs. A slot with no input runs nothing. So does
 * one whose value cobra would parse as a flag rather than as the input to
 * switch to: the client refuses such a name too, and this is the same rule,
 * applied where the extension can still tell the user which slot is wrong.
 *
 * The argv itself is not built here. monmux.js is the one place that builds a
 * command line, and a press hands it the input name the way a click does.
 */

/**
 * @typedef {object} Slot
 * @property {number} number The slot's number, from 1.
 * @property {string} shortcutKey The settings key holding its accelerators, of
 *   type `as`.
 * @property {string} inputKey The settings key holding the name of the input
 *   it switches to, of type `s`.
 */

/**
 * Every slot, in order. Adding one is adding two keys to the schema and one
 * number here.
 *
 * @type {readonly Slot[]}
 */
export const SLOTS = Object.freeze([1, 2, 3, 4].map(number => Object.freeze({
    number,
    shortcutKey: `shortcut-${number}`,
    inputKey: `shortcut-${number}-input`,
})));

/**
 * What a slot's stored input amounts to.
 *
 * @enum {string}
 */
export const SlotTargetKind = Object.freeze({
    /** An input name to switch to. */
    INPUT: 'input',
    /** Nothing: the slot has no input. */
    EMPTY: 'empty',
    /** A value that is not an input name monmux can be given. */
    INVALID: 'invalid',
});

/**
 * @typedef {object} SlotTarget
 * @property {string} kind One of {@link SlotTargetKind}.
 * @property {?string} input The stored value, exactly as it was stored, when
 *   there is one; null for an empty slot.
 */

/**
 * Read what a slot's input key holds.
 *
 * The value is passed on as it was stored and never trimmed or corrected: an
 * input name that is not quite right reaches monmux, which refuses it with its
 * own reason, rather than being turned into a different input here.
 *
 * @param {unknown} value The input key's value.
 * @returns {SlotTarget} What a press of the slot's shortcut should do.
 */
export function slotTarget(value) {
    if (typeof value !== 'string' || value.trim() === '')
        return {kind: SlotTargetKind.EMPTY, input: null};

    if (value.startsWith('-'))
        return {kind: SlotTargetKind.INVALID, input: value};

    return {kind: SlotTargetKind.INPUT, input: value};
}
