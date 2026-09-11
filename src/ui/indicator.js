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
 * The panel button and its menu.
 *
 * A view, and only that. What each display and input is, and whether an input
 * may be clicked, was decided in model.js from what monmux reported; this file
 * turns that model into menu items and hands a click back to whoever built it.
 * It starts no process and holds no sentence and no URL of its own: every word
 * comes from reasons.js and every link from links.js, so a translation and a
 * review of what the menu can open each have one file to read.
 *
 * Nothing here knows about refreshes, cancellation or which switch is running.
 * The extension decides when to show the loading state, a model, or that a
 * switch is in flight; this file renders what it is told.
 *
 * The indicator owns a PanelMenu.Button rather than being one. A registered
 * GObject subclass takes its arguments through `_init`, which the type-checker
 * holds to PanelMenu.Button's own signature, and it types every field assigned
 * there as possibly undefined; a plain class with a constructor has neither
 * problem, and the button it owns is the same widget in the same panel.
 */

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {installMonmux, troubleshootingGuide} from '../lib/links.js';
import {MonmuxState, canOffer} from '../lib/model.js';
import {excerpt, openLink} from './common.js';

/** @typedef {import('../lib/model.js').Model} Model */
/** @typedef {import('../lib/model.js').DisplayModel} DisplayModel */
/** @typedef {import('../lib/model.js').InputModel} InputModel */
/** @typedef {import('../lib/model.js').Problem} Problem */
/** @typedef {import('../lib/model.js').FailingCheck} FailingCheck */
/** @typedef {import('../lib/reasons.js').Reasons} Reasons */

/**
 * @typedef {object} IndicatorParams
 * @property {{openPreferences: () => void}} extension The extension, for its
 *   preferences window.
 * @property {import('gi://Gio').default.Settings} settings The extension's
 *   settings, for the dry-run key.
 * @property {Reasons} reasons Turns codes into the words the menu shows.
 * @property {(display: DisplayModel, input: InputModel) => void} onSwitch
 *   Called when an offered input is clicked, and never while a switch runs.
 */

/** The settings key the dry-run switch shows and sets. */
const DRY_RUN_KEY = 'dry-run';

/**
 * How far a greyed item is dimmed, as a Clutter opacity from 0 to 255.
 *
 * Set on the actor rather than in stylesheet.css: St's CSS has no opacity
 * property in any Shell from 46 to 50, so a rule there would be parsed and
 * ignored.
 */
const GREYED_OPACITY = 128;

/** The reason model.js gives an input its catalog entry records and `info` did not enable. */
const RECORDED = 'recorded';

/**
 * The panel button, and the menu built from a model.
 */
export class MonmuxIndicator {
    /**
     * @param {IndicatorParams} params What the menu is rendered with, and what
     *   it calls back into.
     */
    constructor({extension, settings, reasons, onSwitch}) {
        this._reasons = reasons;
        this._onSwitch = onSwitch;
        this._settings = settings;
        this._switching = false;
        this._destroyed = false;

        /**
         * The offered inputs of the current render, so that a running switch
         * can make them insensitive.
         *
         * @type {PopupMenu.PopupMenuItem[]}
         */
        this._inputItems = [];

        /**
         * The widget the extension adds to the panel.
         *
         * @type {PanelMenu.Button}
         */
        this.button = new PanelMenu.Button(0.5, reasons.label('app-name'));
        this.button.add_child(new St.Icon({
            icon_name: 'video-display-symbolic',
            style_class: 'system-status-icon',
        }));

        // PanelMenu.Button.menu is typed as PopupMenu | PopupDummyMenu, and the
        // dummy is what you get only when the button was constructed with
        // dontCreateMenu. This one was not, so it is a real PopupMenu.
        const menu = /** @type {PopupMenu.PopupMenu} */ (this.button.menu);

        // Everything above the separator is rebuilt on every render. The footer
        // is built once, so the one handler this indicator holds on an object it
        // does not own is connected once and disconnected once.
        this._content = new PopupMenu.PopupMenuSection();
        menu.addMenuItem(this._content);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._versionItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            style_class: 'monmux-footer-version',
        });
        this._versionItem.visible = false;
        menu.addMenuItem(this._versionItem);

        const dryRun = new PopupMenu.PopupSwitchMenuItem(
            reasons.label('dry-run'), settings.get_boolean(DRY_RUN_KEY));
        dryRun.connect('toggled', (_item, state) => settings.set_boolean(DRY_RUN_KEY, state));
        menu.addMenuItem(dryRun);

        // The key can also change outside the menu, from dconf or a future
        // preferences page, so the switch follows it. Setting the state does not
        // emit `toggled`, so the two handlers cannot feed each other.
        this._dryRunChangedId = settings.connect(`changed::${DRY_RUN_KEY}`,
            () => dryRun.setToggleState(settings.get_boolean(DRY_RUN_KEY)));

        const preferences = new PopupMenu.PopupMenuItem(reasons.label('preferences'));
        preferences.connect('activate', () => extension.openPreferences());
        menu.addMenuItem(preferences);

        // Released when the button goes, however it goes: through destroy()
        // below, or along with a parent destroyed from C, where no method here
        // is called. Every other handler in this file is on an item that dies
        // with the button.
        this.button.connect('destroy', () => this._release());

        this.showLoading();
    }

    /**
     * Destroy the button, its menu, and the handler on the settings.
     *
     * @returns {void}
     */
    destroy() {
        if (!this._destroyed)
            this.button.destroy();
    }

    /**
     * The button's menu, typed as the real menu it is.
     *
     * @returns {PopupMenu.PopupMenu} The menu.
     */
    get menu() {
        return /** @type {PopupMenu.PopupMenu} */ (this.button.menu);
    }

    /**
     * Show that monmux could not be run to read the displays, in place of
     * whatever is shown.
     *
     * @param {string} message What the Shell reported.
     * @returns {void}
     */
    showError(message) {
        this._clear();
        this._content.addMenuItem(textItem(this._reasons.label('run-failed'), excerpt(message), false));
    }

    /**
     * Show that the displays are being read, in place of whatever is shown.
     *
     * @returns {void}
     */
    showLoading() {
        this._clear();
        this._content.addMenuItem(textItem(this._reasons.label('reading-displays'), null, false));
    }

    /**
     * Show a model, in place of whatever is shown.
     *
     * @param {Model} model What monmux reported, as model.js built it.
     * @returns {void}
     */
    showModel(model) {
        this._clear();

        const version = model.version;
        this._versionItem.label.text = version === null
            ? ''
            : this._reasons.label('monmux-version', {version});
        this._versionItem.visible = version !== null;

        const groups = [
            ...model.problems.map(problem => this._problemGroup(problem)),
            ...model.checks.length > 0 ? [this._checksGroup(model.checks)] : [],
            ...model.displays.map(display => this._displayGroup(display)),
        ];

        // The one state with nothing else to say: monmux is usable, answered
        // cleanly, and reported no display.
        if (groups.length === 0) {
            const empty = new PopupMenu.PopupMenuSection();
            empty.addMenuItem(textItem(this._reasons.text('no-displays'), null, true));
            groups.push(empty);
        }

        groups.forEach((group, index) => {
            if (index > 0)
                this._content.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._content.addMenuItem(group);
        });
    }

    /**
     * Make the offered inputs unclickable while a switch runs, or clickable
     * again once it has finished.
     *
     * The state is kept as well as applied, so that a render during a switch
     * builds its inputs insensitive too.
     *
     * @param {boolean} switching Whether a switch is running.
     * @returns {void}
     */
    setSwitching(switching) {
        this._switching = switching;

        for (const item of this._inputItems)
            item.setSensitive(!switching);
    }

    /**
     * @returns {void}
     */
    _release() {
        this._destroyed = true;
        this._settings.disconnect(this._dryRunChangedId);
        this._inputItems = [];
    }

    /**
     * @returns {void}
     */
    _clear() {
        this._content.removeAll();
        this._inputItems = [];

        // Only a model says which monmux answered. Loading and an error keep no
        // footer from a model they replaced.
        this._versionItem.visible = false;
    }

    /**
     * Something that stops the menu from showing the displays normally.
     *
     * @param {Problem} problem The problem.
     * @returns {PopupMenu.PopupMenuSection} Its sentence, what monmux wrote
     *   about it, and the install link where installing is the remedy.
     */
    _problemGroup(problem) {
        const group = new PopupMenu.PopupMenuSection();
        const detail = problem.detail === null ? null : excerpt(problem.detail);
        group.addMenuItem(textItem(this._reasons.text(problem.reasonCode), detail, false));

        if (problem.reasonCode === MonmuxState.MISSING || problem.reasonCode === MonmuxState.TOO_OLD)
            group.addMenuItem(linkItem(this._reasons.label('install-monmux'), installMonmux()));

        return group;
    }

    /**
     * @param {FailingCheck[]} checks The checks that did not pass.
     * @returns {PopupMenu.PopupMenuSection} One line per check, then the
     *   troubleshooting link.
     */
    _checksGroup(checks) {
        const group = new PopupMenu.PopupMenuSection();

        for (const check of checks)
            group.addMenuItem(textItem(this._checkText(check), null, false));

        group.addMenuItem(linkItem(this._reasons.label('troubleshooting'), troubleshootingGuide()));

        return group;
    }

    /**
     * @param {FailingCheck} check A check that did not pass.
     * @returns {string} Its line, in monmux's own words.
     */
    _checkText(check) {
        if (check.name !== null && check.detail !== null)
            return this._reasons.label('failing-check', {name: check.name, detail: check.detail});

        // A check with neither field is monmux's answer breaking its own format,
        // and saying so beats an empty line.
        return check.name ?? check.detail ?? this._reasons.text('protocol');
    }

    /**
     * One display: a header, its inputs, and its call to action.
     *
     * @param {DisplayModel} display The display.
     * @returns {PopupMenu.PopupMenuSection} Its section.
     */
    _displayGroup(display) {
        const group = new PopupMenu.PopupMenuSection();
        const greyed = display.reasonCode !== null;
        const reason = display.reasonCode === null ? null : this._reasons.text(display.reasonCode);

        // The header's second line is the model when there is one. A display
        // with no model has a reason instead - for one the catalog does not
        // know, that reason is the not-in-the-catalog line - and a display that
        // has both gets the reason on a line of its own.
        const title = display.label ?? this._reasons.label('unnamed-display');
        group.addMenuItem(textItem(title, display.model ?? reason, greyed));

        if (display.model !== null && reason !== null)
            group.addMenuItem(textItem(reason, null, true));

        for (const input of display.inputs)
            group.addMenuItem(this._inputItem(display, input));

        if (display.cta !== null) {
            const {text, link} = this._reasons.describe(display.cta);
            if (link !== null)
                group.addMenuItem(linkItem(text, link));
        }

        return group;
    }

    /**
     * One input: clickable when model.js says it may be offered, greyed with
     * its reason otherwise.
     *
     * @param {DisplayModel} display The display it is listed under.
     * @param {InputModel} input The input.
     * @returns {PopupMenu.PopupBaseMenuItem} Its item.
     */
    _inputItem(display, input) {
        if (!canOffer(display, input))
            return textItem(input.label ?? input.name, this._inputReason(display, input), true);

        // canOffer() holds only for an input with no reason, and model.js gives
        // a reason to every input it could not label.
        const item = new PopupMenu.PopupMenuItem(/** @type {string} */ (input.label));
        item.connect('activate', () => {
            // Ignored rather than queued: a click during a switch is a click on
            // a menu that no longer describes what the monitor is doing.
            if (!this._switching)
                this._onSwitch(display, input);
        });
        item.setSensitive(!this._switching);
        this._inputItems.push(item);

        return item;
    }

    /**
     * @param {DisplayModel} display The display the input is listed under.
     * @param {InputModel} input An input that is not offered.
     * @returns {string} Why it is not.
     */
    _inputReason(display, input) {
        // The fields say two things about a recorded input, and the line says
        // both and nothing more: that it is not enabled, and the grade of the
        // evidence behind the record.
        if (input.reasonCode === RECORDED && input.grade !== null) {
            return this._reasons.label('recorded-input', {
                state: this._reasons.text(RECORDED),
                grade: this._reasons.text(input.grade),
            });
        }

        // An input with no reason of its own is not offered because its display
        // is not, and canOffer() guarantees one of the two has a reason.
        return this._reasons.text(input.reasonCode ?? /** @type {string} */ (display.reasonCode));
    }
}

/**
 * A line of text that is not clickable, with an optional second line.
 *
 * @param {string} title The first line.
 * @param {?string} subtitle The second line, or null.
 * @param {boolean} greyed Whether it is shown dimmed, as something unavailable.
 * @returns {PopupMenu.PopupBaseMenuItem} The item.
 */
function textItem(title, subtitle, greyed) {
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});

    // A plain widget with a vertical box layout rather than St.BoxLayout's
    // `vertical`, which Shell 48 deprecated, or its `orientation`, which Shell
    // 46 does not have.
    const box = new St.Widget({
        layout_manager: new Clutter.BoxLayout({orientation: Clutter.Orientation.VERTICAL}),
        x_expand: true,
    });

    const titleLabel = wrappingLabel(title, 'monmux-text');
    box.add_child(titleLabel);

    if (subtitle !== null)
        box.add_child(wrappingLabel(subtitle, 'monmux-text monmux-subtitle'));

    item.add_child(box);
    item.label_actor = titleLabel;

    if (greyed) {
        item.add_style_class_name('monmux-greyed');
        item.opacity = GREYED_OPACITY;
    }

    return item;
}

/**
 * A label that wraps at the width stylesheet.css gives it.
 *
 * @param {string} text The text.
 * @param {string} styleClass Its style classes.
 * @returns {St.Label} The label.
 */
function wrappingLabel(text, styleClass) {
    const label = new St.Label({text, style_class: styleClass});

    // Reasons and raw output can be long, and a menu as wide as its longest
    // line runs off the screen.
    label.clutter_text.line_wrap = true;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

    return label;
}

/**
 * An item that opens a documentation page.
 *
 * @param {string} text What it says.
 * @param {string} link An absolute URL from links.js.
 * @returns {PopupMenu.PopupMenuItem} The item.
 */
function linkItem(text, link) {
    const item = new PopupMenu.PopupMenuItem(text);
    item.connect('activate', () => openLink(link));

    return item;
}
