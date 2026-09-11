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

import {buildModel} from '../src/lib/model.js';
import {Monmux} from '../src/lib/monmux.js';
import {CODES, Reasons} from '../src/lib/reasons.js';
import {SERIALS_UNREADABLE, noSerials, readSerials, serialFor, unreadable} from '../src/lib/serials.js';
import {assertDeepEqual, assertEqual, describe, fail, it} from './harness.js';

/** @typedef {import('../src/lib/model.js').DisplayModel} DisplayModel */
/** @typedef {import('../src/lib/serials.js').Serials} Serials */

/**
 * @typedef {object} Answer
 * @property {number} exitCode The exit status.
 * @property {string} stdout What monmux wrote to stdout.
 * @property {string} stderr What monmux wrote to stderr.
 */

const FIXTURES = GLib.build_filenamev([
    Gio.File.new_for_uri(import.meta.url).get_parent()?.get_path() ?? '.',
    'fixtures',
]);

/** The synthetic serials the --show-serial fixtures carry, and no fixture else. */
const SYNTHETIC = Object.freeze(['SYNTHLG0001', 'SYNTHLG0002', 'SYNTHDELL0002']);

/**
 * @param {string} name The file name under tests/fixtures.
 * @returns {string} Its contents.
 */
function fixture(name) {
    const path = GLib.build_filenamev([FIXTURES, name]);
    const [, bytes] = Gio.File.new_for_path(path).load_contents(null);

    return new TextDecoder().decode(bytes);
}

/**
 * @param {number} exitCode The exit status.
 * @param {string} stdout What monmux wrote to stdout.
 * @param {string} [stderr] What monmux wrote to stderr.
 * @returns {Answer} The answer.
 */
function answer(exitCode, stdout, stderr = '') {
    return {exitCode, stdout, stderr};
}

/**
 * The client's result for an `info --json --show-serial` answer.
 *
 * @param {Answer} reply What monmux answered.
 * @returns {Promise<any>} The result.
 */
async function serialReport(reply) {
    const result = await new Monmux(() => Promise.resolve(reply)).info({showSerial: true});
    if (result === null)
        return fail('the runner was not cancelled, and still no result came back');

    return result;
}

/**
 * The model built from redacted answers, the way the extension builds it.
 *
 * @param {string} name The redacted info fixture.
 * @returns {Promise<import('../src/lib/model.js').Model>} The model.
 */
async function modelOf(name) {
    const run = (/** @type {Answer} */ reply) => new Monmux(() => Promise.resolve(reply));
    const [version, info, catalog] = await Promise.all([
        run(answer(0, fixture('version.json'))).version(),
        run(answer(0, fixture(name))).info(),
        run(answer(0, fixture('catalog-list.json'))).catalogList(),
    ]);

    return buildModel({version, info, catalog});
}

/**
 * The displays the menu shows for a redacted fixture.
 *
 * @param {string} name The redacted info fixture.
 * @returns {Promise<DisplayModel[]>} Its displays.
 */
async function shownFor(name) {
    return (await modelOf(name)).displays;
}

/**
 * A serial map written out, so two of them compare.
 *
 * @param {Serials} serials What readSerials() returned.
 * @returns {[string, string][]} The entries, in order.
 */
function entries(serials) {
    return [...serials.byLabel.entries()];
}

/**
 * Assert that nothing a value renders to carries a synthetic serial.
 *
 * @param {unknown} value Anything.
 * @param {string} label Names it in a failure.
 * @returns {void}
 */
function assertNoSerial(value, label) {
    const rendered = JSON.stringify(value, (_key, each) => each instanceof Map ? [...each.entries()] : each);

    for (const serial of SYNTHETIC) {
        if (rendered.includes(serial))
            fail(`${label} carries the serial ${serial}`);
    }
}

describe('readSerials', () => {
    it('reads each display\'s serial under the label the menu shows it by', async () => {
        const identical = readSerials(
            await serialReport(answer(0, fixture('info-two-identical-serials.json'))),
            await shownFor('info-two-identical.json'));
        const supported = readSerials(
            await serialReport(answer(0, fixture('info-two-supported-serials.json'))),
            await shownFor('info-two-supported.json'));

        assertDeepEqual(entries(identical), [['card1-DP-1', 'SYNTHLG0001'], ['card1-DP-2', 'SYNTHLG0002']]);
        assertEqual(identical.problem, null, 'identical problem');
        assertDeepEqual(entries(supported), [['card1-DP-1', 'SYNTHLG0001'], ['card1-DP-2', 'SYNTHDELL0002']]);
    });

    it('reads the serials of a report that came with a refusal', async () => {
        const result = await serialReport(answer(2, fixture('info-two-identical-serials.json'), 'Not ready: preflight\n'));

        assertEqual(result.kind, 'refused', 'kind');
        assertEqual(readSerials(result, await shownFor('info-two-identical.json')).byLabel.size, 2, 'serials');
    });

    it('reports a failed run as a code with no text, whatever monmux wrote', async () => {
        const report = fixture('info-two-identical-serials.json');
        const shown = await shownFor('info-two-identical.json');
        const results = await Promise.all([
            serialReport(answer(1, report, 'monmux: SYNTHLG0001 went away\n')),
            serialReport(answer(1, '', 'monmux: enumeration failed near SYNTHLG0002\n')),
            serialReport(answer(0, `${report.slice(0, 200)} SYNTHDELL0002`)),
            serialReport(answer(1, '', 'Error: unknown flag: --json\n')),
        ]);

        for (const result of results) {
            const serials = readSerials(result, shown);

            assertDeepEqual(entries(serials), [], `${result.kind} serials`);
            assertDeepEqual(serials.problem, {reasonCode: SERIALS_UNREADABLE, detail: null}, `${result.kind} problem`);
            assertNoSerial(serials, result.kind);
        }
    });

    it('leaves out a display with no serial, and every display under a repeated label', async () => {
        const doc = JSON.parse(fixture('info-two-identical-serials.json'));
        doc.displays[0].identity.serialString = '';
        doc.displays.push({...doc.displays[1], identity: {...doc.displays[1].identity, serialString: 'SYNTHLG0003'}});

        const serials = readSerials(
            await serialReport(answer(0, JSON.stringify(doc))),
            await shownFor('info-two-identical.json'));

        assertDeepEqual(entries(serials), []);
        assertEqual(serials.problem, null, 'problem');
    });

    it('leaves unpinned a label whose display changed between the two reads', async () => {
        // The cables moved after the menu was read: the LG is now on card1-DP-2
        // and the Dell on card1-DP-1. A click made under either section must not
        // be pinned to the monitor that took its connector.
        const swapped = JSON.parse(fixture('info-two-supported-serials.json'));
        swapped.displays = swapped.displays.map(
            (/** @type {any} */ display, /** @type {number} */ index, /** @type {any[]} */ all) =>
                ({...all[1 - index], label: display.label, handle: display.handle}));

        const shown = await shownFor('info-two-supported.json');
        const moved = readSerials(await serialReport(answer(0, JSON.stringify(swapped))), shown);

        assertDeepEqual(entries(moved), [], 'swapped');

        // A label only one of the two reads has, or one whose display is a
        // different model, is left out on its own; the rest are still kept.
        const partial = readSerials(
            await serialReport(answer(0, fixture('info-two-supported-serials.json'))),
            await shownFor('info-two-identical.json'));

        assertDeepEqual(entries(partial), [['card1-DP-1', 'SYNTHLG0001']], 'partial');
        assertDeepEqual(
            entries(readSerials(await serialReport(answer(0, fixture('info-two-supported-serials.json'))), [])),
            [], 'nothing shown');
    });

    it('has a sentence for the code it emits, in the report group', () => {
        const reasons = new Reasons(message => `[${message}]`);

        assertEqual(CODES.report.includes(SERIALS_UNREADABLE), true, 'group');
        assertEqual(reasons.text(SERIALS_UNREADABLE).startsWith('['), true, 'translated');
        assertEqual(unreadable().problem?.reasonCode, SERIALS_UNREADABLE, 'unreadable');
        assertEqual(noSerials().problem, null, 'none');
    });
});

describe('serialFor', () => {
    it('passes --serial, with its value, only while serial targeting is on', async () => {
        const shown = await shownFor('info-two-identical.json');
        const serials = readSerials(await serialReport(answer(0, fixture('info-two-identical-serials.json'))), shown);

        /** @type {string[][]} */
        const recorded = [];
        const client = new Monmux(argv => {
            recorded.push(argv);

            return Promise.resolve(answer(0, fixture('switch-sent.json')));
        });

        const [first, second] = shown;
        await client.switchInput('dp', {serial: serialFor(first, serials.byLabel, false)});
        await client.switchInput('dp', {serial: serialFor(second, serials.byLabel, true)});

        assertDeepEqual(recorded, [
            ['switch', 'dp', '--json'],
            ['switch', 'dp', '--json', '--serial', 'SYNTHLG0002'],
        ]);
    });

    it('leaves a click unpinned when monmux can pick without a serial, or there is none', async () => {
        const [single] = await shownFor('info-writable.json');
        const [first] = await shownFor('info-two-identical.json');

        assertEqual(serialFor(single, new Map([['card1-DP-1', 'SYNTHLG0001']]), true), '', 'one display');
        assertEqual(serialFor(first, new Map(), true), '', 'no serial read');
        assertEqual(serialFor(first, null, true), '', 'no map');
    });
});

describe('the render model and --show-serial', () => {
    it('carries no serial, even when built from a report that has them', async () => {
        for (const name of ['info-two-identical-serials.json', 'info-two-supported-serials.json']) {
            // eslint-disable-next-line no-await-in-loop
            const model = await modelOf(name);

            assertEqual(model.displays.length, 2, `${name} displays`);
            assertNoSerial(model, name);
        }
    });
});
