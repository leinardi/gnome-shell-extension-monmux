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
 * What the menu and the notifications both need, and neither owns.
 */

import Gio from 'gi://Gio';

/**
 * How much of monmux's raw output one menu line or one notification shows.
 *
 * Raw output reaches the user only when monmux answered outside its contract or
 * failed, and then it can be anything up to a whole JSON document. The start is
 * what identifies the problem; the rest would push the menu off the screen.
 */
const EXCERPT_LENGTH = 600;

/**
 * Open a documentation page in the user's browser.
 *
 * The callback touches nothing but the log, so a launch that completes after
 * disable() has nothing left to reach and needs no cancellable.
 *
 * @param {string} uri An absolute URL from links.js, and never anything else:
 *   what this opens is chosen by the user's desktop.
 * @returns {void}
 */
export function openLink(uri) {
    // A launch context from the Shell, so the browser is started with the
    // Shell's own startup notification and takes focus when it opens.
    const context = global.create_app_launch_context(0, -1);

    Gio.AppInfo.launch_default_for_uri_async(uri, context, null, (_source, result) => {
        try {
            Gio.AppInfo.launch_default_for_uri_finish(result);
        } catch (error) {
            console.warn(`Could not open ${uri}: ${error}`);
        }
    });
}

/**
 * Raw text, trimmed and cut to a length a menu line or a notification can hold.
 *
 * @param {string} text What monmux wrote.
 * @returns {string} The text, whole when it is short enough, or its start
 *   followed by an ellipsis.
 */
export function excerpt(text) {
    const trimmed = text.trim();
    if (trimmed.length <= EXCERPT_LENGTH)
        return trimmed;

    return `${trimmed.slice(0, EXCERPT_LENGTH)}…`;
}
