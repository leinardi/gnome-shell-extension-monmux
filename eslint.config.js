// SPDX-License-Identifier: GPL-2.0-or-later
//
// The rule set GNOME Shell itself is linted with, from
// gnome-shell/tools/eslint.config.js, plus the overrides this repository needs.
// Extensions submitted to extensions.gnome.org are read by reviewers against
// these conventions, so this file follows upstream rather than personal taste;
// the written-out version of what it enforces is in
// .agents/skills/gjs-style-guide/SKILL.md.

import {defineConfig} from '@eslint/config-helpers';
import globals from 'globals';
import gnome from 'eslint-config-gnome';

export default defineConfig([
    gnome.configs.recommended,
    gnome.configs.jsdoc,
    {
        ignores: [
            'node_modules',
            'dist',
            '.mk',
        ],
    }, {
        rules: {
            camelcase: ['error', {
                properties: 'never',
            }],
            'consistent-return': 'error',
            'eqeqeq': ['error', 'smart'],
            'key-spacing': ['error', {
                mode: 'minimum',
                beforeColon: false,
                afterColon: true,
            }],
            'prefer-arrow-callback': 'error',
            'prefer-const': ['error', {
                destructuring: 'all',
            }],
            // GNOME Shell does not type-check its JavaScript; this repository
            // does, and a `/** @type {X} */ (expr)` cast is parenthesised by
            // definition. Without this the two tools contradict each other on
            // every cast. The rest of the options are eslint-config-gnome's.
            'no-extra-parens': ['error', 'all', {
                conditionalAssign: false,
                nestedBinaryExpressions: false,
                returnAssign: false,
                allowParensAfterCommentPattern: '@type',
            }],
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-jsdoc': ['error', {
                exemptEmptyFunctions: true,
                publicOnly: {
                    esm: true,
                },
            }],
        },
    }, {
        // The Shell injects these into an extension's scope. They are not
        // available in prefs.js, which runs in a plain GJS process, but the
        // separation is enforced by review rather than by a glob: a prefs file
        // that reaches for `global` is a bug this list would only hide.
        files: [
            'src/**',
        ],
        languageOptions: {
            globals: {
                global: 'readonly',
                _: 'readonly',
                C_: 'readonly',
                N_: 'readonly',
                ngettext: 'readonly',
            },
        },
    }, {
        // The test harness is the documentation of a test; a JSDoc block over
        // every `it()` callback would say less than the string it is given.
        files: [
            'tests/**',
        ],
        rules: {
            'jsdoc/require-jsdoc': 'off',
        },
    }, {
        // scripts/ runs under node, not under GJS: no gi:// imports, and the
        // node globals instead of the Shell's.
        files: [
            'scripts/**',
        ],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
]);
