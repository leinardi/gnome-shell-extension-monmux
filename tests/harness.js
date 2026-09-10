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
 * A test harness in one file, with no dependency at all.
 *
 * Jasmine is the usual answer for GJS, but it arrives as a subproject or an npm
 * package and brings its own runner; what this repository tests is a handful of
 * pure modules under src/lib, and forty lines of `describe`/`it` cover that
 * without adding a thing that has to be kept working across five Shell
 * versions. If the suite ever outgrows this, replacing it is a contained
 * change: nothing outside tests/ imports it.
 */

import System from 'system';

/** @type {string[]} */
const failures = [];
let suite = '';
let passed = 0;

/**
 * Group related tests under a name.
 *
 * @param {string} name What the tests are about.
 * @param {() => void} body Calls {@link it} one or more times.
 * @returns {void}
 */
export function describe(name, body) {
    const previous = suite;
    suite = previous ? `${previous} ${name}` : name;
    try {
        body();
    } finally {
        suite = previous;
    }
}

/** @type {Promise<void>[]} */
const pending = [];

/**
 * Run one test. A test fails by throwing; the assertions below do the throwing.
 *
 * A body that returns a promise is awaited by {@link settle} instead of being
 * dropped. Without that an async test would count as passed the moment it hit
 * its first await, and every assertion after that would be a failure nobody
 * ever saw — which is worse than having no test at all.
 *
 * @param {string} name What this test asserts.
 * @param {() => (void | Promise<void>)} body The test.
 * @returns {void}
 */
export function it(name, body) {
    const label = suite ? `${suite} — ${name}` : name;

    let result;
    try {
        result = body();
    } catch (error) {
        record(label, error);

        return;
    }

    if (result instanceof Promise) {
        pending.push(result.then(() => {
            passed++;
        }, error => record(label, error)));

        return;
    }

    passed++;
}

/**
 * Wait for every asynchronous test to finish.
 *
 * Call it once, after the last import and before {@link finish}.
 *
 * @returns {Promise<void>} Resolves when nothing is outstanding.
 */
export async function settle() {
    await Promise.all(pending.splice(0));
}

/**
 * @param {string} label The test's name.
 * @param {unknown} error What it threw.
 * @returns {void}
 */
function record(label, error) {
    const detail = error instanceof Error ? error.message : String(error);
    failures.push(`${label}\n    ${detail}`);
}

/**
 * Assert that two values are the same, by Object.is.
 *
 * @param {unknown} actual The value under test.
 * @param {unknown} expected What it should be.
 * @param {string} [message] Added to the failure.
 * @returns {void}
 */
export function assertEqual(actual, expected, message) {
    if (Object.is(actual, expected))
        return;

    throw new Error(
        `${message ? `${message}: ` : ''}expected ${describeValue(expected)}, got ${describeValue(actual)}`);
}

/**
 * Assert that two values have the same JSON rendering.
 *
 * JSON is a blunt comparison — it ignores undefined properties and key order
 * matters for neither — but every value this suite compares is a plain object
 * of strings and numbers, and a hand-written deep-equal would be one more
 * thing to get wrong.
 *
 * @param {unknown} actual The value under test.
 * @param {unknown} expected What it should be.
 * @param {string} [message] Added to the failure.
 * @returns {void}
 */
export function assertDeepEqual(actual, expected, message) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson === expectedJson)
        return;

    throw new Error(`${message ? `${message}: ` : ''}expected ${expectedJson}, got ${actualJson}`);
}

/**
 * Assert that a call throws.
 *
 * @param {() => unknown} body The call under test.
 * @param {string} [message] Added to the failure.
 * @returns {void}
 */
export function assertThrows(body, message) {
    let threw = false;
    try {
        body();
    } catch {
        threw = true;
    }

    if (!threw)
        throw new Error(`${message ? `${message}: ` : ''}expected a throw, got a return`);
}

/**
 * Fail the current test outright.
 *
 * @param {string} message Why.
 * @returns {never}
 */
export function fail(message) {
    throw new Error(message);
}

/**
 * Print the summary and exit: 0 when every test passed, 1 otherwise.
 *
 * @returns {void}
 */
export function finish() {
    if (failures.length === 0) {
        print(`${passed} passed`);
        System.exit(0);
    }

    printerr(`${failures.length} failed, ${passed} passed\n`);
    for (const failure of failures)
        printerr(`  ✗ ${failure}`);

    System.exit(1);
}

/**
 * @param {unknown} value Any value.
 * @returns {string} A short rendering for a failure message.
 */
function describeValue(value) {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
}
