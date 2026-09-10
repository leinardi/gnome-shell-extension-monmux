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
 * metadata.json is the one file whose mistakes are invisible until the Shell
 * refuses to load the extension, or until extensions.gnome.org rejects the
 * upload. Every field here is one somebody has got wrong in a released
 * extension: a gettext domain that no .mo file matches, a settings-schema that
 * names a schema the zip does not carry, a `version` key fighting with the one
 * e.g.o assigns, a shell-version list that quietly dropped a release.
 *
 * Node rather than gjs: this runs as a pre-commit hook and in CI, where the
 * node toolchain is already installed for ESLint and tsc.
 */

import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_UUID = 'monmux@leinardi.github.io';
const EXPECTED_SCHEMA_ID = 'org.gnome.shell.extensions.monmux';
const SUPPORTED_SHELL_VERSIONS = ['46', '47', '48', '49', '50'];
const ALLOWED_KEYS = [
    'uuid',
    'name',
    'description',
    'shell-version',
    'url',
    'settings-schema',
    'gettext-domain',
    'session-modes',
];

/** @type {string[]} */
const problems = [];

/**
 * @param {boolean} condition
 * @param {string} message
 */
function require_(condition, message) {
    if (!condition)
        problems.push(message);
}

const metadataPath = join(ROOT, 'src', 'metadata.json');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

for (const key of Object.keys(metadata))
    require_(ALLOWED_KEYS.includes(key), `unknown key "${key}"; add it to ALLOWED_KEYS if it is deliberate`);

require_(metadata.uuid === EXPECTED_UUID, `uuid must be "${EXPECTED_UUID}", got ${JSON.stringify(metadata.uuid)}`);
require_(typeof metadata.name === 'string' && metadata.name.length > 0, 'name must be a non-empty string');
require_(
    typeof metadata.description === 'string' && metadata.description.length > 0,
    'description must be a non-empty string');

// extensions.gnome.org assigns the version at upload time and rejects a
// metadata.json that sets one itself.
require_(!('version' in metadata), 'metadata.json must not carry a "version" key: e.g.o sets it');
require_(!('version-name' in metadata), 'metadata.json must not carry a "version-name" key: e.g.o sets it');

require_(
    Array.isArray(metadata['shell-version']) &&
    JSON.stringify(metadata['shell-version']) === JSON.stringify(SUPPORTED_SHELL_VERSIONS),
    `shell-version must be ${JSON.stringify(SUPPORTED_SHELL_VERSIONS)}, got ${JSON.stringify(metadata['shell-version'])}`);

require_(
    metadata['settings-schema'] === EXPECTED_SCHEMA_ID,
    `settings-schema must be "${EXPECTED_SCHEMA_ID}", got ${JSON.stringify(metadata['settings-schema'])}`);

const schemaFile = join(ROOT, 'src', 'schemas', `${EXPECTED_SCHEMA_ID}.gschema.xml`);
require_(existsSync(schemaFile), `settings-schema names ${EXPECTED_SCHEMA_ID} but src/schemas/${EXPECTED_SCHEMA_ID}.gschema.xml is missing`);
if (existsSync(schemaFile)) {
    const schema = readFileSync(schemaFile, 'utf8');
    require_(
        schema.includes(`id="${EXPECTED_SCHEMA_ID}"`),
        `${EXPECTED_SCHEMA_ID}.gschema.xml does not declare id="${EXPECTED_SCHEMA_ID}"`);
}

// The domain has to match what `make ext-pot` writes and what the .mo files are
// installed as, and package.json's name is what both derive from.
require_(
    metadata['gettext-domain'] === pkg.name,
    `gettext-domain must match the package name "${pkg.name}", got ${JSON.stringify(metadata['gettext-domain'])}`);

const repositoryUrl = String(pkg.repository?.url ?? '')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
require_(
    metadata.url === repositoryUrl,
    `url must match package.json's repository (${repositoryUrl}), got ${JSON.stringify(metadata.url)}`);

if (problems.length > 0) {
    console.error(`src/metadata.json: ${problems.length} problem(s)`);
    for (const problem of problems)
        console.error(`  - ${problem}`);

    process.exit(1);
}
