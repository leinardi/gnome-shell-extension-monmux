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
 * The client, driven by a runner that records what it was asked for and answers
 * from a fixture. Nothing here spawns anything: the runner is a function, and
 * the fixtures are files read off disk.
 *
 * Most of what follows feeds the client answers monmux would never produce.
 * That is the point: the contract is only worth something if a document that
 * breaks it is reported as broken rather than quietly rendered as whatever it
 * most resembles.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {Monmux, ResultKind} from '../src/lib/monmux.js';
import {assertDeepEqual, assertEqual, assertThrows, describe, fail, it} from './harness.js';

const FIXTURES = GLib.build_filenamev([
    Gio.File.new_for_uri(import.meta.url).get_parent()?.get_path() ?? '.',
    'fixtures',
]);

/**
 * Read one fixture.
 *
 * @param {string} name The file name under tests/fixtures.
 * @returns {string} Its contents, exactly as monmux would have written them.
 */
function fixture(name) {
    const path = GLib.build_filenamev([FIXTURES, name]);
    const [, bytes] = Gio.File.new_for_path(path).load_contents(null);

    return new TextDecoder().decode(bytes);
}

/**
 * Read one fixture as a document, so a test can break it on purpose.
 *
 * @param {string} name The file name under tests/fixtures.
 * @returns {any} The decoded document.
 */
function document(name) {
    return JSON.parse(fixture(name));
}

/**
 * A runner that records every argv it was given and answers from a queue.
 *
 * @param {...(?{exitCode: number, stdout?: string, stderr?: string})} answers
 *   What to return, in order. A null answer is a cancelled run.
 * @returns {{calls: string[][], runner: (argv: string[]) => Promise<any>}} The
 *   recorder and the runner to hand to {@link Monmux}.
 */
function recorder(...answers) {
    /** @type {string[][]} */
    const calls = [];
    const queue = [...answers];

    return {
        calls,
        runner: argv => {
            calls.push(argv);
            const answer = queue.shift();

            return Promise.resolve(answer === undefined ? null : answer);
        },
    };
}

/**
 * An answer built from a fixture file.
 *
 * @param {number} exitCode The exit status monmux would have returned.
 * @param {string} name The fixture to answer with.
 * @param {string} [stderr] What monmux wrote to stderr.
 * @returns {{exitCode: number, stdout: string, stderr: string}} The answer.
 */
function answering(exitCode, name, stderr = '') {
    return {exitCode, stdout: fixture(name), stderr};
}

/**
 * An answer built from a document a test has altered.
 *
 * @param {number} exitCode The exit status monmux would have returned.
 * @param {any} doc The document to send.
 * @param {string} [stderr] What monmux wrote to stderr.
 * @returns {{exitCode: number, stdout: string, stderr: string}} The answer.
 */
function sending(exitCode, doc, stderr = '') {
    return {exitCode, stdout: JSON.stringify(doc), stderr};
}

/**
 * Run one switch against one answer.
 *
 * @param {{exitCode: number, stdout?: string, stderr?: string}} answer What
 *   monmux said.
 * @returns {Promise<?any>} The result.
 */
function switching(answer) {
    return new Monmux(recorder(answer).runner).switchInput('dp');
}

/**
 * Assert that a command line is a real argv array.
 *
 * @param {string[]} argv The recorded call.
 * @returns {void}
 */
function assertIsArgvArray(argv) {
    if (!Array.isArray(argv)) {
        fail('the runner was not given an array');

        return;
    }

    for (const argument of argv) {
        if (typeof argument !== 'string')
            fail(`argv carries a ${typeof argument}, not a string`);

        // A shell string would show up as one element carrying the separators
        // a shell would act on. Nothing here ever reaches a shell, and this is
        // what would notice if something started building one.
        for (const shellism of [' ', ';', '&&', '||', '|', '>', '<', '$(', '`']) {
            if (argument.includes(shellism))
                fail(`argv element ${JSON.stringify(argument)} looks like a shell string`);
        }
    }
}

describe('Monmux argv', () => {
    it('asks for JSON on every command', async () => {
        const {calls, runner} = recorder(
            answering(0, 'version.json'),
            answering(0, 'info-writable.json'),
            answering(0, 'catalog-list.json'),
            answering(0, 'switch-sent.json'));
        const monmux = new Monmux(runner);

        await monmux.version();
        await monmux.info();
        await monmux.catalogList();
        await monmux.switchInput('dp');

        for (const call of calls) {
            assertIsArgvArray(call);

            if (!call.includes('--json'))
                fail(`${call.join(' ')} did not ask for JSON`);
        }
    });

    it('builds each command line exactly', async () => {
        const {calls, runner} = recorder(
            answering(0, 'version.json'),
            answering(0, 'info-writable.json'),
            answering(0, 'catalog-list.json'));
        const monmux = new Monmux(runner);

        await monmux.version();
        await monmux.info();
        await monmux.catalogList();

        assertDeepEqual(calls[0], ['version', '--json'], 'version');
        assertDeepEqual(calls[1], ['info', '--json'], 'info');
        assertDeepEqual(calls[2], ['catalog', 'list', '--json'], 'catalog list');
    });

    it('passes --show-serial only when it was asked for', async () => {
        const {calls, runner} = recorder(
            answering(0, 'info-writable.json'),
            answering(0, 'info-writable.json'));
        const monmux = new Monmux(runner);

        await monmux.info();
        await monmux.info({showSerial: true});

        assertEqual(calls[0].includes('--show-serial'), false, 'default');
        assertDeepEqual(calls[1], ['info', '--json', '--show-serial'], 'opted in');
    });

    it('passes --dry-run and --serial only when they were asked for', async () => {
        const {calls, runner} = recorder(
            answering(0, 'switch-sent.json'),
            answering(0, 'switch-dry-run.json'),
            answering(0, 'switch-sent.json'),
            answering(0, 'switch-dry-run.json'));
        const monmux = new Monmux(runner);

        await monmux.switchInput('dp');
        await monmux.switchInput('dp', {dryRun: true});
        await monmux.switchInput('usb-c', {serial: 'TESTSERIAL01'});
        await monmux.switchInput('usb-c', {dryRun: true, serial: 'TESTSERIAL01'});

        assertDeepEqual(calls[0], ['switch', 'dp', '--json'], 'plain');
        assertDeepEqual(calls[1], ['switch', 'dp', '--json', '--dry-run'], 'dry run');
        assertDeepEqual(
            calls[2],
            ['switch', 'usb-c', '--json', '--serial', 'TESTSERIAL01'],
            'pinned');
        assertDeepEqual(
            calls[3],
            ['switch', 'usb-c', '--json', '--dry-run', '--serial', 'TESTSERIAL01'],
            'both');
    });

    it('keeps a serial in its own argument, whatever it contains', async () => {
        // A serial is read off a monitor. If one ever carried something a shell
        // would act on, it still reaches execve as one argument.
        const {calls, runner} = recorder(answering(2, 'switch-refused-input-not-enabled.json'));
        const monmux = new Monmux(runner);

        await monmux.switchInput('dp', {serial: 'ABC; rm -rf /'});

        assertDeepEqual(
            calls[0],
            ['switch', 'dp', '--json', '--serial', 'ABC; rm -rf /'],
            'nothing was split, joined or quoted');
    });

    it('never passes an empty serial as an argument', async () => {
        const {calls, runner} = recorder(answering(0, 'switch-sent.json'));
        const monmux = new Monmux(runner);

        await monmux.switchInput('dp', {serial: ''});

        assertEqual(calls[0].includes('--serial'), false);
    });

    it('refuses an input name that cobra would read as a flag', () => {
        // The name reaches a shortcut slot from a settings key the user can
        // write. `--unsafe-model` as an "input" must not become a flag.
        const {calls, runner} = recorder(answering(0, 'switch-sent.json'));
        const monmux = new Monmux(runner);

        assertThrows(() => monmux.switchInput('--unsafe-model'), 'long flag');
        assertThrows(() => monmux.switchInput('-x'), 'short flag');
        assertThrows(() => monmux.switchInput(''), 'nothing at all');

        assertEqual(calls.length, 0, 'nothing was run');
    });
});

describe('Monmux classification', () => {
    it('reports a sent switch as ok', async () => {
        const result = await switching(answering(0, 'switch-sent.json'));

        assertEqual(result?.kind, ResultKind.OK, 'kind');
        assertEqual(result?.doc?.outcome, 'sent', 'outcome');
    });

    it('never reports a dry run as ok', async () => {
        // Both exit 0. Only the document can tell them apart, and announcing a
        // dry run as a completed switch is the failure this whole contract
        // exists to prevent.
        const result = await switching(answering(0, 'switch-dry-run.json'));

        assertEqual(result?.kind, ResultKind.DRY_RUN, 'kind');
        assertEqual(result?.doc?.writeStatus, 'none', 'promise');
    });

    it('reports a refusal, with the reason kept', async () => {
        const result = await switching(answering(2, 'switch-refused-input-not-enabled.json'));

        assertEqual(result?.kind, ResultKind.REFUSED, 'kind');
        assertEqual(result?.doc?.refusal?.reason, 'input-not-enabled', 'reason');
    });

    it('keeps the error text of a failure the handler reported', async () => {
        const result = await switching(answering(1, 'switch-failed.json'));

        assertEqual(result?.kind, ResultKind.FAILED, 'kind');
        assertEqual(result?.exitCode, 1, 'exit code');

        if (!result?.doc?.error)
            fail('the failure lost its error text');
    });

    it('falls back to stderr when a failure produced no document', async () => {
        // What cobra does: it rejects the command line before the handler runs,
        // so there is nothing on stdout and the message is on stderr.
        const result = await switching({
            exitCode: 1,
            stdout: '',
            stderr: 'Error: accepts 1 arg(s), received 2',
        });

        assertEqual(result?.kind, ResultKind.FAILED, 'kind');
        assertEqual(result?.doc, undefined, 'no document was invented');
        assertEqual(result?.stderr, 'Error: accepts 1 arg(s), received 2', 'error text');
    });

    it('reads an unknown --json flag as a monmux too old for the contract', async () => {
        const {runner} = recorder({
            exitCode: 1,
            stdout: '',
            stderr: 'Error: unknown flag: --json',
        });
        const result = await new Monmux(runner).version();

        assertEqual(result?.kind, ResultKind.UNSUPPORTED_FLAG, 'kind');
        assertEqual(result?.stderr, 'Error: unknown flag: --json', 'stderr kept');
    });

    it('does not date the binary by an unknown flag that is not --json', async () => {
        // Every unknown flag produces this shape. Only --json says anything
        // about the version, because it is the flag every command here passes.
        const result = await switching({
            exitCode: 1,
            stdout: '',
            stderr: 'Error: unknown flag: --serial',
        });

        assertEqual(result?.kind, ResultKind.FAILED, 'kind');
        assertEqual(result?.stderr, 'Error: unknown flag: --serial', 'error text');
    });

    it('carries the report of a read-only command that refused', async () => {
        // `info` exits 2 when the backend's preflight declined, and prints the
        // whole report anyway: that report is the diagnostic for the refusal,
        // so it must not be thrown away with it.
        const {runner} = recorder(answering(
            2,
            'info-checks-failing.json',
            'Not ready: backend-not-ready: ddcutil was not found on PATH'));
        const result = await new Monmux(runner).info();

        assertEqual(result?.kind, ResultKind.REFUSED, 'kind');
        assertEqual(Array.isArray(result?.doc?.checks), true, 'the checks survived');
    });

    it('keeps the report of a read-only command that failed', async () => {
        const {runner} = recorder(answering(1, 'info-writable.json', 'Error: enumeration failed'));
        const result = await new Monmux(runner).info();

        assertEqual(result?.kind, ResultKind.FAILED, 'kind');
        assertEqual(result?.doc?.displays?.length, 1, 'the report survived');
        assertEqual(result?.stderr, 'Error: enumeration failed', 'error text');
    });
});

describe('Monmux protocol errors', () => {
    it('refuses a switch document whose pair the exit code contradicts', async () => {
        const cases = [
            ['sent at exit 1', sending(1, document('switch-sent.json'))],
            ['dry run at exit 1', sending(1, document('switch-dry-run.json'))],
            ['sent at exit 2', answering(2, 'switch-sent.json')],
            ['refused at exit 0', answering(0, 'switch-refused-input-not-enabled.json')],
            ['failed at exit 0', answering(0, 'switch-failed.json')],
            ['refused at exit 1', sending(1, document('switch-refused-input-not-enabled.json'))],
        ];

        await Promise.all(cases.map(async ([label, answer]) => {
            const result = await switching(/** @type {any} */ (answer));

            assertEqual(result?.kind, ResultKind.PROTOCOL, String(label));
        }));
    });

    it('refuses a dry-run document that claims something was sent', async () => {
        const contradiction = document('switch-dry-run.json');
        contradiction.writeStatus = 'sent';

        const result = await switching(sending(0, contradiction));

        assertEqual(result?.kind, ResultKind.PROTOCOL);
    });

    it('refuses a switch document that is missing a field the menu shows', async () => {
        const withoutDisplay = document('switch-sent.json');
        delete withoutDisplay.display;

        const withoutModel = document('switch-sent.json');
        delete withoutModel.model;

        const withoutCommand = document('switch-dry-run.json');
        delete withoutCommand.command;

        const withoutReason = document('switch-refused-input-not-enabled.json');
        delete withoutReason.refusal.reason;

        const withoutError = document('switch-failed.json');
        delete withoutError.error;

        const cases = [
            ['sent without a display', sending(0, withoutDisplay)],
            ['sent without a model', sending(0, withoutModel)],
            ['dry run without a command', sending(0, withoutCommand)],
            ['refusal without a reason', sending(2, withoutReason)],
            ['failure without error text', sending(1, withoutError)],
        ];

        await Promise.all(cases.map(async ([label, answer]) => {
            const result = await switching(/** @type {any} */ (answer));

            assertEqual(result?.kind, ResultKind.PROTOCOL, String(label));
        }));
    });

    it('refuses a switch that exited 2 without a document', async () => {
        // monmux prints one document for every run that reaches the switch
        // handler, and the errors raised before it exit 1. A refusal with
        // nothing to read is not a refusal this extension can show.
        const cases = [
            ['nothing at all', {exitCode: 2, stdout: '', stderr: 'Refused'}],
            ['not JSON', {exitCode: 2, stdout: 'Refused: input-not-enabled', stderr: ''}],
        ];

        await Promise.all(cases.map(async ([label, answer]) => {
            const result = await switching(/** @type {any} */ (answer));

            assertEqual(result?.kind, ResultKind.PROTOCOL, String(label));
        }));
    });

    it('refuses a failure with nothing at all to report', async () => {
        const result = await switching({exitCode: 1, stdout: 'garbage, not JSON', stderr: ''});

        assertEqual(result?.kind, ResultKind.PROTOCOL, 'kind');
        assertEqual(result?.stdout, 'garbage, not JSON', 'raw text kept');
    });

    it('keeps the raw text of stdout that is not a document at all', async () => {
        const {runner} = recorder({exitCode: 0, stdout: 'not json at all', stderr: ''});
        const result = await new Monmux(runner).version();

        assertEqual(result?.kind, ResultKind.PROTOCOL, 'kind');
        assertEqual(result?.stdout, 'not json at all', 'raw text kept for the menu');
    });

    it('refuses a document that is missing the fields its command requires', async () => {
        const cases = [
            ['a report with no displays', {exitCode: 0, stdout: '{"backend": "ddcutil"}'}],
            ['a version with no version', {exitCode: 0, stdout: '{}'}],
            ['a catalog with no models', {exitCode: 0, stdout: '{"count": 71}'}],
        ];
        const [report, version, catalog] = cases.map(([, answer]) => answer);

        assertEqual(
            (await new Monmux(recorder(/** @type {any} */ (report)).runner).info())?.kind,
            ResultKind.PROTOCOL,
            'report');
        assertEqual(
            (await new Monmux(recorder(/** @type {any} */ (version)).runner).version())?.kind,
            ResultKind.PROTOCOL,
            'version');
        assertEqual(
            (await new Monmux(recorder(/** @type {any} */ (catalog)).runner).catalogList())?.kind,
            ResultKind.PROTOCOL,
            'catalog');
    });

    it('refuses a read-only failure with nothing on stderr', async () => {
        const {runner} = recorder(answering(1, 'info-writable.json'));
        const result = await new Monmux(runner).info();

        assertEqual(result?.kind, ResultKind.PROTOCOL);
    });

    it('refuses an exit code monmux does not document', async () => {
        await Promise.all([3, 70, 127].map(async exitCode => {
            const {runner} = recorder({exitCode, stdout: '', stderr: 'strange'});
            const result = await new Monmux(runner).version();

            assertEqual(result?.kind, ResultKind.PROTOCOL, `exit ${exitCode}`);
            assertEqual(result?.exitCode, exitCode, `exit ${exitCode} kept`);
        }));
    });

    it('refuses the status of a process that died by a signal', async () => {
        // What the adapter reports when force_exit ended the process: there is
        // no exit status to read, and NaN is not one of monmux's codes.
        const result = await switching({exitCode: NaN, stdout: '', stderr: ''});

        assertEqual(result?.kind, ResultKind.PROTOCOL);
    });
});

describe('Monmux guarantees', () => {
    it('never reports a failure with nothing to say', async () => {
        // Every answer here is one monmux should never produce. Whatever the
        // client makes of them, a `failed` result must always carry text: the
        // notification reads doc.error when there is a document and stderr
        // otherwise, and an empty body tells the user nothing at all.
        const withoutError = document('switch-failed.json');
        delete withoutError.error;

        const emptyError = document('switch-failed.json');
        emptyError.error = '   ';

        const answers = [
            answering(1, 'switch-failed.json'),
            sending(1, withoutError),
            sending(1, emptyError),
            sending(1, document('switch-sent.json')),
            {exitCode: 1, stdout: '', stderr: ''},
            {exitCode: 1, stdout: 'garbage', stderr: ''},
            {exitCode: 1, stdout: '', stderr: 'Error: something went wrong'},
            {exitCode: 1, stdout: '{}', stderr: ''},
        ];

        await Promise.all(answers.map(async (answer, index) => {
            const result = await switching(/** @type {any} */ (answer));
            if (result?.kind !== ResultKind.FAILED)
                return;

            const text = result?.doc?.error ?? result?.stderr ?? '';
            if (text.trim() === '')
                fail(`answer ${index} became a failure with an empty body`);
        }));
    });

    it('never reports a refusal without a reason to show', async () => {
        const withoutReason = document('switch-refused-input-not-enabled.json');
        delete withoutReason.refusal;

        const answers = [
            answering(2, 'switch-refused-input-not-enabled.json'),
            answering(2, 'switch-refused-multiple-candidates.json'),
            sending(2, withoutReason),
            {exitCode: 2, stdout: '', stderr: 'Refused'},
            {exitCode: 2, stdout: 'not JSON', stderr: ''},
        ];

        await Promise.all(answers.map(async (answer, index) => {
            const result = await switching(/** @type {any} */ (answer));
            if (result?.kind !== ResultKind.REFUSED)
                return;

            // Phase 4's notification reads both of these directly.
            if (!result?.doc?.refusal?.reason)
                fail(`answer ${index} became a refusal with no reason`);
        }));
    });
});

describe('Monmux cancellation', () => {
    it('resolves to no result when the runner was cancelled', async () => {
        // The caller that started this is gone. There is nothing to render and
        // nothing to report, and an error here would be reported as monmux
        // failing when it did not.
        const {runner} = recorder(null);
        const result = await new Monmux(runner).info();

        assertEqual(result, null);
    });

    it('resolves to no result for every command', async () => {
        const monmux = new Monmux(recorder(null, null, null, null).runner);

        assertEqual(await monmux.version(), null, 'version');
        assertEqual(await monmux.info(), null, 'info');
        assertEqual(await monmux.catalogList(), null, 'catalog list');
        assertEqual(await monmux.switchInput('dp'), null, 'switch');
    });
});
