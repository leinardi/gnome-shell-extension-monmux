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
 * The one place a code becomes a sentence a user reads.
 *
 * The model emits codes and never prose, so that everything the menu says is
 * translated in one file and nothing invents a reason monmux did not give. This
 * is the other half of that arrangement: every code the model can emit has an
 * entry here, and a code with no entry renders as the code itself rather than
 * as nothing, so a value from a newer monmux is visible instead of hidden.
 *
 * gettext arrives as a constructor argument rather than as an import. The
 * Shell's `gettext` comes from `resource:///`, and importing that here would
 * make this module unloadable under plain gjs and untestable with it — the
 * whole reason logic lives in src/lib.
 *
 * The strings are written inside a `_(…)` call, not stored as bare literals and
 * translated later, because that call is what xgettext extracts.
 */

import {addingAMonitor, installMonmux, troubleshooting} from './links.js';
import {MINIMUM} from './version.js';

/**
 * @typedef {object} Reason
 * @property {string} text The translated sentence.
 * @property {?string} link A page explaining it, or null when there is none.
 */

/**
 * @typedef {object} ReasonEntry
 * @property {(gettext: (message: string) => string) => string} text Builds the
 *   translated sentence.
 * @property {?string} link The page explaining it.
 */

/**
 * Why monmux declined to write, one entry per reason in its closed set.
 *
 * Every one links to its own section of the troubleshooting page, which is
 * written per reason for exactly this.
 *
 * @type {{[code: string]: ReasonEntry}}
 */
const REFUSALS = {
    'backend-unavailable': {
        text: _ => _('No monitor-control backend is available for this system.'),
        link: troubleshooting('backend-unavailable'),
    },
    'backend-not-ready': {
        text: _ => _('The backend tool is not usable.'),
        link: troubleshooting('backend-not-ready'),
    },
    'enumeration-failed': {
        text: _ => _('The attached displays could not be listed.'),
        link: troubleshooting('enumeration-failed'),
    },
    'no-displays': {
        text: _ => _('No display was detected.'),
        link: troubleshooting('no-displays'),
    },
    'display-not-writable': {
        text: _ => _('This display cannot be written to.'),
        link: troubleshooting('display-not-writable'),
    },
    'unknown-monitor': {
        text: _ => _('No catalog entry matches this monitor.'),
        link: troubleshooting('unknown-monitor'),
    },
    'ambiguous-catalog': {
        text: _ => _('More than one catalog entry claims this monitor.'),
        link: troubleshooting('ambiguous-catalog'),
    },
    'multiple-candidates': {
        text: _ => _('More than one attached display could be the one meant.'),
        link: troubleshooting('multiple-candidates'),
    },
    'input-not-enabled': {
        text: _ => _('This input is not enabled for this model.'),
        link: troubleshooting('input-not-enabled'),
    },
    'serial-mismatch': {
        text: _ => _('No attached display matches the pinned serial number.'),
        link: troubleshooting('serial-mismatch'),
    },
    'target-not-ready': {
        text: _ => _('This display cannot be reached over DDC right now.'),
        link: troubleshooting('target-not-ready'),
    },
    'identity-changed': {
        text: _ => _('The display changed between being identified and being written to.'),
        link: troubleshooting('identity-changed'),
    },
    'invalid-operation': {
        text: _ => _('This backend does not implement the requested operation.'),
        link: troubleshooting('invalid-operation'),
    },
};

/**
 * The state a display is in, as the backend reports it.
 *
 * No link: the troubleshooting page is written per refusal reason, and a
 * fragment named after a status would point at a heading that is not there.
 *
 * @type {{[code: string]: ReasonEntry}}
 */
const STATUSES = {
    'no-ddc-channel': {
        text: _ => _('This display exposes no DDC channel.'),
        link: null,
    },
    'edid-unreadable': {
        text: _ => _('This display\'s EDID could not be read.'),
        link: null,
    },
    'no-uuid': {
        text: _ => _('This display has no UUID to address it by.'),
        link: null,
    },
};

/**
 * How the display matched the catalog. `exact` has no entry: a monitor that
 * matched needs no sentence explaining that it did.
 *
 * @type {{[code: string]: ReasonEntry}}
 */
const MATCHES = {
    'none': {
        text: _ => _('Not in the monmux catalog.'),
        link: addingAMonitor(),
    },
    'ambiguous': {
        text: _ => _('More than one catalog entry claims this monitor.'),
        link: troubleshooting('ambiguous-catalog'),
    },
};

/**
 * What the menu may do with an input.
 *
 * @type {{[code: string]: ReasonEntry}}
 */
const INPUT_STATES = {
    'enabled': {
        text: _ => _('Enabled for this model.'),
        link: null,
    },
    'recorded': {
        text: _ => _('Recorded, not write-enabled.'),
        link: addingAMonitor(),
    },
};

/**
 * The evidence behind a recorded value.
 *
 * These read as a fragment rather than as a sentence: they are shown next to
 * the input state, not on their own.
 *
 * Each says what monmux's own definition says and stops there. The grade is
 * about how strong the evidence is, not about who produced it or where it came
 * from, and the catalog carries no field for either — so neither does this. The
 * definitions are in monmux's internal/catalog/catalog.go.
 *
 * @type {{[code: string]: ReasonEntry}}
 */
const GRADES = {
    'verified': {
        text: _ => _('tested directly on this model'),
        link: null,
    },
    'documented': {
        text: _ => _('from the manufacturer\'s documentation'),
        link: null,
    },
    'reported': {
        text: _ => _('reported working for this input'),
        link: null,
    },
    'quoted': {
        text: _ => _('quoted in a report, inputs not tried one by one'),
        link: null,
    },
};

/**
 * Whether monmux itself can be used. `ok` has no entry: the menu shows the
 * displays then, not a sentence about the tool.
 *
 * @type {{[code: string]: ReasonEntry}}
 */
const MONMUX_STATES = {
    'missing': {
        text: _ => _('monmux is not installed.'),
        link: installMonmux(),
    },
    'too-old': {
        // Translators: {minimum} is a version number, such as 0.6.0.
        text: _ => fill(_('The installed monmux is too old for this extension, which needs version {minimum} or newer.'), {minimum: MINIMUM}),
        link: installMonmux(),
    },
    'unknown': {
        text: _ => _('The installed monmux could not be identified.'),
        link: null,
    },
};

/**
 * Why the menu cannot show the displays as monmux normally reports them.
 *
 * No link: none of these has a section of its own anywhere, and the text monmux
 * wrote travels with the code for the menu to show next to it.
 *
 * @type {{[code: string]: ReasonEntry}}
 */
const REPORT_PROBLEMS = {
    'report-refused': {
        text: _ => _('monmux refused while reading the displays.'),
        link: null,
    },
    'report-failed': {
        text: _ => _('monmux failed while reading the displays.'),
        link: null,
    },
    'catalog-failed': {
        text: _ => _('monmux failed while reading its catalog.'),
        link: null,
    },
    'protocol': {
        text: _ => _('monmux gave an answer that does not follow its documented format.'),
        link: null,
    },
    'serials-unreadable': {
        text: _ => _('The serial numbers could not be read, so a click cannot be pinned to one display.'),
        link: null,
    },
};

/**
 * What the menu invites the user to do about a display.
 *
 * @type {{[code: string]: ReasonEntry}}
 */
const CALLS_TO_ACTION = {
    'adding-a-monitor': {
        text: _ => _('Test and report this monitor'),
        link: addingAMonitor(),
    },
};

/**
 * The words the menu and the notifications are built from, apart from reasons.
 *
 * Not codes the model emits or monmux reports: these are the extension's own
 * labels, titles and fixed sentences. They live here all the same, so that
 * src/ui holds no sentence of its own and a translator finds every string a user
 * reads in one file.
 *
 * Placeholders are named, so a translation can reorder them, and they are only
 * ever filled with monmux's own strings, which stay untranslated.
 *
 * @type {{[code: string]: (gettext: (message: string) => string) => string}}
 */
const LABEL_ENTRIES = {
    'reading-displays': _ => _('Reading displays…'),
    'unnamed-display': _ => _('Unnamed display'),
    'install-monmux': _ => _('How to install monmux'),
    'troubleshooting': _ => _('Troubleshooting'),
    'report-problem': _ => _('Report this'),
    // Translators: {version} is the version monmux reported, such as v0.6.0.
    'monmux-version': _ => _('monmux {version}'),
    'dry-run': _ => _('Dry run'),
    'preferences': _ => _('Preferences'),
    // Translators: {name} and {detail} are monmux's own untranslated words for
    // one of its checks, such as "ddcutil binary" and "not found on PATH".
    'failing-check': _ => _('{name}: {detail}'),
    // Translators: {state} is the sentence "Recorded, not write-enabled." and
    // {grade} how strong the evidence is, such as "tested directly on this model".
    'recorded-input': _ => _('{state} Evidence: {grade}.'),
    // Translators: the name of the tool, used as the panel button's accessible
    // name and as the title of the notification source.
    'app-name': _ => _('monmux'),
    'sent-title': _ => _('Input-switch command sent'),
    // Translators: {input} is an input such as DisplayPort, {display} a connector
    // such as card1-DP-1, and {model} a monitor model. Never say the monitor
    // switched: monmux only knows that the command was sent.
    'sent-body': _ => _('Sent {input} to {display} ({model}). Whether the monitor changed input is not independently confirmed.'),
    'refused-title': _ => _('monmux refused'),
    'nothing-written': _ => _('No DDC write was performed.'),
    'failed-title': _ => _('monmux failed'),
    // Translators: said of every run that did not end in a refusal and did not
    // report success. Keep it exactly as definite: the status is not known.
    'write-status-unknown': _ => _('The write status is unknown.'),
    'protocol-title': _ => _('monmux gave an unexpected answer'),
    'too-old-title': _ => _('monmux is too old'),
    'run-failed': _ => _('monmux could not be run, or what it wrote could not be read.'),
    // Translators: "Serial targeting" is the name of the switch on the General
    // page of the extension's preferences.
    'serial-targeting-hint': _ => _('To pick one of them from the menu, turn on Serial targeting in the preferences.'),
};

/**
 * Every label code.
 *
 * Exported so a test can assert that each one is translated and non-empty.
 */
export const LABELS = Object.freeze(Object.keys(LABEL_ENTRIES));

/**
 * Put values into a translated template.
 *
 * A function replacement rather than a string one, so a `$&` in a value monmux
 * reported is inserted as it is instead of being read as a replacement pattern;
 * and one pass, so a value that happens to contain `{name}` is not filled in
 * turn. A placeholder with no value stays visible rather than turning into
 * nothing.
 *
 * @param {string} template The translated template.
 * @param {{[name: string]: string}} values What fills its placeholders.
 * @returns {string} The filled template.
 */
function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (placeholder, name) =>
        Object.hasOwn(values, name) ? values[name] : placeholder);
}

/**
 * Every code that has an entry, grouped as the model groups them.
 *
 * Exported so a test can assert that the model and this table agree, which is
 * the only way to catch a code the model started emitting and nobody wrote a
 * sentence for.
 */
export const CODES = Object.freeze({
    refusal: Object.freeze(Object.keys(REFUSALS)),
    status: Object.freeze(Object.keys(STATUSES)),
    match: Object.freeze(Object.keys(MATCHES)),
    inputState: Object.freeze(Object.keys(INPUT_STATES)),
    grade: Object.freeze(Object.keys(GRADES)),
    monmux: Object.freeze(Object.keys(MONMUX_STATES)),
    report: Object.freeze(Object.keys(REPORT_PROBLEMS)),
    cta: Object.freeze(Object.keys(CALLS_TO_ACTION)),
});

/**
 * One flat lookup. The groups above are documentation and a test fixture; at
 * run time a code is a code, and the model never says which group it came from.
 *
 * The groups share no code today, and a test asserts they never start to: a
 * collision here would silently take one group's sentence for another's.
 *
 * @type {{[code: string]: ReasonEntry}}
 */
const ENTRIES = {
    ...REFUSALS,
    ...STATUSES,
    ...MATCHES,
    ...INPUT_STATES,
    ...GRADES,
    ...MONMUX_STATES,
    ...REPORT_PROBLEMS,
    ...CALLS_TO_ACTION,
};

/**
 * Turns the codes the model emits into text the user reads.
 */
export class Reasons {
    /**
     * @param {(message: string) => string} gettext The translation function.
     *   In the Shell that is the extension's own `gettext` import; a test
     *   passes an identity function, or one that marks what it was given.
     */
    constructor(gettext) {
        this._gettext = gettext;
    }

    /**
     * Describe one code.
     *
     * @param {string} code Anything the model emitted.
     * @returns {Reason} The sentence and, where one exists, the page for it.
     */
    describe(code) {
        const entry = Object.hasOwn(ENTRIES, code) ? ENTRIES[code] : null;
        if (entry === null) {
            // Deliberately not translated, and deliberately not a sentence:
            // this is a value from a monmux newer than this extension, and
            // showing it verbatim is what lets somebody report it.
            return {text: code, link: null};
        }

        return {text: entry.text(this._gettext), link: entry.link};
    }

    /**
     * The translated sentence for a code, without its link.
     *
     * @param {string} code Anything the model emitted.
     * @returns {string} The sentence, or the code itself.
     */
    text(code) {
        return this.describe(code).text;
    }

    /**
     * One of the extension's own labels.
     *
     * @param {string} code A label code, from {@link LABELS}.
     * @param {{[name: string]: string}} [values] What fills its placeholders:
     *   monmux's own strings, inserted untranslated.
     * @returns {string} The translated label, or the code itself when there is
     *   no such label - visible in the menu, like an unknown reason, rather than
     *   an exception thrown halfway through building it.
     */
    label(code, values = {}) {
        if (!Object.hasOwn(LABEL_ENTRIES, code))
            return code;

        return fill(LABEL_ENTRIES[code](this._gettext), values);
    }
}
