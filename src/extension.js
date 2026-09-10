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

import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const MonmuxIndicator = GObject.registerClass(
class MonmuxIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'monmux');

        this.add_child(new St.Icon({
            icon_name: 'video-display-symbolic',
            style_class: 'system-status-icon',
        }));

        // Phase 2 replaces this with one section per display. Until then the
        // menu says what it is rather than opening empty, which reads as a
        // broken extension.
        const item = new PopupMenu.PopupMenuItem(_('monmux: not configured yet'), {
            reactive: false,
        });

        // PanelMenu.Button.menu is typed as PopupMenu | PopupDummyMenu, and the
        // dummy is what you get only when the button was constructed with
        // dontCreateMenu. This one was not, so it is a real PopupMenu.
        const menu = /** @type {PopupMenu.PopupMenu} */ (this.menu);
        menu.addMenuItem(item);
    }
});

/**
 * The extension entry point.
 *
 * Nothing is constructed here: the Shell instantiates this class once at load
 * time and keeps it alive across enable/disable cycles, so anything built in a
 * constructor would outlive the disable() that is supposed to have destroyed
 * it.
 */
export default class MonmuxExtension extends Extension {
    enable() {
        this._indicator = new MonmuxIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
