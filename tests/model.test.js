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
 * The model, built from what the client makes of each fixture.
 *
 * Every answer goes through the real client with a runner that hands back a
 * fixed answer, so the results the model is built from are the ones the Shell
 * would build it from, not hand-written look-alikes. Nothing here spawns: the
 * runner is a function.
 *
 * Every assertion is on codes, catalog labels and names monmux printed. None is
 * on a sentence, because the model has none.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {EMITTED, InputState, MonmuxState, buildModel, canOffer} from '../src/lib/model.js';
import {Monmux} from '../src/lib/monmux.js';
import {assertDeepEqual, assertEqual, assertThrows, describe, fail, it} from './harness.js';

/**
 * @typedef {import('../src/lib/model.js').Model} Model
 * @typedef {import('../src/lib/model.js').DisplayModel} DisplayModel
 */

/**
 * What a runner hands the client.
 *
 * @typedef {object} Answer
 * @property {number} exitCode The exit status.
 * @property {string} stdout What monmux wrote to stdout.
 * @property {string} stderr What monmux wrote to stderr.
 */

/**
 * What monmux answers each of the three calls with. A `version` of null is a
 * monmux that is not installed; anything left out gets the captured answer.
 *
 * @typedef {object} Scenario
 * @property {?Answer} [version] The answer to `version --json`.
 * @property {Answer} [info] The answer to `info --json`.
 * @property {Answer} [catalog] The answer to `catalog list --json`.
 */

const FIXTURES = GLib.build_filenamev([
    Gio.File.new_for_uri(import.meta.url).get_parent()?.get_path() ?? '.',
    'fixtures',
]);

/**
 * Read one fixture.
 *
 * @param {string} name The file name under tests/fixtures.
 * @returns {string} Its contents.
 */
function fixture(name) {
    const path = GLib.build_filenamev([FIXTURES, name]);
    const [, bytes] = Gio.File.new_for_path(path).load_contents(null);

    return new TextDecoder().decode(bytes);
}

/**
 * Read one fixture as a document, so a test can change it.
 *
 * @param {string} name The file name under tests/fixtures.
 * @returns {any} The decoded document.
 */
function document(name) {
    return JSON.parse(fixture(name));
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
 * @param {string} name A fixture under tests/fixtures.
 * @param {number} [exitCode] The exit status to answer with.
 * @param {string} [stderr] What monmux wrote to stderr.
 * @returns {Answer} An answer carrying the fixture.
 */
function answering(name, exitCode = 0, stderr = '') {
    return answer(exitCode, fixture(name), stderr);
}

/**
 * @param {any} doc A document.
 * @param {number} [exitCode] The exit status to answer with.
 * @param {string} [stderr] What monmux wrote to stderr.
 * @returns {Answer} An answer carrying the document.
 */
function sending(doc, exitCode = 0, stderr = '') {
    return answer(exitCode, JSON.stringify(doc), stderr);
}

/**
 * The captured LG display, with some of its fields replaced.
 *
 * @param {{[field: string]: any}} [overrides] The fields to replace.
 * @returns {any} A report entry.
 */
function display(overrides = {}) {
    return {...document('info-writable.json').displays[0], ...overrides};
}

/**
 * The captured report, listing these displays instead of its own.
 *
 * @param {...any} displays The report entries.
 * @returns {Answer} An answer to `info --json`.
 */
function reporting(...displays) {
    return sending({...document('info-writable.json'), displays});
}

/**
 * The captured catalog, changed by a function.
 *
 * @param {(doc: any) => void} edit Changes the document in place.
 * @returns {Answer} An answer to `catalog list --json`.
 */
function catalogWith(edit) {
    const doc = document('catalog-list.json');
    edit(doc);

    return sending(doc);
}

/**
 * One entry of a catalog document.
 *
 * @param {any} doc The catalog document.
 * @param {string} fullName The entry's full name.
 * @returns {any} The entry.
 */
function entryOf(doc, fullName) {
    const found = doc.models.find(/** @param {any} model */ model => model.fullName === fullName);
    if (found === undefined)
        return fail(`the catalog fixture has no ${fullName}`);

    return found;
}

/**
 * A scenario with every left-out answer filled in.
 *
 * @param {Scenario} scenario The scenario.
 * @returns {{version: ?Answer, info: Answer, catalog: Answer}} Every answer.
 */
function filled(scenario) {
    return {
        version: scenario.version === undefined ? answering('version.json') : scenario.version,
        info: scenario.info ?? answering('info-writable.json'),
        catalog: scenario.catalog ?? answering('catalog-list.json'),
    };
}

/**
 * Run a scenario through the client and build the model from the results.
 *
 * @param {Scenario} scenario What monmux answers.
 * @returns {Promise<Model>} The model.
 */
async function modelOf(scenario) {
    const {version, info, catalog} = filled(scenario);
    if (version === null)
        return buildModel({version: null, info: null, catalog: null});

    const [versionResult, infoResult, catalogResult] = await Promise.all([
        new Monmux(() => Promise.resolve(version)).version(),
        new Monmux(() => Promise.resolve(info)).info(),
        new Monmux(() => Promise.resolve(catalog)).catalogList(),
    ]);

    return buildModel({version: versionResult, info: infoResult, catalog: catalogResult});
}

/**
 * The one display a model is expected to have.
 *
 * @param {Model} model The model.
 * @returns {DisplayModel} Its display.
 */
function onlyDisplay(model) {
    if (model.displays.length !== 1)
        return fail(`expected one display, got ${model.displays.length}`);

    return model.displays[0];
}

/**
 * An input the model offers, spelled out.
 *
 * @param {string} name The input's name.
 * @param {string} label The catalog's label for it.
 * @param {string} grade The catalog's grade for it.
 * @returns {object} The model's entry.
 */
function enabled(name, label, grade) {
    return {name, label, state: 'enabled', grade, reasonCode: null};
}

/**
 * An input the model greys because the catalog records it and info does not
 * enable it, spelled out.
 *
 * @param {string} name The input's name.
 * @param {string} label The catalog's label for it.
 * @param {string} grade The catalog's grade for it.
 * @returns {object} The model's entry.
 */
function recorded(name, label, grade) {
    return {name, label, state: 'recorded', grade, reasonCode: 'recorded'};
}

/**
 * Every situation the suite builds a model for, fixtures first.
 *
 * The code-table tests below run over all of them, so a code is only proven
 * reachable if one of these reaches it.
 *
 * @type {{[name: string]: Scenario}}
 */
const SCENARIOS = {
    'info-writable': {info: answering('info-writable.json')},
    'info-unknown-monitor': {info: answering('info-unknown-monitor.json')},
    'info-not-write-enabled': {info: answering('info-not-write-enabled.json')},
    'info-edid-unreadable': {info: answering('info-edid-unreadable.json')},
    'info-two-identical': {info: answering('info-two-identical.json')},
    'info-checks-failing': {info: answering('info-checks-failing.json')},
    'not installed': {version: null},
    'too old for --json': {version: answer(1, '', 'Error: unknown flag: --json\n')},
    'version failed': {version: answer(1, '', 'monmux: could not read the build information\n')},
    'info refused': {info: answering('info-checks-failing.json', 2, 'ddcutil was not found on PATH\n')},
    'info failed without a report': {info: answer(1, '', 'monmux: enumeration failed\n')},
    'info not a document': {info: answer(0, 'not a document')},
    'catalog failed': {catalog: answer(1, '', 'monmux: the catalog is corrupt\n')},
    'no DDC channel': {info: reporting(display({status: 'no-ddc-channel', writable: false, enabledInputs: []}))},
    'no UUID': {info: reporting(display({status: 'no-uuid', writable: false, enabledInputs: []}))},
    'not writable': {info: reporting(display({writable: false, enabledInputs: []}))},
    'ambiguous': {info: reporting(display({match: 'ambiguous', model: '', enabledInputs: []}))},
    'a model the catalog does not list': {info: reporting(display({model: 'LG 99ZZ999'}))},
    'an enabled input the catalog does not record': {
        info: reporting(display({enabledInputs: ['dp', 'hdmi1']})),
    },
    'documented and quoted grades': {
        info: reporting(
            display({label: 'card1-DP-1', model: 'LG 32BL95U-W', enabledInputs: []}),
            display({label: 'card1-DP-2', model: 'AOC U27U2DS', enabledInputs: []})),
    },
};

/**
 * Build the model for every scenario.
 *
 * @returns {Promise<{name: string, scenario: Scenario, model: Model}[]>} Each
 *   scenario with its model.
 */
function buildEveryScenario() {
    return Promise.all(Object.entries(SCENARIOS).map(async ([name, scenario]) => ({
        name,
        scenario,
        model: await modelOf(scenario),
    })));
}

/**
 * Every string anywhere in a value.
 *
 * @param {unknown} value Anything.
 * @param {string[]} [into] Where to collect them.
 * @returns {string[]} The strings.
 */
function stringsIn(value, into = []) {
    if (typeof value === 'string') {
        into.push(value);
    } else if (Array.isArray(value)) {
        for (const item of value)
            stringsIn(item, into);
    } else if (typeof value === 'object' && value !== null) {
        for (const item of Object.values(value))
            stringsIn(item, into);
    }

    return into;
}

/**
 * @param {string} text Anything.
 * @returns {unknown} The decoded document, or null when it is not one.
 */
function tryParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

describe('buildModel over the fixtures', () => {
    it('offers the enabled inputs of the captured display, labelled by the catalog', async () => {
        const model = await modelOf(SCENARIOS['info-writable']);

        assertDeepEqual(model, {
            monmux: 'ok',
            version: 'v0.6.0',
            problems: [],
            checks: [],
            displays: [{
                label: 'card1-DP-1',
                model: 'LG 38WR85QC-W',
                status: 'ok',
                match: 'exact',
                writable: true,
                inputs: [
                    enabled('dp', 'DisplayPort', 'verified'),
                    enabled('usb-c', 'USB-C', 'verified'),
                ],
                reasonCode: null,
                cta: null,
            }],
        });
    });

    it('greys a monitor the catalog does not know, with the call to action', async () => {
        const model = await modelOf(SCENARIOS['info-unknown-monitor']);

        assertDeepEqual(onlyDisplay(model), {
            label: 'card1-DP-1',
            model: null,
            status: 'ok',
            match: 'none',
            writable: true,
            inputs: [],
            reasonCode: 'none',
            cta: 'adding-a-monitor',
        });
    });

    it('greys every input of a model that records inputs and enables none', async () => {
        const model = await modelOf(SCENARIOS['info-not-write-enabled']);

        assertDeepEqual(onlyDisplay(model), {
            label: 'card1-DP-1',
            model: 'AOC Q27P1B',
            status: 'ok',
            match: 'exact',
            writable: true,
            inputs: [
                recorded('dp', 'DisplayPort', 'reported'),
                recorded('hdmi', 'HDMI', 'reported'),
                recorded('dvi', 'DVI', 'reported'),
                recorded('vga', 'VGA', 'reported'),
            ],
            reasonCode: null,
            cta: 'adding-a-monitor',
        });
    });

    it('greys a display with an unreadable EDID by its status, with no call to action', async () => {
        const model = await modelOf(SCENARIOS['info-edid-unreadable']);

        assertDeepEqual(onlyDisplay(model), {
            label: 'card1-HDMI-A-1',
            model: null,
            status: 'edid-unreadable',
            match: 'none',
            writable: false,
            inputs: [],
            reasonCode: 'edid-unreadable',
            cta: null,
        });
        assertDeepEqual(model.checks, [{name: 'card1-HDMI-A-1', detail: 'edid-unreadable'}]);
    });

    it('lists two identical displays apart, by label', async () => {
        const model = await modelOf(SCENARIOS['info-two-identical']);

        assertDeepEqual(model.displays.map(each => each.label), ['card1-DP-1', 'card1-DP-2']);

        for (const each of model.displays) {
            assertDeepEqual(each.inputs, [
                enabled('dp', 'DisplayPort', 'verified'),
                enabled('usb-c', 'USB-C', 'verified'),
            ], each.label ?? 'no label');
        }
    });

    it('lists the failing checks and nothing else', async () => {
        const model = await modelOf(SCENARIOS['info-checks-failing']);

        assertDeepEqual(model.checks, [{
            name: 'ddcutil binary',
            detail: 'backend-not-ready: ddcutil was not found on PATH: exec: "ddcutil": executable file not found in $PATH',
        }]);
        assertDeepEqual(model.problems, []);
    });
});

describe('buildModel monmux states', () => {
    it('reports a monmux that is not installed, and reads nothing else', () => {
        assertDeepEqual(buildModel({version: null, info: null, catalog: null}), {
            monmux: 'missing',
            version: null,
            problems: [{reasonCode: 'missing', detail: null}],
            checks: [],
            displays: [],
        });
    });

    it('reports a monmux that does not know --json as too old', async () => {
        assertDeepEqual(await modelOf(SCENARIOS['too old for --json']), {
            monmux: 'too-old',
            version: null,
            problems: [{reasonCode: 'too-old', detail: null}],
            checks: [],
            displays: [],
        });
    });

    it('reports a released version below the minimum as too old, with the version', async () => {
        const model = await modelOf({version: sending({...document('version.json'), version: 'v0.5.9'})});

        assertEqual(model.monmux, MonmuxState.TOO_OLD, 'state');
        assertEqual(model.version, 'v0.5.9', 'version');
        assertDeepEqual(model.displays, [], 'displays');
    });

    it('accepts a development build', async () => {
        const model = await modelOf({version: sending({...document('version.json'), version: 'dev'})});

        assertEqual(model.monmux, MonmuxState.OK, 'state');
        assertEqual(model.version, 'dev', 'version');
        assertEqual(model.displays.length, 1, 'displays');
    });

    it('keeps what an unidentifiable monmux wrote, rather than guessing', async () => {
        assertDeepEqual(await modelOf(SCENARIOS['version failed']), {
            monmux: 'unknown',
            version: null,
            problems: [{reasonCode: 'unknown', detail: 'monmux: could not read the build information'}],
            checks: [],
            displays: [],
        });
    });

    it('needs no other result from a monmux that cannot be used', async () => {
        const tooOld = await new Monmux(() => Promise.resolve(answer(1, '', 'Error: unknown flag: --json')))
            .version();

        assertEqual(buildModel({version: tooOld, info: null, catalog: null}).monmux, MonmuxState.TOO_OLD);
    });

    it('refuses to build a usable monmux\'s model before the other results exist', async () => {
        const version = await new Monmux(() => Promise.resolve(answering('version.json'))).version();

        assertThrows(() => buildModel({version, info: null, catalog: null}));
    });
});

describe('buildModel problems', () => {
    it('shows a report that came with a refusal, and says it was refused', async () => {
        const model = await modelOf(SCENARIOS['info refused']);

        assertDeepEqual(model.problems, [{reasonCode: 'report-refused', detail: 'ddcutil was not found on PATH'}]);
        assertEqual(model.checks.length, 1, 'checks');
        assertEqual(model.displays.length, 1, 'displays');
    });

    it('shows a report that came with a failure, and says it failed', async () => {
        const model = await modelOf({
            info: answering('info-writable.json', 1, 'monmux: enumeration failed half way'),
        });

        assertDeepEqual(model.problems, [{reasonCode: 'report-failed', detail: 'monmux: enumeration failed half way'}]);
        assertEqual(model.displays.length, 1, 'displays');
    });

    it('carries only stderr next to a report, never the report again as raw text', async () => {
        // The client already leaves stdout out of a refusal or a failure whose
        // document decoded, and the model does not rely on that: a result that
        // still carries it must not put the whole document - identities and
        // handles included - into a menu line.
        const report = fixture('info-checks-failing.json');
        const version = await new Monmux(() => Promise.resolve(answering('version.json'))).version();
        const catalog = await new Monmux(() => Promise.resolve(answering('catalog-list.json'))).catalogList();

        for (const kind of ['refused', 'failed']) {
            const model = buildModel({
                version,
                info: {kind, doc: JSON.parse(report), stdout: report, stderr: 'ddcutil was not found on PATH\n'},
                catalog,
            });

            assertDeepEqual(model.problems.map(each => each.detail), ['ddcutil was not found on PATH'], kind);
        }
    });

    it('shows no display when the report is missing', async () => {
        const model = await modelOf(SCENARIOS['info failed without a report']);

        assertDeepEqual(model.problems, [{reasonCode: 'report-failed', detail: 'monmux: enumeration failed'}]);
        assertDeepEqual(model.checks, [], 'checks');
        assertDeepEqual(model.displays, [], 'displays');
    });

    it('keeps the raw text of a report that is not a document', async () => {
        const model = await modelOf(SCENARIOS['info not a document']);

        assertDeepEqual(model.problems, [{reasonCode: 'protocol', detail: 'not a document'}]);
        assertDeepEqual(model.displays, [], 'displays');
    });

    it('shows no display without the catalog, and still shows the checks', async () => {
        const model = await modelOf({
            info: answering('info-checks-failing.json'),
            catalog: answer(1, '', 'monmux: the catalog is corrupt\n'),
        });

        assertDeepEqual(model.problems, [{reasonCode: 'catalog-failed', detail: 'monmux: the catalog is corrupt'}]);
        assertEqual(model.checks.length, 1, 'checks');
        assertDeepEqual(model.displays, [], 'displays');
    });

    it('reports every problem, in the order the calls were made', async () => {
        const model = await modelOf({
            info: answer(0, 'not a document'),
            catalog: answer(0, '{"models": "not a list"}'),
        });

        assertDeepEqual(model.problems.map(each => each.reasonCode), ['protocol', 'protocol']);
    });
});

describe('buildModel rules', () => {
    it('enables only what enabledInputs names, and greys the rest of the entry', async () => {
        const model = await modelOf({info: reporting(display({enabledInputs: ['usb-c']}))});
        const shown = onlyDisplay(model);

        assertDeepEqual(shown.inputs, [
            enabled('usb-c', 'USB-C', 'verified'),
            recorded('dp', 'DisplayPort', 'verified'),
        ]);
        assertEqual(shown.cta, 'adding-a-monitor', 'cta');
        assertDeepEqual(shown.inputs.map(input => canOffer(shown, input)), [true, false], 'offered');
    });

    it('never reads writeEnabled: monmux has already decided', async () => {
        const flipped = catalogWith(doc => {
            for (const model of doc.models)
                model.writeEnabled = !model.writeEnabled;
        });

        const names = ['info-writable.json', 'info-not-write-enabled.json'];
        const pairs = await Promise.all(names.map(name => Promise.all([
            modelOf({info: answering(name)}),
            modelOf({info: answering(name), catalog: flipped}),
        ])));

        pairs.forEach(([asCaptured, asFlipped], index) => assertDeepEqual(asFlipped, asCaptured, names[index]));
    });

    it('shows an enabled input the catalog entry does not record as a protocol condition, unlabelled', async () => {
        const shown = onlyDisplay(await modelOf(SCENARIOS['an enabled input the catalog does not record']));

        assertDeepEqual(shown.inputs, [
            enabled('dp', 'DisplayPort', 'verified'),
            {name: 'hdmi1', label: null, state: 'enabled', grade: null, reasonCode: 'protocol'},
            recorded('usb-c', 'USB-C', 'verified'),
        ]);
        assertDeepEqual(shown.inputs.map(input => canOffer(shown, input)), [true, false, false], 'offered');
    });

    it('does not label an input whose record carries no label', async () => {
        const catalog = catalogWith(doc => {
            delete entryOf(doc, 'LG 38WR85QC-W').inputs[0].label;
        });
        const shown = onlyDisplay(await modelOf({catalog}));

        assertDeepEqual(shown.inputs[0], {
            name: 'dp',
            label: null,
            state: 'enabled',
            grade: 'verified',
            reasonCode: 'protocol',
        });
        assertEqual(canOffer(shown, shown.inputs[0]), false, 'offered');
    });

    it('lists no input that neither enabledInputs nor the catalog entry names', async () => {
        const catalog = document('catalog-list.json');
        const built = await buildEveryScenario();

        for (const {name, scenario, model} of built) {
            const report = tryParse(filled(scenario).info.stdout);
            if (typeof report !== 'object' || report === null)
                continue;

            for (const shown of model.displays) {
                const reported = /** @type {any} */ (report).displays
                    .find(/** @param {any} each */ each => each.label === shown.label);
                const entry = catalog.models
                    .find(/** @param {any} each */ each => each.fullName === shown.model);
                const named = [
                    ...reported?.enabledInputs ?? [],
                    ...(entry?.inputs ?? []).map(/** @param {any} input */ input => input.name),
                ];

                for (const input of shown.inputs) {
                    if (!named.includes(input.name))
                        fail(`${name}: ${shown.label} lists ${input.name}, which nothing named`);
                }
            }
        }
    });

    it('greys a display by its status, whatever that status is, and offers nothing under it', async () => {
        // A writable, exactly matched display that monmux still gave a status
        // other than ok: the status wins over the enabled inputs.
        const statuses = ['no-ddc-channel', 'some-future-status'];
        const models = await Promise.all(statuses.map(status => modelOf({info: reporting(display({status}))})));

        for (const [index, status] of statuses.entries()) {
            const shown = onlyDisplay(models[index]);

            assertEqual(shown.reasonCode, status, `${status} reason`);
            assertDeepEqual(shown.inputs, [], `${status} inputs`);
            assertEqual(shown.cta, null, `${status} cta`);
        }
    });

    it('greys a display the backend cannot write to', async () => {
        const shown = onlyDisplay(await modelOf(SCENARIOS['not writable']));

        assertEqual(shown.reasonCode, 'display-not-writable', 'reason');
        assertDeepEqual(shown.inputs, [], 'inputs');
        assertEqual(shown.cta, null, 'cta');
    });

    it('greys an ambiguous match by the match, with no call to action', async () => {
        const shown = onlyDisplay(await modelOf(SCENARIOS['ambiguous']));

        assertEqual(shown.reasonCode, 'ambiguous', 'reason');
        assertEqual(shown.cta, null, 'cta');
    });

    it('calls inputs enabled on a display monmux would not write to a protocol condition', async () => {
        const variants = [{writable: false}, {match: 'none', model: ''}];
        const models = await Promise.all(variants.map(overrides => modelOf({info: reporting(display(overrides))})));

        for (const [index, overrides] of variants.entries()) {
            const shown = onlyDisplay(models[index]);

            assertEqual(shown.reasonCode, 'protocol', JSON.stringify(overrides));
            assertDeepEqual(shown.inputs, [], `${JSON.stringify(overrides)} inputs`);
        }
    });

    it('calls a match to a model the catalog lists no times, or twice, a protocol condition', async () => {
        const duplicated = catalogWith(doc => {
            doc.models.push(entryOf(doc, 'LG 38WR85QC-W'));
        });
        const unlabelled = {name: 'dp', label: null, state: 'enabled', grade: null, reasonCode: 'protocol'};
        const models = await Promise.all([
            modelOf({info: reporting(display({model: 'LG 99ZZ999'}))}),
            modelOf({catalog: duplicated}),
        ]);

        for (const model of models) {
            const shown = onlyDisplay(model);

            assertEqual(shown.reasonCode, 'protocol', 'reason');
            assertDeepEqual(shown.inputs[0], unlabelled, 'first input');
            assertEqual(shown.inputs.some(input => canOffer(shown, input)), false, 'offered');
        }
    });

    it('keeps a display missing a field, greyed, and offers nothing under it', async () => {
        const incomplete = display();
        delete incomplete.label;

        const shown = onlyDisplay(await modelOf({info: reporting(incomplete)}));

        assertEqual(shown.label, null, 'label');
        assertEqual(shown.reasonCode, 'protocol', 'reason');
        assertDeepEqual(shown.inputs, [], 'inputs');
    });

    it('carries every grade through as the catalog spells it', async () => {
        const model = await modelOf(SCENARIOS['documented and quoted grades']);

        assertDeepEqual(
            model.displays.map(each => [...new Set(each.inputs.map(input => input.grade))]),
            [['documented'], ['quoted']]);

        for (const each of model.displays) {
            for (const input of each.inputs)
                assertEqual(input.state, InputState.RECORDED, `${each.model} ${input.name}`);
        }
    });

    it('never offers an input under a display that has a reason', () => {
        const input = {name: 'dp', label: 'DisplayPort', state: 'enabled', grade: 'verified', reasonCode: null};
        const shown = {
            label: 'card1-DP-1',
            model: 'LG 38WR85QC-W',
            status: 'ok',
            match: 'exact',
            writable: true,
            inputs: [input],
            reasonCode: 'protocol',
            cta: null,
        };

        assertEqual(canOffer(shown, input), false);
    });
});

describe('buildModel codes', () => {
    it('emits every code it declares, and none it does not', async () => {
        /** @type {{[field: string]: Set<string>}} */
        const seen = {
            monmux: new Set(),
            problem: new Set(),
            displayReason: new Set(),
            cta: new Set(),
            inputState: new Set(),
            inputReason: new Set(),
            grade: new Set(),
        };

        for (const {model} of await buildEveryScenario()) {
            if (model.monmux !== MonmuxState.OK)
                seen.monmux.add(model.monmux);

            for (const each of model.problems)
                seen.problem.add(each.reasonCode);

            for (const shown of model.displays) {
                if (shown.reasonCode !== null)
                    seen.displayReason.add(shown.reasonCode);

                if (shown.cta !== null)
                    seen.cta.add(shown.cta);

                for (const input of shown.inputs) {
                    seen.inputState.add(input.state);

                    if (input.grade !== null)
                        seen.grade.add(input.grade);

                    if (input.reasonCode !== null)
                        seen.inputReason.add(input.reasonCode);
                }
            }
        }

        assertDeepEqual(Object.keys(seen).sort(), Object.keys(EMITTED).sort(), 'fields');

        for (const [field, codes] of Object.entries(EMITTED)) {
            for (const code of seen[field]) {
                if (!codes.includes(code))
                    fail(`${field} emitted ${code}, which EMITTED does not declare`);
            }

            for (const code of codes) {
                if (!seen[field].has(code))
                    fail(`${field} declares ${code}, which no scenario emits`);
            }
        }
    });

    it('carries no text that monmux did not print', async () => {
        const codes = new Set([...Object.values(EMITTED).flat(), 'ok', 'exact']);

        for (const {name, scenario, model} of await buildEveryScenario()) {
            /** @type {string[]} */
            const printed = [];
            for (const each of Object.values(filled(scenario))) {
                if (each === null)
                    continue;

                printed.push(each.stdout, each.stderr, ...stringsIn(tryParse(each.stdout)));
            }

            for (const value of stringsIn(model)) {
                if (codes.has(value))
                    continue;

                for (const line of value.split('\n')) {
                    if (!printed.some(text => text.includes(line)))
                        fail(`${name}: the model carries ${JSON.stringify(line)}, which monmux never printed`);
                }
            }
        }
    });

    it('carries no identity, handle or serial', async () => {
        for (const {name, model} of await buildEveryScenario()) {
            const rendered = JSON.stringify(model);

            for (const field of ['identity', 'handle', 'serial', 'productCode', 'manufacturer'])
                assertEqual(rendered.includes(field), false, `${name} ${field}`);
        }
    });
});
