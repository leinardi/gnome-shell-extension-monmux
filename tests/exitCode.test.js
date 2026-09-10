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

import {Outcome, WriteStatus, outcomeForExitCode, promisesNoWrite} from '../src/lib/exitCode.js';
import {assertDeepEqual, assertEqual, describe, it} from './harness.js';

describe('outcomeForExitCode', () => {
    it('reports 0 as sent', () => {
        assertDeepEqual(outcomeForExitCode(0), {
            code: 0,
            outcome: Outcome.SENT,
            writeStatus: WriteStatus.WRITTEN,
        });
    });

    it('reports 2 as a refusal that wrote nothing', () => {
        assertDeepEqual(outcomeForExitCode(2), {
            code: 2,
            outcome: Outcome.REFUSED,
            writeStatus: WriteStatus.NONE,
        });
    });

    it('reports 1 as a failure whose write status is unknown', () => {
        assertDeepEqual(outcomeForExitCode(1), {
            code: 1,
            outcome: Outcome.FAILED,
            writeStatus: WriteStatus.UNKNOWN,
        });
    });

    it('never promises "nothing was written" for an undocumented code', () => {
        for (const code of [3, 70, 127, 255, -1]) {
            const result = outcomeForExitCode(code);
            assertEqual(result.outcome, Outcome.UNEXPECTED, `exit ${code}`);
            assertEqual(result.writeStatus, WriteStatus.UNKNOWN, `exit ${code}`);
            assertEqual(promisesNoWrite(result), false, `exit ${code}`);
        }
    });

    it('treats a non-integer code as unexpected rather than as one of the three', () => {
        // A subprocess killed by a signal, or a wait status the caller failed to
        // decode, must not land on 0, 1 or 2 by accident.
        for (const code of [NaN, 1.5, Infinity]) {
            const result = outcomeForExitCode(code);
            assertEqual(result.outcome, Outcome.UNEXPECTED, `exit ${code}`);
            assertEqual(result.writeStatus, WriteStatus.UNKNOWN, `exit ${code}`);
        }
    });
});

describe('promisesNoWrite', () => {
    it('is true only for a refusal', () => {
        assertEqual(promisesNoWrite(outcomeForExitCode(2)), true, 'refused');
        assertEqual(promisesNoWrite(outcomeForExitCode(0)), false, 'sent');
        assertEqual(promisesNoWrite(outcomeForExitCode(1)), false, 'failed');
    });
});
