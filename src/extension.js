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

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {buildModel, needsReports} from './lib/model.js';
import {Monmux, locate, spawn} from './lib/monmux.js';
import {Reasons} from './lib/reasons.js';
import {MonmuxIndicator} from './ui/indicator.js';
import {Notifier} from './ui/notify.js';

/** @typedef {import('./lib/model.js').DisplayModel} DisplayModel */
/** @typedef {import('./lib/model.js').InputModel} InputModel */
/** @typedef {import('./lib/model.js').Model} Model */

/**
 * How long monitor changes have to stop arriving before the displays are read
 * again, in milliseconds.
 */
const HOTPLUG_SETTLE_MS = 1000;

/** The settings key a switch reads to decide whether to execute anything. */
const DRY_RUN_KEY = 'dry-run';

/**
 * The extension entry point: the lifecycle, and when to read and when to write.
 *
 * What to show and what a result means are decided in src/lib and rendered in
 * src/ui. This file decides only when things run, and it holds three rules.
 *
 * Switches are serialised. While one runs, the inputs are insensitive and a
 * click on one is ignored, so no two monmux processes ever write at once.
 *
 * Reads never overlap a write, because a write may be changing the very display
 * list a read reports. A refresh started while a switch runs waits for it; a
 * switch started while a refresh runs cancels that refresh and runs it again
 * once the switch is over. A refresh also cancels the refresh before it, whose
 * answer would be out of date by the time it arrived.
 *
 * Nothing late reaches anything. Every operation registers its cancellable,
 * which disable() cancels, and captures the generation when it starts; a
 * completion whose generation is no longer current is dropped before it touches
 * a widget or the notification source, whether it outlived a disable() or a
 * whole disable and enable.
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

        this._refreshTimeoutId = 0;
        this._monitorsChangedId = 0;
        this._menuOpenId = 0;
    }

    enable() {
        this._generation++;

        const settings = this.getSettings();
        const reasons = new Reasons(message => this.gettext(message));
        const indicator = new MonmuxIndicator({
            extension: this,
            settings,
            reasons,
            onSwitch: (display, input) => this._switch(display, input),
        });

        this._settings = settings;
        this._monmux = new Monmux(spawn);
        this._notifier = new Notifier(reasons);
        this._cancellables = new Set();
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
    }

    disable() {
        this._generation++;

        for (const cancellable of this._cancellables ?? [])
            cancellable.cancel();

        this._cancellables?.clear();
        this._cancellables = null;
        this._refreshCancellable = null;
        this._switchDone = null;

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

            this._indicator?.showModel(model);
        } catch (error) {
            if (this._isCurrent(generation, cancellable))
                this._indicator?.showError(String(error));
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
     * Ask monmux to switch an input, and tell the user what it answered.
     *
     * @param {DisplayModel} _display The display the input was listed under.
     *   Unused until a click can be pinned to one display.
     * @param {InputModel} input The input that was clicked.
     * @returns {Promise<void>}
     */
    async _switch(_display, input) {
        const cancellables = this._cancellables;
        const monmux = this._monmux;
        const notifier = this._notifier;
        const settings = this._settings;
        if (cancellables === null || monmux === null || notifier === null || settings === null)
            return;

        // The indicator already makes the inputs insensitive while a switch
        // runs. This is the belt to that: a second click never starts a second
        // process.
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

            const dryRun = settings.get_boolean(DRY_RUN_KEY);
            const result = await monmux.switchInput(input.name, {dryRun}, cancellable);

            if (result !== null && generation === this._generation)
                notifier.notify(result);
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
