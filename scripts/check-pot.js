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
 * The translation template is generated, and a generated file that is committed
 * drifts: somebody rewords a sentence in reasons.js, and the template - and
 * every translation merged from it - goes on offering the old one. So this
 * regenerates the template from src/ and fails when it differs from the
 * committed one, and it checks that every language po/LINGUAS lists has a .po
 * file that is well formed and carries every message of the template. A
 * message may still be untranslated there: that is a translation to finish,
 * not a template out of step.
 *
 * With --write it brings them up to date instead: the template is replaced
 * when its messages changed, and merged into every translation.
 *
 * Only the JavaScript is extracted. The schema's summaries and descriptions are
 * read by nobody but dconf-editor, and extracting them would make the template
 * depend on which ITS rules the machine has installed - glib ships them, and a
 * bare CI runner does not - so the same source would give two templates.
 *
 * The creation date is the one line allowed to differ: xgettext writes the
 * current time into it on every run.
 *
 * Node rather than gjs, like check-metadata.js: this runs in CI, where the node
 * toolchain is already installed.
 */

import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = 'gnome-shell-extension-monmux';
const PO_DIR = 'po';
const POT = `${PO_DIR}/${DOMAIN}.pot`;
const LINGUAS = `${PO_DIR}/LINGUAS`;
const WRITE = process.argv.includes('--write');

/**
 * @param {string} dir A directory, relative to the repository root.
 * @returns {string[]} Every .js file under it, relative to the root with "/"
 *   separators and sorted, so the template's references do not depend on the
 *   order a file system lists a directory in.
 */
function javascriptUnder(dir) {
    /** @type {string[]} */
    const found = [];
    for (const entry of readdirSync(join(ROOT, dir), {withFileTypes: true})) {
        const path = join(ROOT, dir, entry.name);
        if (entry.isDirectory())
            found.push(...javascriptUnder(relative(ROOT, path)));
        else if (entry.name.endsWith('.js'))
            found.push(relative(ROOT, path).split(sep).join('/'));
    }

    return found.sort();
}

/**
 * Run a gettext tool from the repository root.
 *
 * Both streams are kept whatever the exit status: msgfmt reports its
 * statistics on stderr when it succeeds, too.
 *
 * @param {string} program The tool.
 * @param {string[]} args Its arguments.
 * @returns {{ok: boolean, output: string}} Whether it exited 0, and what it
 *   wrote to stdout and stderr.
 */
function run(program, args) {
    const result = spawnSync(program, args, {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});

    if (result.error !== undefined) {
        if ('code' in result.error && result.error.code === 'ENOENT') {
            console.error(`check-pot: ${program} was not found; install gettext`);
            process.exit(2);
        }

        throw result.error;
    }

    return {ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()};
}

/**
 * Extract the template.
 *
 * @param {string} output Where to write it.
 * @returns {void}
 */
function extract(output) {
    const {ok, output: text} = run('xgettext', [
        '--from-code=UTF-8',
        '--language=JavaScript',
        '--add-comments=Translators:',
        '--keyword=_',
        `--package-name=${DOMAIN}`,
        '--copyright-holder=Roberto Leinardi',
        '--msgid-bugs-address=https://github.com/leinardi/gnome-shell-extension-monmux/issues',
        `--output=${output}`,
        ...javascriptUnder('src'),
    ]);

    if (!ok) {
        console.error(`check-pot: xgettext failed:\n${text}`);
        process.exit(1);
    }
}

/**
 * @param {string} path A template, relative to the repository root.
 * @returns {string} Its text without the line xgettext changes on every run.
 */
function comparable(path) {
    return readFileSync(join(ROOT, path), 'utf8')
        .split('\n')
        .filter(line => !line.startsWith('"POT-Creation-Date: '))
        .join('\n');
}

/**
 * @returns {string[]} The languages po/LINGUAS lists.
 */
function languages() {
    if (!existsSync(join(ROOT, LINGUAS)))
        return [];

    return readFileSync(join(ROOT, LINGUAS), 'utf8')
        .replace(/#.*$/gm, '')
        .split(/\s+/)
        .filter(language => language !== '');
}

const scratch = mkdtempSync(join(tmpdir(), 'check-pot-'));

/** @type {string[]} */
const problems = [];

try {
    const fresh = join(scratch, `${DOMAIN}.pot`);
    extract(fresh);

    const committed = existsSync(join(ROOT, POT));
    const current = committed && comparable(POT) === comparable(relative(ROOT, fresh));

    if (WRITE) {
        mkdirSync(join(ROOT, PO_DIR), {recursive: true});
        if (!current)
            copyFileSync(fresh, join(ROOT, POT));

        for (const language of languages()) {
            const po = `${PO_DIR}/${language}.po`;
            const merged = existsSync(join(ROOT, po))
                ? run('msgmerge', ['--quiet', '--update', '--backup=none', po, POT])
                : {ok: false, output: `${po} does not exist; create it with msginit`};

            if (!merged.ok)
                problems.push(merged.output);
        }
    } else {
        if (!committed)
            problems.push(`${POT} does not exist; run \`make ext-pot\``);
        else if (!current)
            problems.push(`${POT} does not match the strings in src/; run \`make ext-pot\` and commit the result`);

        const listed = languages();
        const present = existsSync(join(ROOT, PO_DIR))
            ? readdirSync(join(ROOT, PO_DIR)).filter(name => name.endsWith('.po')).map(name => name.slice(0, -3))
            : [];

        for (const language of present.filter(each => !listed.includes(each)))
            problems.push(`${PO_DIR}/${language}.po exists, but ${LINGUAS} does not list ${language}, so it is never packed`);

        for (const language of listed) {
            const po = `${PO_DIR}/${language}.po`;
            if (!present.includes(language)) {
                problems.push(`${LINGUAS} lists ${language}, but ${po} does not exist`);
                continue;
            }

            const checked = run('msgfmt', ['--check', '--statistics', '--output-file=/dev/null', po]);
            if (checked.ok)
                console.log(`${po}: ${checked.output.trim()}`);
            else
                problems.push(`${po} is not a valid translation:\n${checked.output}`);

            // Untranslated and fuzzy entries count as present: what is checked
            // is that the translation was merged with this template, not that
            // it is finished.
            if (committed && !run('msgcmp', ['--use-fuzzy', '--use-untranslated', po, POT]).ok)
                problems.push(`${po} lacks messages the template has; run \`make ext-pot\` and commit the result`);
        }
    }
} finally {
    rmSync(scratch, {recursive: true, force: true});
}

if (problems.length > 0) {
    console.error(`check-pot: ${problems.length} problem(s)`);
    for (const problem of problems)
        console.error(`  - ${problem}`);

    process.exit(1);
}

console.log(WRITE ? `${POT}: up to date` : `${POT}: matches the strings in src/`);
