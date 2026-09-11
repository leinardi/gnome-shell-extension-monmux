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
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const REPOSITORY_URL = 'https://github.com/leinardi/gnome-shell-extension-monmux';

/**
 * The preferences window.
 *
 * This runs in a separate GJS process from the Shell, with GTK available and
 * St and Clutter absent. Later phases add the Diagnostics page (`monmux doctor`)
 * and the keyboard shortcuts here.
 *
 * Nothing in this window runs monmux or writes to a monitor. It sets keys, and
 * the extension decides what they mean.
 */
export default class MonmuxPreferences extends ExtensionPreferences {
    /**
     * @param {Adw.PreferencesWindow} window The window to fill.
     * @returns {Promise<void>} Resolved once the pages are added.
     */
    fillPreferencesWindow(window) {
        window.add(this._generalPage());
        window.add(this._aboutPage());

        // The Shell awaits this, and there is nothing asynchronous to do here.
        // `async` with no `await` in it is an ESLint error (`require-await`),
        // so the promise is returned explicitly instead.
        return Promise.resolve();
    }

    /**
     * @returns {Adw.PreferencesPage} The page with the extension's settings.
     */
    _generalPage() {
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });

        const group = new Adw.PreferencesGroup({
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
        this.getSettings().bind('serial-targeting', serialTargeting, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        group.add(serialTargeting);
        page.add(group);

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
            uri: REPOSITORY_URL,
            label: _('Open'),
            valign: Gtk.Align.CENTER,
        });

        const row = new Adw.ActionRow({
            title: _('Project page'),
            subtitle: REPOSITORY_URL,
            activatable_widget: link,
        });
        row.add_suffix(link);

        group.add(row);
        page.add(group);

        return page;
    }
}
