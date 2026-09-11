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
 * What the preferences window runs. The window itself needs GTK and a display,
 * so it is checked in the nested Shell; the client it runs monmux through, and
 * the runner that keeps that client from writing, are checked here. What it
 * offers for a shortcut slot is tested with the rest of shortcuts.js.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {Monmux, readOnly} from '../src/lib/monmux.js';
import {assertDeepEqual, assertEqual, describe, fail, it} from './harness.js';

/** @typedef {import('../src/lib/monmux.js').RunnerResult} RunnerResult */

const FIXTURES = GLib.build_filenamev([
    Gio.File.new_for_uri(import.meta.url).get_parent()?.get_path() ?? '.',
    'fixtures',
]);

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
 * A runner that records every command line and gives one answer to all of them.
 *
 * @param {?RunnerResult} answer What every run answers.
 * @returns {{calls: string[][], runner: (argv: string[]) => Promise<?RunnerResult>}}
 *   The recorded command lines, and the runner.
 */
function recording(answer) {
    /** @type {string[][]} */
    const calls = [];

    return {
        calls,
        runner: argv => {
            calls.push(argv);

            return Promise.resolve(answer);
        },
    };
}

/**
 * @param {Promise<unknown>} promise A call that must reject.
 * @param {string} label Names it in a failure.
 * @returns {Promise<void>}
 */
async function assertRejects(promise, label) {
    try {
        await promise;
    } catch {
        return;
    }

    fail(`${label}: expected a rejection`);
}

describe('doctor', () => {
    it('runs doctor with nothing else on the command line, and hands back what monmux wrote', async () => {
        const text = fixture('doctor.txt');
        const {calls, runner} = recording({exitCode: 0, stdout: text, stderr: ''});

        const answer = await new Monmux(runner).doctor();

        assertDeepEqual(calls, [['doctor']]);
        assertDeepEqual(answer, {exitCode: 0, stdout: text, stderr: ''});
    });

    it('hands back a failing doctor as it is, and nothing for a cancelled run', async () => {
        const failing = recording({exitCode: 1, stdout: 'Checks:\n', stderr: 'Error: no backend\n'});
        const cancelled = recording(null);

        assertDeepEqual(await new Monmux(failing.runner).doctor(),
            {exitCode: 1, stdout: 'Checks:\n', stderr: 'Error: no backend\n'});
        assertEqual(await new Monmux(cancelled.runner).doctor(), null, 'cancelled');
    });
});

describe('readOnly', () => {
    it('passes every read through to the runner it wraps', async () => {
        const {calls, runner} = recording({exitCode: 0, stdout: '', stderr: ''});
        const client = new Monmux(readOnly(runner));

        await client.version();
        await client.info();
        await client.catalogList();
        await client.doctor();

        assertDeepEqual(calls, [['version', '--json'], ['info', '--json'], ['catalog', 'list', '--json'], ['doctor']]);
    });

    it('refuses a switch, a dry run included, without starting anything', async () => {
        const {calls, runner} = recording({exitCode: 0, stdout: fixture('switch-sent.json'), stderr: ''});
        const client = new Monmux(readOnly(runner));

        await assertRejects(client.switchInput('dp'), 'switch');
        await assertRejects(client.switchInput('dp', {dryRun: true}), 'dry run');
        await assertRejects(client.switchInput('dp', {serial: 'SYNTHLG0001'}), 'pinned switch');

        assertDeepEqual(calls, []);
    });

    it('refuses serials in either spelling, and every command it was not told only reads', async () => {
        const {calls, runner} = recording({exitCode: 0, stdout: '', stderr: ''});
        const guarded = readOnly(runner);

        await assertRejects(new Monmux(guarded).info({showSerial: true}), 'info --show-serial');
        await assertRejects(guarded(['info', '--json', '--show-serial=true'], null), 'info --show-serial=true');
        await assertRejects(guarded(['doctor', '--show-serial'], null), 'doctor --show-serial');
        await assertRejects(guarded(['doctor', '--show-serial=1'], null), 'doctor --show-serial=1');
        await assertRejects(guarded(['config', 'set'], null), 'unknown command');
        await assertRejects(guarded([], null), 'empty command line');

        assertDeepEqual(calls, []);
    });
});
