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
import System from 'system';

// Nothing local is imported statically. A static import is evaluated before the
// first statement of this file, so anything imported that way would run before
// the guard below and make it a guard over nothing. That is true of the harness
// as much as of a test file: it has no side effects today, and "today" is not a
// property a safety boundary should depend on.
requireFakeMonmuxOnPath();

const {finish, settle} = await import('./harness.js');

await import('./exitCode.test.js');
await import('./links.test.js');
await import('./model.test.js');
await import('./monmux.test.js');
await import('./prefs.test.js');
await import('./reasons.test.js');
await import('./serials.test.js');
await import('./shortcuts.test.js');
await import('./version.test.js');

// Importing a test file only registers its tests; an asynchronous one is still
// running when its module finishes. Nothing may be reported before they land.
await settle();

finish();

/**
 * Refuse to run unless the `monmux` on PATH is this repository's fake.
 *
 * The npm `test` script prepends tests/bin, so this normally passes. It is here
 * for the run that does not go through it — an IDE runner, a hand-typed `gjs -m
 * tests/main.js`, a hook that lost the environment — because the failure it
 * prevents is a test suite quietly driving the real monmux against the
 * developer's own monitor. Refusing to start is the only safe answer; a warning
 * would be read after the write.
 *
 * @returns {void}
 */
function requireFakeMonmuxOnPath() {
    const testsDir = Gio.File.new_for_uri(import.meta.url).get_parent()?.get_path();
    if (!testsDir) {
        printerr('tests: cannot locate the tests directory');
        System.exit(1);
    }

    const expected = GLib.canonicalize_filename(`${testsDir}/bin/monmux`, null);
    const found = GLib.find_program_in_path('monmux');

    if (found === null) {
        printerr(`tests: no monmux on PATH; expected the fake at ${expected}`);
        printerr('tests: run `make ext-test`, or `npm run test`, which prepend tests/bin');
        System.exit(1);
    }

    const resolved = GLib.canonicalize_filename(found, null);
    if (resolved !== expected) {
        printerr(`tests: refusing to run: monmux on PATH is ${resolved}, not the fake at ${expected}`);
        printerr('tests: the suite must never be able to reach a real monitor');
        System.exit(1);
    }
}
