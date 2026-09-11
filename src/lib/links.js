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
 * Every documentation URL the extension can open, in one place and absolute.
 *
 * One place, because these are the only values ever handed to
 * Gio.AppInfo.launch_default_for_uri_async: what that call opens is chosen by
 * the user's desktop, so the set of things it can be asked to open should be a
 * list somebody can read in full, not a string built where it is needed.
 *
 * Absolute, because a relative link means nothing outside a rendered Markdown
 * page. The menu is not one.
 */

/** The base for every page in the monmux repository. */
export const MONMUX_DOCS = 'https://github.com/leinardi/monmux/blob/main/';

/** The base for every page in this extension's repository. */
export const EXTENSION_REPOSITORY = 'https://github.com/leinardi/gnome-shell-extension-monmux';

/**
 * The troubleshooting section for one refusal reason.
 *
 * `docs/troubleshooting.md` has one `###` heading per reason, written as the
 * reason in backticks, and GitHub's slug for such a heading is the bare reason
 * name. So the reason monmux reports is the fragment, with nothing to translate
 * or spell differently.
 *
 * Encoded all the same. The reason is whatever monmux reported, and a value from
 * a newer monmux is passed through rather than checked against a list, so it
 * has to stay a fragment of this one page whatever characters it carries.
 *
 * @param {string} reason The refusal reason, e.g. `input-not-enabled`.
 * @returns {string} The absolute URL of that section.
 */
export function troubleshooting(reason) {
    return `${troubleshootingGuide()}#${encodeURIComponent(reason)}`;
}

/**
 * The troubleshooting page as a whole, for a problem that is not one refusal.
 *
 * @returns {string} The absolute URL of the page.
 */
export function troubleshootingGuide() {
    return `${MONMUX_DOCS}docs/troubleshooting.md`;
}

/**
 * Where to report an answer from monmux that this extension could not read.
 *
 * This extension's tracker rather than monmux's: the extension is what could
 * not read the answer, and whoever triages the report can move it if monmux
 * turns out to be the one at fault.
 *
 * @returns {string} The absolute URL of a new bug report.
 */
export function reportProblem() {
    return `${EXTENSION_REPOSITORY}/issues/new?template=bug_report.md`;
}

/**
 * How to test an untested monitor and report what it did.
 *
 * @returns {string} The absolute URL of the page.
 */
export function addingAMonitor() {
    return `${MONMUX_DOCS}docs/adding-a-monitor.md`;
}

/**
 * How to install monmux, which this extension never does for the user.
 *
 * @returns {string} The absolute URL of the README's install section.
 */
export function installMonmux() {
    return `${MONMUX_DOCS}README.md#install`;
}

/**
 * This extension's own README.
 *
 * @returns {string} The absolute URL of the repository.
 */
export function extensionReadme() {
    return EXTENSION_REPOSITORY;
}
