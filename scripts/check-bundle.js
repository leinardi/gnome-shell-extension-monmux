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
 * What ends up in the zip is decided by `gnome-extensions pack`'s own rules —
 * metadata.json, extension.js, prefs.js, stylesheet.css, schemas/, plus whatever
 * --extra-source names — and those rules are easy to fall out of. A new
 * directory under src/ that nobody passed as --extra-source is simply absent
 * from the bundle, and the extension then fails at load time on somebody else's
 * machine with an import error nothing here reproduced.
 *
 * So this compares the bundle against src/ rather than against a hand-written
 * list: everything shippable under src/ has to be in the zip, and nothing that
 * does not belong may be.
 *
 * `unzip -Z1` rather than a zip library: it is already needed to inspect a
 * bundle by hand, and a dependency for reading eight file names would be a
 * dependency in the packaging path.
 */

import {execFileSync} from 'node:child_process';
import {readdirSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join, relative, sep} from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

// Compiled by whoever installs the bundle - `gnome-extensions install` and
// extensions.gnome.org both run glib-compile-schemas over the extracted tree -
// so it is a local build product here and must never be shipped.
const NEVER_SHIP = ['schemas/gschemas.compiled'];

const zipPath = process.argv[2];
if (!zipPath) {
    console.error('usage: check-bundle.js <path to .shell-extension.zip>');
    process.exit(2);
}

if (!existsSync(zipPath)) {
    console.error(`check-bundle: ${zipPath} does not exist; run \`make ext-pack\` first`);
    process.exit(2);
}

/**
 * @param {string} dir
 * @returns {string[]} Every file under dir, as a path relative to src/, with "/" separators.
 */
function filesUnder(dir) {
    /** @type {string[]} */
    const found = [];
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const full = join(dir, entry.name);
        if (entry.isDirectory())
            found.push(...filesUnder(full));
        else
            found.push(relative(SRC, full).split(sep).join('/'));
    }

    return found;
}

const inZip = new Set(
    execFileSync('unzip', ['-Z1', zipPath], {encoding: 'utf8'})
        .split('\n')
        .map(line => line.trim())
        // Directory entries carry a trailing slash and say nothing about content.
        .filter(line => line.length > 0 && !line.endsWith('/')));

const expected = filesUnder(SRC).filter(file => !NEVER_SHIP.includes(file));

/** @type {string[]} */
const problems = [];

for (const file of expected) {
    if (!inZip.has(file)) {
        problems.push(
            `${file} is under src/ but not in the bundle; ` +
            'a new directory needs its own --extra-source in .mk/extension.mk');
    }
}

for (const file of inZip) {
    if (NEVER_SHIP.includes(file))
        problems.push(`${file} must not be shipped: whoever installs the bundle compiles it`);
    else if (!expected.includes(file) && !file.startsWith('locale/'))
        problems.push(`${file} is in the bundle but has no counterpart under src/`);
}

// Named explicitly as well as derived, because these four are what makes the zip
// an extension rather than an archive, and a src/ that lost one would otherwise
// agree with a bundle that lost it too.
for (const required of ['metadata.json', 'extension.js', 'prefs.js', 'schemas/org.gnome.shell.extensions.monmux.gschema.xml']) {
    if (!inZip.has(required))
        problems.push(`${required} is missing from the bundle`);
}

if (problems.length > 0) {
    console.error(`${zipPath}: ${problems.length} problem(s)`);
    for (const problem of problems)
        console.error(`  - ${problem}`);

    process.exit(1);
}

console.log(`${zipPath}: ${inZip.size} files, contents match src/`);
