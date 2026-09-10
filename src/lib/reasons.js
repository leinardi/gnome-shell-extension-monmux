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
        text: _ => _('The installed monmux is too old for this extension.'),
        link: installMonmux(),
    },
    'unknown': {
        text: _ => _('The installed monmux could not be identified.'),
        link: null,
    },
};

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
}
