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
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {buildModel, needsReports} from './lib/model.js';
import {Monmux, locate, spawn} from './lib/monmux.js';
import {Reasons} from './lib/reasons.js';
import {noSerials, readSerials, serialFor, unreadable} from './lib/serials.js';
import {SLOTS, SlotTargetKind, slotTarget} from './lib/shortcuts.js';
import {MonmuxIndicator} from './ui/indicator.js';
import {Notifier} from './ui/notify.js';

/** @typedef {import('./lib/model.js').DisplayModel} DisplayModel */
/** @typedef {import('./lib/model.js').Model} Model */
/** @typedef {import('./lib/serials.js').Serials} Serials */
/** @typedef {import('./lib/shortcuts.js').Slot} Slot */

/**
 * How long monitor changes have to stop arriving before the displays are read
 * again, in milliseconds.
 */
const HOTPLUG_SETTLE_MS = 1000;

/** The settings key a switch reads to decide whether to execute anything. */
const DRY_RUN_KEY = 'dry-run';

/** The settings key the user turns on to have clicks pinned to a serial. */
const SERIAL_TARGETING_KEY = 'serial-targeting';

/**
 * The extension entry point: the lifecycle, and when to read and when to write.
 *
 * Switches are serialised, a read never overlaps a write, and a completion that
 * outlived its generation is dropped. docs/architecture.md has the details.
 */
export default class MonmuxExtension extends Extension {
    /**
     * Declares the fields, and creates nothing.
     *
     * The Shell builds this object once and keeps it across enable() and
     * disable(), so every object here is created in enable() and released in
     * disable(). The generation counter is the one value that has to outlive
     * disable(): it is what tells a late completion that it is late.
     *
     * @param {ConstructorParameters<typeof Extension>[0]} metadata The
     *   extension's metadata.
     */
    constructor(metadata) {
        super(metadata);

        /** Bumped by every enable() and every disable(). */
        this._generation = 0;

        /** @type {?Gio.Settings} */
        this._settings = null;

        /** @type {?Monmux} */
        this._monmux = null;

        /** @type {?MonmuxIndicator} */
        this._indicator = null;

        /** @type {?Notifier} */
        this._notifier = null;

        /**
         * Every operation in flight, refresh or switch.
         *
         * @type {?Set<Gio.Cancellable>}
         */
        this._cancellables = null;

        /**
         * The newest refresh, which a newer refresh or a switch cancels.
         *
         * @type {?Gio.Cancellable}
         */
        this._refreshCancellable = null;

        /**
         * Settles when the running switch has finished, or null when none runs.
         *
         * @type {?Promise<void>}
         */
        this._switchDone = null;

        /**
         * The serials of the displays the menu shows, by label. Never rendered,
         * never logged, and never read unless serial targeting is on.
         *
         * @type {?Map<string, string>}
         */
        this._serials = null;

        /**
         * The settings keys of the shortcuts this enable() bound, and only
         * those: a key the window manager refused to bind is not removed.
         *
         * @type {?string[]}
         */
        this._keybindings = null;

        this._refreshTimeoutId = 0;
        this._monitorsChangedId = 0;
        this._menuOpenId = 0;
        this._serialTargetingChangedId = 0;
    }

    enable() {
        this._generation++;

        const settings = this.getSettings();
        const reasons = new Reasons(message => this.gettext(message));
        const indicator = new MonmuxIndicator({
            extension: this,
            settings,
            reasons,
            onSwitch: (display, input) => this._switch(input.name, display),
        });

        this._settings = settings;
        this._monmux = new Monmux(spawn);
        this._notifier = new Notifier(reasons, () => settings.get_boolean(SERIAL_TARGETING_KEY));
        this._cancellables = new Set();
        this._serials = new Map();
        this._keybindings = [];
        this._indicator = indicator;

        Main.panel.addToStatusArea(this.uuid, indicator.button);

        // The displays are read when somebody looks rather than at login:
        // reading them runs the backend, and a menu nobody opens needs none of it.
        this._menuOpenId = indicator.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._refresh();
        });

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed',
            () => this._scheduleRefresh());

        // Turning targeting on reads the serials straight away, so that they are
        // there for the first click after it: that click usually lands during
        // the refresh its menu-open started, and is pinned with what was read
        // before. Turning it off forgets them straight away too.
        this._serialTargetingChangedId = settings.connect(`changed::${SERIAL_TARGETING_KEY}`, () => {
            if (!settings.get_boolean(SERIAL_TARGETING_KEY))
                this._serials?.clear();

            this._refresh();
        });

        // One binding per slot, on the desktop only: not in the overview, and
        // never on the lock screen. The window manager watches each accelerator
        // key itself, so a shortcut changed in the settings applies at once;
        // the slot's input is read at the press, for the same reason.
        for (const slot of SLOTS) {
            const action = Main.wm.addKeybinding(slot.shortcutKey, settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, Shell.ActionMode.NORMAL,
                () => this._pressSlot(slot));

            if (action !== Meta.KeyBindingAction.NONE)
                this._keybindings.push(slot.shortcutKey);
        }
    }

    disable() {
        this._generation++;

        for (const name of this._keybindings ?? [])
            Main.wm.removeKeybinding(name);

        this._keybindings = null;

        for (const cancellable of this._cancellables ?? [])
            cancellable.cancel();

        this._cancellables?.clear();
        this._cancellables = null;
        this._refreshCancellable = null;
        this._switchDone = null;

        this._serials?.clear();
        this._serials = null;

        if (this._refreshTimeoutId !== 0) {
            GLib.Source.remove(this._refreshTimeoutId);
            this._refreshTimeoutId = 0;
        }

        if (this._monitorsChangedId !== 0) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }

        if (this._menuOpenId !== 0) {
            this._indicator?.menu.disconnect(this._menuOpenId);
            this._menuOpenId = 0;
        }

        if (this._serialTargetingChangedId !== 0) {
            this._settings?.disconnect(this._serialTargetingChangedId);
            this._serialTargetingChangedId = 0;
        }

        this._indicator?.destroy();
        this._indicator = null;

        this._notifier?.destroy();
        this._notifier = null;

        this._monmux = null;
        this._settings = null;
    }

    /**
     * Read the displays once monitor changes have stopped arriving.
     *
     * A hotplug arrives as a burst of changes, and the backend only sees the
     * new display list once they settle. Every change restarts the wait, so a
     * burst is read once, after its last change.
     *
     * @returns {void}
     */
    _scheduleRefresh() {
        if (this._refreshTimeoutId !== 0)
            GLib.Source.remove(this._refreshTimeoutId);

        this._refreshTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOTPLUG_SETTLE_MS, () => {
            this._refreshTimeoutId = 0;
            this._refresh();

            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Read the displays and show what monmux reported.
     *
     * Never rejects: a failure is shown in the menu, and a stale result is
     * dropped.
     *
     * @returns {Promise<void>}
     */
    async _refresh() {
        const cancellables = this._cancellables;
        if (cancellables === null)
            return;

        const generation = this._generation;

        this._refreshCancellable?.cancel();
        const cancellable = new Gio.Cancellable();
        this._refreshCancellable = cancellable;
        cancellables.add(cancellable);

        try {
            if (this._switchDone !== null)
                await this._switchDone;

            if (!this._isCurrent(generation, cancellable))
                return;

            const model = await this._readModel(cancellable);
            if (model === null || !this._isCurrent(generation, cancellable))
                return;

            const serials = await this._readSerials(model, cancellable);
            if (serials === null || !this._isCurrent(generation, cancellable))
                return;

            // Replaced here, together with the model they belong to, and not
            // when the refresh starts: the usual click lands while the refresh
            // its menu-open started is still reading, on inputs of the model
            // still shown, and it is pinned with that model's serials.
            this._serials = serials.byLabel;
            this._indicator?.showModel(serials.problem === null
                ? model
                : {...model, problems: [...model.problems, serials.problem]});
        } catch (error) {
            if (this._isCurrent(generation, cancellable)) {
                this._serials = new Map();
                this._indicator?.showError(String(error));
            }
        } finally {
            cancellables.delete(cancellable);

            if (this._refreshCancellable === cancellable)
                this._refreshCancellable = null;
        }
    }

    /**
     * Ask monmux for everything the model is built from.
     *
     * @param {Gio.Cancellable} cancellable Cancels every run.
     * @returns {Promise<?Model>} The model, or null when a run was cancelled.
     */
    async _readModel(cancellable) {
        const monmux = this._monmux;
        if (monmux === null)
            return null;

        if (locate() === null)
            return buildModel({version: null, info: null, catalog: null});

        // A cancelled run is dropped here, and never handed to the model: there
        // a null version means that monmux is not installed.
        const version = await monmux.version(cancellable);
        if (version === null)
            return null;

        // The model decides whether it reads anything past the version, and
        // `info` runs the backend, so neither report is asked for when it
        // would not be read.
        if (!needsReports(version))
            return buildModel({version, info: null, catalog: null});

        const [info, catalog] = await Promise.all([
            monmux.info({}, cancellable),
            monmux.catalogList(cancellable),
        ]);
        if (info === null || catalog === null)
            return null;

        return buildModel({version, info, catalog});
    }

    /**
     * Read the serials a click can be pinned with, when the user has asked for
     * that and monmux would otherwise refuse to pick between the displays.
     *
     * @param {Model} model The model just read, from a redacted report.
     * @param {Gio.Cancellable} cancellable Cancels the run.
     * @returns {Promise<?Serials>} The serials, none when none were asked for,
     *   or null when the run was cancelled.
     */
    async _readSerials(model, cancellable) {
        const monmux = this._monmux;
        const settings = this._settings;

        // Off by default, and while it is off `--show-serial` is never passed.
        if (monmux === null || settings === null || !settings.get_boolean(SERIAL_TARGETING_KEY))
            return noSerials();

        if (!model.displays.some(display => display.needsSerial))
            return noSerials();

        let result;
        try {
            result = await monmux.info({showSerial: true}, cancellable);
        } catch {
            // Not left to _refresh, which shows what went wrong: nothing about
            // this run is shown except that it failed.
            return unreadable();
        }

        return result === null ? null : readSerials(result, model.displays);
    }

    /**
     * Run what a shortcut slot names.
     *
     * The slot's input is read now rather than when the shortcut was bound, so
     * that changing it needs no re-enable. A slot that names no input starts
     * nothing and says so; one that does takes the same path as a click.
     *
     * @param {Slot} slot The slot whose shortcut was pressed.
     * @returns {void}
     */
    _pressSlot(slot) {
        const settings = this._settings;
        const notifier = this._notifier;
        if (settings === null || notifier === null)
            return;

        const target = slotTarget(settings.get_string(slot.inputKey));
        if (target.kind !== SlotTargetKind.INPUT || target.input === null) {
            notifier.notifySlot(slot, target);
            return;
        }

        this._switch(target.input, null);
    }

    /**
     * Ask monmux to switch an input, and tell the user what it answered.
     *
     * The one switch path. A click in the menu and a shortcut both end here, so
     * both honour the dry-run setting, both are ignored while another switch
     * runs, and both are told the same things.
     *
     * @param {string} input The input's name, as monmux spells it.
     * @param {?DisplayModel} display The display a click was made under, which
     *   serial targeting can pin; null for a shortcut, which names an input and
     *   no display, and so is never pinned.
     * @returns {Promise<void>}
     */
    async _switch(input, display) {
        const cancellables = this._cancellables;
        const monmux = this._monmux;
        const notifier = this._notifier;
        const settings = this._settings;
        if (cancellables === null || monmux === null || notifier === null || settings === null)
            return;

        // The indicator already makes the inputs insensitive while a switch
        // runs. This is the belt to that, and the only guard a shortcut has: a
        // second click or press never starts a second process.
        if (this._switchDone !== null)
            return;

        const generation = this._generation;
        const cancellable = new Gio.Cancellable();
        cancellables.add(cancellable);

        /** @type {() => void} */
        let finished = () => {};
        let interrupted = false;

        try {
            this._switchDone = new Promise(resolve => {
                finished = resolve;
            });

            // The usual click lands while the refresh its menu-open started is
            // still reading. That read would overlap this write, so it is
            // cancelled here and run again once the switch is over.
            interrupted = this._refreshCancellable !== null;
            this._refreshCancellable?.cancel();

            this._indicator?.setSwitching(true);

            // Pinned only for a click, while serial targeting is on and monmux
            // would refuse to pick without it; otherwise, and whenever there is
            // no serial for this display, the switch goes unpinned and monmux
            // decides.
            const serial = display === null
                ? ''
                : serialFor(display, this._serials, settings.get_boolean(SERIAL_TARGETING_KEY));
            const dryRun = settings.get_boolean(DRY_RUN_KEY);
            const result = await monmux.switchInput(input, {dryRun, serial}, cancellable);

            if (result !== null && generation === this._generation)
                notifier.notify(result, {fromMenu: display !== null});
        } catch (error) {
            if (generation === this._generation)
                notifier.notifyError(error);
        } finally {
            // First, so that nothing below can leave a waiting refresh waiting
            // forever. Its continuation runs after this block, not inside it.
            finished();
            cancellables.delete(cancellable);

            if (generation === this._generation) {
                this._switchDone = null;
                this._indicator?.setSwitching(false);

                if (interrupted)
                    this._refresh();
            }
        }
    }

    /**
     * @param {number} generation The generation an operation started in.
     * @param {Gio.Cancellable} cancellable The operation's cancellable.
     * @returns {boolean} Whether its result may still be shown.
     */
    _isCurrent(generation, cancellable) {
        return generation === this._generation && !cancellable.is_cancelled();
    }
}
