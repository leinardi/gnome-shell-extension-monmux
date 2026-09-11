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

import {
    EXTENSION_REPOSITORY,
    MONMUX_DOCS,
    addingAMonitor,
    extensionReadme,
    installMonmux,
    reportProblem,
    troubleshooting,
    troubleshootingGuide,
} from '../src/lib/links.js';
import {assertEqual, describe, fail, it} from './harness.js';

/**
 * Every URL the module can produce.
 *
 * The list lives here rather than in links.js: it exists for these assertions
 * only, and an export that ships in the bundle just to be tested is one more
 * value that could reach the URI launcher.
 *
 * A helper that takes an argument is listed with a representative one — what is
 * asserted is the shape of the URL, which the fragment does not change.
 *
 * @returns {string[]} Each distinct URL, once.
 */
function allLinks() {
    return [
        troubleshooting('input-not-enabled'),
        troubleshootingGuide(),
        addingAMonitor(),
        installMonmux(),
        extensionReadme(),
        reportProblem(),
    ];
}

/**
 * Assert that a value is a URL safe to hand to the desktop's URI handler.
 *
 * @param {string} url The value under test.
 * @param {string} label Names it in a failure.
 * @returns {void}
 */
function assertHttpsUrl(url, label) {
    if (typeof url !== 'string')
        fail(`${label}: expected a string, got ${typeof url}`);

    let parsed;
    try {
        parsed = GLib.Uri.parse(url, GLib.UriFlags.NONE);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        fail(`${label}: ${url} does not parse as a URI: ${detail}`);

        return;
    }

    assertEqual(parsed.get_scheme(), 'https', `${label} scheme`);

    const host = parsed.get_host();
    if (host === null || host === '')
        fail(`${label}: ${url} has no host`);
}

describe('links', () => {
    it('produces an absolute https URL with a host for every link', () => {
        for (const url of allLinks())
            assertHttpsUrl(url, url);
    });

    it('names the troubleshooting section after the bare reason', () => {
        assertEqual(
            troubleshooting('input-not-enabled'),
            `${MONMUX_DOCS}docs/troubleshooting.md#input-not-enabled`);
    });

    it('keeps every reason on the same page, differing only in the fragment', () => {
        const first = troubleshooting('multiple-candidates');
        const second = troubleshooting('serial-mismatch');

        assertEqual(first.split('#')[0], second.split('#')[0], 'page');
        assertHttpsUrl(first, 'multiple-candidates');
        assertHttpsUrl(second, 'serial-mismatch');
    });

    it('points the install link at the monmux README, not at this repository', () => {
        const install = installMonmux();

        assertEqual(install.startsWith(MONMUX_DOCS), true, 'install is a monmux page');
        assertEqual(install.endsWith('#install'), true, 'install has the anchor');
    });

    it('points the monitor call to action at the adding-a-monitor page', () => {
        assertEqual(addingAMonitor(), `${MONMUX_DOCS}docs/adding-a-monitor.md`);
    });

    it("points this extension's own link at this extension", () => {
        assertEqual(extensionReadme().includes('gnome-shell-extension-monmux'), true);
    });

    it('puts every reason section on the troubleshooting page', () => {
        assertEqual(troubleshooting('no-displays').split('#')[0], troubleshootingGuide());
    });

    it('keeps a reason with unexpected characters inside the fragment', () => {
        // A reason from a newer monmux is passed through unchecked. Whatever it
        // carries, it must not add a second fragment or a query to the URL.
        const url = troubleshooting('a b#c?d/e');

        assertEqual(url, `${troubleshootingGuide()}#a%20b%23c%3Fd%2Fe`);
        assertHttpsUrl(url, 'encoded reason');
    });

    it('sends a problem report to this extension, not to monmux', () => {
        assertEqual(reportProblem().startsWith(`${EXTENSION_REPOSITORY}/issues/`), true);
    });

    it('never produces a relative link', () => {
        // A relative link means something only inside a rendered Markdown page,
        // and the menu is not one: launch_default_for_uri_async would be handed
        // a path with no scheme.
        for (const url of allLinks())
            assertEqual(url.startsWith('https://'), true, url);
    });
});
