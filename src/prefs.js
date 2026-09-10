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
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const REPOSITORY_URL = 'https://github.com/leinardi/gnome-shell-extension-monmux';

/**
 * The preferences window.
 *
 * This runs in a separate GJS process from the Shell, with GTK available and
 * St and Clutter absent. Phase 2 adds the Diagnostics page (`monmux doctor`)
 * and the per-display keyboard shortcuts here.
 */
export default class MonmuxPreferences extends ExtensionPreferences {
    /**
     * @param {Adw.PreferencesWindow} window The window to fill.
     * @returns {Promise<void>} Resolved once the pages are added.
     */
    fillPreferencesWindow(window) {
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
        window.add(page);

        // The Shell awaits this, and there is nothing asynchronous to do here.
        // `async` with no `await` in it is an ESLint error (`require-await`),
        // so the promise is returned explicitly instead.
        return Promise.resolve();
    }
}
