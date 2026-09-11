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
import Gio from 'gi://Gio';

import {Monmux} from '../src/lib/monmux.js';
import {SLOTS, SlotTargetKind, slotTarget} from '../src/lib/shortcuts.js';
import {assertDeepEqual, assertEqual, assertThrows, describe, it} from './harness.js';

const SCHEMA = GLib.build_filenamev([
    Gio.File.new_for_uri(import.meta.url).get_parent()?.get_parent()?.get_path() ?? '..',
    'src',
    'schemas',
    'org.gnome.shell.extensions.monmux.gschema.xml',
]);

/** Values cobra would parse as a flag rather than as the input to switch to. */
const FLAG_LIKE = Object.freeze(['-', '-h', '--dry-run', '--unsafe-model', '--serial=SYNTHLG0001']);

/**
 * The schema's keys, with the type and default each declares.
 *
 * @returns {Map<string, {type: string, value: string}>} Each key by name.
 */
function schemaKeys() {
    const [, bytes] = Gio.File.new_for_path(SCHEMA).load_contents(null);
    const text = new TextDecoder().decode(bytes);

    /** @type {Map<string, {type: string, value: string}>} */
    const keys = new Map();
    for (const match of text.matchAll(/<key name="([^"]+)" type="([^"]+)">\s*<default>([^<]*)<\/default>/g))
        keys.set(match[1], {type: match[2], value: match[3]});

    return keys;
}

/**
 * The command lines a press of a slot's shortcut runs.
 *
 * It goes the way the extension goes: the slot's value is read, and an input is
 * handed to the client's switch with the dry-run setting and no serial.
 *
 * @param {unknown} value What the slot's input key holds.
 * @param {boolean} dryRun What the dry-run key holds.
 * @returns {Promise<string[][]>} Every argv the runner was given.
 */
async function pressArgv(value, dryRun) {
    /** @type {string[][]} */
    const recorded = [];
    const client = new Monmux(argv => {
        recorded.push(argv);

        return Promise.resolve({exitCode: 0, stdout: '', stderr: ''});
    });

    const target = slotTarget(value);
    if (target.kind === SlotTargetKind.INPUT && target.input !== null)
        await client.switchInput(target.input, {dryRun, serial: ''});

    return recorded;
}

describe('shortcut slots', () => {
    it('has four slots, whose keys the schema declares with their types and empty defaults', () => {
        const keys = schemaKeys();

        assertDeepEqual(SLOTS.map(slot => slot.number), [1, 2, 3, 4], 'numbers');

        for (const slot of SLOTS) {
            assertEqual(slot.shortcutKey, `shortcut-${slot.number}`, 'shortcut key');
            assertEqual(slot.inputKey, `shortcut-${slot.number}-input`, 'input key');
            assertDeepEqual(keys.get(slot.shortcutKey), {type: 'as', value: '[]'}, slot.shortcutKey);
            assertDeepEqual(keys.get(slot.inputKey), {type: 's', value: '\'\''}, slot.inputKey);
        }
    });

    it('switches a slot\'s input by name, with --dry-run only when the setting is on, and never --serial', async () => {
        for (const slot of SLOTS) {
            const input = `input-${slot.number}`;

            // eslint-disable-next-line no-await-in-loop
            assertDeepEqual(await pressArgv(input, false), [['switch', input, '--json']], `slot ${slot.number}`);
            // eslint-disable-next-line no-await-in-loop
            assertDeepEqual(await pressArgv(input, true), [['switch', input, '--json', '--dry-run']],
                `slot ${slot.number} dry run`);
        }

        assertDeepEqual(await pressArgv('usb-c', false), [['switch', 'usb-c', '--json']], 'a real input name');
    });

    it('runs nothing for a slot with no input', async () => {
        for (const value of ['', '   ', undefined, null, ['dp']]) {
            assertDeepEqual(slotTarget(value), {kind: SlotTargetKind.EMPTY, input: null}, JSON.stringify(value));
            // eslint-disable-next-line no-await-in-loop
            assertDeepEqual(await pressArgv(value, false), [], `${JSON.stringify(value)} argv`);
        }
    });

    it('runs nothing for a value that would be read as a flag, and keeps it to show', async () => {
        for (const value of FLAG_LIKE) {
            assertDeepEqual(slotTarget(value), {kind: SlotTargetKind.INVALID, input: value}, value);
            // eslint-disable-next-line no-await-in-loop
            assertDeepEqual(await pressArgv(value, true), [], `${value} argv`);
        }
    });

    it('agrees with the client about which names are inputs', () => {
        const client = new Monmux(() => Promise.resolve(null));

        for (const value of FLAG_LIKE)
            assertThrows(() => client.switchInput(value), value);

        for (const value of ['dp', 'usb-c', 'hdmi-1', ' dp']) {
            assertEqual(slotTarget(value).kind, SlotTargetKind.INPUT, value);
            client.switchInput(value);
        }
    });

    it('passes a stored value on exactly as it was stored', () => {
        assertEqual(slotTarget(' dp ').input, ' dp ');
    });
});
