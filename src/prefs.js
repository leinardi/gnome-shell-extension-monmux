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

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {EXTENSION_REPOSITORY} from './lib/links.js';
import {Monmux, ResultKind, locate, readOnly, spawn} from './lib/monmux.js';
import {Reasons} from './lib/reasons.js';
import {SLOTS, catalogInputNames, inputChoices} from './lib/shortcuts.js';
import {VersionState, checkVersion} from './lib/version.js';

/** @typedef {import('./lib/monmux.js').Result} Result */
/** @typedef {import('./lib/monmux.js').RunnerResult} RunnerResult */
/** @typedef {import('./lib/shortcuts.js').Slot} Slot */

/** How much of what monmux wrote the version row shows, in characters. */
const RAW_LIMIT = 600;

/**
 * What every page is built with.
 *
 * @typedef {object} Context
 * @property {Adw.PreferencesWindow} window The window being filled.
 * @property {Gio.Settings} settings The extension's settings.
 * @property {Monmux} monmux A client that can only read.
 * @property {Reasons} reasons Turns codes into the words the window shows.
 * @property {Gio.Cancellable} cancellable Cancelled when the window closes.
 * @property {(id: number) => void} watch Registers a settings handler, which
 *   is disconnected when the window is destroyed.
 */

/**
 * A slot's row, and how to hand it the catalog once it has been read.
 *
 * @typedef {object} SlotRow
 * @property {Adw.ActionRow} row The row.
 * @property {(names: string[]) => void} offer Offers these input names.
 */

/**
 * The preferences window, in its own GJS process. It writes to no monitor: its
 * monmux can only read, and every run is cancelled when the window closes.
 */
export default class MonmuxPreferences extends ExtensionPreferences {
    /**
     * @param {Adw.PreferencesWindow} window The window to fill.
     * @returns {Promise<void>} Resolved once the pages are added.
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const cancellable = new Gio.Cancellable();

        /** @type {number[]} */
        const handlers = [];

        window.connect('close-request', () => {
            cancellable.cancel();

            return false;
        });

        window.connect('destroy', () => {
            cancellable.cancel();

            for (const id of handlers.splice(0))
                settings.disconnect(id);
        });

        /** @type {Context} */
        const context = {
            window,
            settings,
            // Read-only by construction, and it has to stay that way: the
            // preferences window must never trigger a switch. readOnly() rejects
            // `switch` and every command not known to only read, before a
            // process is started.
            monmux: new Monmux(readOnly(spawn)),
            reasons: new Reasons(_),
            cancellable,
            watch: id => handlers.push(id),
        };

        window.add(this._shortcutsPage(context));
        window.add(this._diagnosticsPage(context));
        window.add(this._aboutPage());

        // Not `async`: with nothing to await, ESLint's require-await rejects it.
        return Promise.resolve();
    }

    /**
     * @param {Context} context What the page is built with.
     * @returns {Adw.PreferencesPage} The page with serial targeting and the
     *   shortcut slots.
     */
    _shortcutsPage(context) {
        const {settings, monmux, reasons, cancellable} = context;

        const page = new Adw.PreferencesPage({
            title: _('Shortcuts'),
            icon_name: 'input-keyboard-symbolic',
        });

        const monitors = new Adw.PreferencesGroup({
            title: _('Monitors'),
        });

        // Adw.SwitchRow is libadwaita 1.4, which GNOME 45 shipped, so every
        // supported Shell has it.
        const serialTargeting = new Adw.SwitchRow({
            title: _('Serial targeting'),
            subtitle: _('When more than one supported monitor is attached, read their serial numbers so that a click can target one. Serials are read from monmux and are never shown or logged.'),
        });

        // Off by default, and this row only sets the key: serials are read by
        // the extension, and only while the key is on (invariant 5).
        settings.bind('serial-targeting', serialTargeting, 'active', Gio.SettingsBindFlags.DEFAULT);

        monitors.add(serialTargeting);
        page.add(monitors);

        const group = new Adw.PreferencesGroup({
            title: _('Keyboard shortcuts'),
            description: _('Each shortcut switches to one input, the way a click in the menu does, and follows Dry run. It names an input, not a display: which display that is stays monmux\'s decision, and a shortcut is never pinned to a serial number.'),
        });

        const unread = new Adw.ActionRow({
            title: _('The catalog could not be read'),
            subtitle: _('Only the input each shortcut already has is offered. The Diagnostics page shows what monmux reports.'),
            visible: false,
        });
        group.add(unread);

        const rows = SLOTS.map(slot => this._slotRow(context, slot));
        for (const {row} of rows)
            group.add(row);

        page.add(group);

        if (locate() === null) {
            unread.set_title(reasons.text('missing'));
            unread.set_visible(true);

            return page;
        }

        monmux.catalogList(cancellable).then(result => {
            if (cancellable.is_cancelled() || result === null)
                return;

            const names = catalogInputNames(result);
            for (const {offer} of rows)
                offer(names);

            unread.set_visible(result.kind !== ResultKind.OK);
        }).catch(() => {
            if (!cancellable.is_cancelled())
                unread.set_visible(true);
        });

        return page;
    }

    /**
     * One slot: the input it switches to, and its shortcut.
     *
     * @param {Context} context What the page is built with.
     * @param {Slot} slot The slot.
     * @returns {SlotRow} Its row.
     */
    _slotRow(context, slot) {
        const {settings, watch} = context;

        const row = new Adw.ActionRow({
            // Translators: {slot} is the number of a keyboard shortcut slot, such as 1.
            title: _('Shortcut {slot}').replace('{slot}', String(slot.number)),
        });

        /** @type {string[]} */
        let names = [];
        /** @type {string[]} */
        let choices = [];
        let rendering = false;

        const input = new Gtk.DropDown({
            valign: Gtk.Align.CENTER,
            tooltip_text: _('The input this shortcut switches to'),
        });

        /**
         * Show the slot's input in the dropdown.
         *
         * The model is replaced only when what is offered has to change: when
         * the catalog arrives, or when the key was set elsewhere to a value the
         * dropdown does not list. A pick in the dropdown reaches here through
         * the settings key while GTK is still handling that pick, and replacing
         * the model under it then takes the list away mid-selection and brings
         * the whole window down; a pick only ever needs the selection synced.
         *
         * @param {boolean} rebuild Whether to offer the choices afresh.
         * @returns {void}
         */
        const renderInput = rebuild => {
            const current = settings.get_string(slot.inputKey);

            rendering = true;
            if (rebuild || !choices.includes(current)) {
                choices = inputChoices(names, current);
                input.set_model(Gtk.StringList.new(choices.map(value => value === '' ? _('No input') : value)));
            }

            const index = choices.indexOf(current);
            if (input.get_selected() !== index)
                input.set_selected(index);
            rendering = false;
        };

        input.connect('notify::selected', () => {
            if (rendering)
                return;

            const value = choices[input.get_selected()];
            if (value !== undefined && value !== settings.get_string(slot.inputKey))
                settings.set_string(slot.inputKey, value);
        });

        const label = new Gtk.ShortcutLabel({
            disabled_text: _('No shortcut'),
            valign: Gtk.Align.CENTER,
        });

        const change = new Gtk.Button({
            child: label,
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Set the shortcut'),
        });
        change.connect('clicked', () => this._captureShortcut(context, slot));

        const clear = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Remove the shortcut'),
            css_classes: ['flat'],
        });
        clear.connect('clicked', () => settings.set_strv(slot.shortcutKey, []));

        const renderShortcut = () => {
            const accelerator = settings.get_strv(slot.shortcutKey)[0] ?? '';

            label.set_accelerator(accelerator);
            clear.set_sensitive(accelerator !== '');
        };

        watch(settings.connect(`changed::${slot.inputKey}`, () => renderInput(false)));
        watch(settings.connect(`changed::${slot.shortcutKey}`, renderShortcut));

        row.add_suffix(input);
        row.add_suffix(change);
        row.add_suffix(clear);

        renderInput(true);
        renderShortcut();

        return {
            row,
            offer: offered => {
                names = offered;
                renderInput(true);
            },
        };
    }

    /**
     * Ask for a slot's new shortcut, and store it.
     *
     * @param {Context} context What the page is built with.
     * @param {Slot} slot The slot.
     * @returns {void}
     */
    _captureShortcut(context, slot) {
        const {settings, window} = context;

        const dialog = new Adw.Window({
            modal: true,
            transient_for: window,
            destroy_with_parent: true,
            resizable: false,
            default_width: 440,
            title: _('Shortcut {slot}').replace('{slot}', String(slot.number)),
        });

        const status = new Adw.StatusPage({
            icon_name: 'input-keyboard-symbolic',
            title: _('Press the new shortcut'),
            description: _('It needs Ctrl, Alt or Super. Press Escape to cancel, or Backspace to remove the shortcut. If GNOME asks whether this window may capture shortcuts, allow it: otherwise pressing a combination that is already set runs that shortcut, which switches an input, instead of capturing it.'),
        });

        // Adw.ToolbarView is libadwaita 1.4, like Adw.SwitchRow above.
        const view = new Adw.ToolbarView({content: status});
        view.add_top_bar(new Adw.HeaderBar());
        dialog.set_content(view);

        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_controller, keyval, keycode, state) => {
            const modifiers = state & Gtk.accelerator_get_default_mod_mask();

            if (modifiers === 0 && keyval === Gdk.KEY_Escape) {
                dialog.close();

                return Gdk.EVENT_STOP;
            }

            if (modifiers === 0 && keyval === Gdk.KEY_BackSpace) {
                settings.set_strv(slot.shortcutKey, []);
                dialog.close();

                return Gdk.EVENT_STOP;
            }

            // Shift alone is not enough: a shortcut on a plain or shifted key
            // would take that key away from every application. A press of a
            // modifier on its own is not an accelerator either, and the dialog
            // keeps waiting for the rest of it.
            if ((modifiers & ~Gdk.ModifierType.SHIFT_MASK) === 0 || !Gtk.accelerator_valid(keyval, modifiers))
                return Gdk.EVENT_STOP;

            settings.set_strv(slot.shortcutKey, [
                Gtk.accelerator_name_with_keycode(null, Gdk.keyval_to_lower(keyval), keycode, modifiers),
            ]);
            dialog.close();

            return Gdk.EVENT_STOP;
        });

        dialog.add_controller(keys);

        // The Shell takes a combination that is already bound - this slot's own,
        // or another slot's - before any window sees it, and runs it: a switch,
        // made from the preferences window by somebody who only meant to set a
        // key. While the dialog is open, system shortcuts are inhibited so those
        // keys reach it instead, and they are restored when it closes.
        //
        // The request is made once the dialog is active, not straight after
        // present(). On X11 inhibiting is a keyboard grab, which GDK silently
        // does not take while the window is not yet mapped and focused; on
        // Wayland it is a protocol request, and the Shell may ask the user once
        // whether to allow it - the dialog says what refusing means. It is made
        // again if the dialog regains focus without it. A destroyed surface ends
        // the inhibition with it, so a dialog destroyed with its parent needs
        // nothing more.
        /**
         * @returns {?Gdk.Toplevel} The dialog's surface, once it has one.
         */
        const toplevel = () => {
            /** @type {unknown} */
            const surface = dialog.get_surface();

            return /** @type {?Gdk.Toplevel} */ (surface);
        };

        const inhibit = () => {
            const surface = toplevel();
            if (dialog.is_active && surface !== null && !surface.shortcuts_inhibited)
                surface.inhibit_system_shortcuts(null);
        };

        dialog.connect('notify::is-active', inhibit);
        dialog.connect('close-request', () => {
            toplevel()?.restore_system_shortcuts();

            return false;
        });

        dialog.present();
        inhibit();
    }

    /**
     * @param {Context} context What the page is built with.
     * @returns {Adw.PreferencesPage} The page that shows what monmux reports
     *   about itself and the system.
     */
    _diagnosticsPage(context) {
        const {monmux, reasons, cancellable} = context;
        const path = locate();

        const page = new Adw.PreferencesPage({
            title: _('Diagnostics'),
            icon_name: 'utilities-terminal-symbolic',
        });

        const tool = new Adw.PreferencesGroup({
            title: _('monmux'),
        });

        // Not markup: a path, a version string or what monmux wrote can hold
        // an ampersand or an angle bracket, which markup would reject.
        const location = new Adw.ActionRow({
            title: _('Location'),
            subtitle: path ?? reasons.text('missing'),
            subtitle_selectable: true,
            use_markup: false,
        });

        const version = new Adw.ActionRow({
            title: _('Version'),
            subtitle: path === null ? '' : _('Reading…'),
            subtitle_selectable: true,
            use_markup: false,
            visible: path !== null,
        });

        tool.add(location);
        tool.add(version);
        page.add(tool);

        const doctor = new Adw.PreferencesGroup({
            title: _('Doctor'),
            description: _('monmux doctor checks the backend tool and every attached display, one line per check. It only reads: nothing is written to any monitor.'),
        });

        const run = new Gtk.Button({
            label: _('Run monmux doctor'),
            valign: Gtk.Align.CENTER,
            sensitive: path !== null,
            css_classes: ['suggested-action'],
        });

        const copy = new Gtk.Button({
            label: _('Copy'),
            valign: Gtk.Align.CENTER,
            sensitive: false,
        });

        const buttons = new Gtk.Box({spacing: 6});
        buttons.append(copy);
        buttons.append(run);
        doctor.set_header_suffix(buttons);

        const buffer = new Gtk.TextBuffer();
        const output = new Gtk.TextView({
            buffer,
            editable: false,
            cursor_visible: false,
            monospace: true,
            wrap_mode: Gtk.WrapMode.NONE,
            top_margin: 12,
            bottom_margin: 12,
            left_margin: 12,
            right_margin: 12,
        });

        const scroller = new Gtk.ScrolledWindow({
            child: output,
            min_content_height: 240,
            css_classes: ['card'],
        });

        doctor.add(scroller);
        page.add(doctor);

        run.connect('clicked', () => {
            run.set_sensitive(false);
            copy.set_sensitive(false);
            buffer.set_text(_('Running monmux doctor…'), -1);

            monmux.doctor(cancellable).then(answer => {
                if (cancellable.is_cancelled() || answer === null)
                    return;

                buffer.set_text(doctorText(answer), -1);
                copy.set_sensitive(true);
                run.set_sensitive(true);
            }).catch(error => {
                if (cancellable.is_cancelled())
                    return;

                buffer.set_text(`${reasons.label('run-failed')}\n${String(error)}`, -1);
                copy.set_sensitive(true);
                run.set_sensitive(true);
            });
        });

        copy.connect('clicked', () => {
            const text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false);
            const bytes = new GLib.Bytes(new TextEncoder().encode(text));

            copy.get_clipboard().set_content(Gdk.ContentProvider.new_for_bytes('text/plain;charset=utf-8', bytes));
        });

        if (path !== null) {
            monmux.version(cancellable).then(result => {
                if (cancellable.is_cancelled() || result === null)
                    return;

                version.set_subtitle(versionText(result, reasons));
            }).catch(error => {
                if (!cancellable.is_cancelled())
                    version.set_subtitle(`${reasons.text(VersionState.UNKNOWN)}\n${cut(String(error))}`);
            });
        }

        return page;
    }

    /**
     * @returns {Adw.PreferencesPage} The page about the extension.
     */
    _aboutPage() {
        const page = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: _('monmux'),
            description: _('Inputs are switched by the monmux command-line tool, which is installed separately and decides on its own what may be written to which monitor.'),
        });

        const link = new Gtk.LinkButton({
            uri: EXTENSION_REPOSITORY,
            label: _('Open'),
            valign: Gtk.Align.CENTER,
        });

        const row = new Adw.ActionRow({
            title: _('Project page'),
            subtitle: EXTENSION_REPOSITORY,
            activatable_widget: link,
        });
        row.add_suffix(link);

        group.add(row);
        page.add(group);

        return page;
    }
}

/**
 * What the doctor view shows: what monmux wrote, as it wrote it, and how it
 * exited when that was not cleanly.
 *
 * @param {RunnerResult} answer What doctor wrote, and its exit status.
 * @returns {string} The text.
 */
function doctorText(answer) {
    const parts = [answer.stdout.trimEnd(), answer.stderr.trimEnd()];

    if (Number.isNaN(answer.exitCode)) {
        parts.push(_('monmux doctor was stopped before it finished.'));
    } else if (answer.exitCode !== 0) {
        // Translators: {status} is a process exit status, such as 1.
        parts.push(_('monmux doctor exited with status {status}.').replace('{status}', String(answer.exitCode)));
    }

    return parts.filter(part => part !== '').join('\n\n');
}

/**
 * What the version row says.
 *
 * A monmux that could not be identified is shown with what it wrote, cut to a
 * length a row can hold, as the menu keeps that text for an unknown version:
 * this page exists to diagnose exactly that, and "could not be identified" on
 * its own tells nobody why. So is one too old to know `--json`, whose only
 * answer is cobra's complaint about the flag. A version that parsed and is
 * merely too old needs nothing past the version and the sentence: its raw text
 * would be the whole document the version came from.
 *
 * @param {Result} result The result of `version --json`.
 * @param {Reasons} reasons Turns codes into words.
 * @returns {string} The version monmux reported, and why it cannot be used
 *   when it cannot.
 */
function versionText(result, reasons) {
    const reported = typeof result.doc?.version === 'string' ? result.doc.version : null;
    const state = checkVersion(result);

    if (state === VersionState.OK && reported !== null)
        return reported;

    const unidentified = state !== VersionState.TOO_OLD || result.kind === ResultKind.UNSUPPORTED_FLAG;
    const raw = unidentified
        ? [result.stderr, result.stdout]
            .map(text => typeof text === 'string' ? text.trim() : '')
            .find(text => text !== '') ?? null
        : null;

    return [
        reported,
        reasons.text(state === VersionState.OK ? VersionState.UNKNOWN : state),
        raw === null ? null : cut(raw),
    ].filter(part => part !== null).join('\n');
}

/**
 * @param {string} text Raw text.
 * @returns {string} The text, cut to {@link RAW_LIMIT} characters.
 */
function cut(text) {
    return text.length > RAW_LIMIT ? `${text.slice(0, RAW_LIMIT)}…` : text;
}
