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
 * What a switch result tells the user.
 *
 * The result arrives classified. The client in monmux.js has already read the
 * exit code, checked the document's outcome and write status against it, and
 * turned any disagreement into a protocol error, so this file switches on the
 * result's kind and on nothing else. Branching on an exit code here would be a
 * second interpretation of it, and the one in exitCode.js is the only one.
 *
 * Each kind claims exactly what monmux claimed. A sent command is reported as
 * sent, never as a switch that happened, because nothing confirms that it did.
 * Only a refusal says that nothing was written. Everything else that ran - a
 * failure, an answer outside the contract, a binary that did not know the flag -
 * says that the write status is unknown, in those words.
 *
 * The GNOME Shell 46 notification API is the floor: a Source built with a title
 * and an icon name, a Notification built with its source, title and body, and
 * addAction(). All three are unchanged through 50.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {installMonmux, reportProblem, troubleshooting} from '../lib/links.js';
import {ResultKind} from '../lib/monmux.js';
import {excerpt, openLink} from './common.js';

/** @typedef {import('../lib/monmux.js').Result} Result */
/** @typedef {import('../lib/reasons.js').Reasons} Reasons */

/**
 * @typedef {object} Action
 * @property {string} label What the button says.
 * @property {string} link The absolute URL from links.js it opens.
 */

/**
 * @typedef {object} Message
 * @property {string} title The notification's title.
 * @property {string} body The notification's body, as plain text.
 * @property {Action[]} actions Its buttons.
 */

/**
 * Posts one notification per switch result, from one source.
 *
 * The constructor touches nothing in the Shell: the source is created on the
 * first notification, so an extension that is enabled and never used adds
 * nothing to the message tray.
 */
export class Notifier {
    /**
     * @param {Reasons} reasons Turns codes into the words a notification says.
     */
    constructor(reasons) {
        this._reasons = reasons;

        /** @type {?MessageTray.Source} */
        this._source = null;
    }

    /**
     * Tell the user what a switch did.
     *
     * @param {?Result} result The client's result, or null when the run was
     *   cancelled - in which case whoever cancelled it is gone and nothing is
     *   posted.
     * @returns {void}
     */
    notify(result) {
        if (result === null)
            return;

        const {title, body, actions} = this._compose(result);
        const source = this._ensureSource();

        const notification = new MessageTray.Notification({source, title, body});
        for (const action of actions)
            notification.addAction(action.label, () => openLink(action.link));

        source.addNotification(notification);
    }

    /**
     * Remove the source and every notification it posted.
     *
     * @returns {void}
     */
    destroy() {
        this._source?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
        this._source = null;
    }

    /**
     * @returns {MessageTray.Source} The source, created if there is none.
     */
    _ensureSource() {
        if (this._source !== null)
            return this._source;

        const source = new MessageTray.Source({
            title: this._reasons.label('app-name'),
            iconName: 'video-display-symbolic',
        });

        // The tray destroys a source once its last notification is gone. It is
        // forgotten then, so the next notification creates a new one instead of
        // being added to a disposed object.
        source.connect('destroy', () => {
            if (this._source === source)
                this._source = null;
        });

        Main.messageTray.add(source);
        this._source = source;

        return source;
    }

    /**
     * What a result says.
     *
     * The client guarantees what each kind carries, and this relies on it: a
     * sent or dry-run result has the display, model and input, a dry run has
     * its command, a refusal has its reason, and a failure has either a
     * document with an error or a non-empty stderr.
     *
     * @param {Result} result The result.
     * @returns {Message} The notification's content.
     */
    _compose(result) {
        const reasons = this._reasons;
        const doc = result.doc ?? {};

        switch (result.kind) {
        case ResultKind.OK:
            return {
                title: reasons.label('sent-title'),
                body: reasons.label('sent-body', {
                    input: textOf(doc.inputLabel) ?? doc.input,
                    display: doc.display.label,
                    model: doc.model,
                }),
                actions: [],
            };
        case ResultKind.DRY_RUN:
            // The command itself, whole: it is what a dry run exists to show.
            return {
                title: reasons.label('dry-run'),
                body: doc.command,
                actions: [],
            };
        case ResultKind.REFUSED: {
            const reason = doc.refusal.reason;
            const detail = textOf(doc.refusal.detail);

            return {
                title: reasons.label('refused-title'),
                body: lines(
                    reasons.text(reason),
                    detail === null ? null : excerpt(detail),
                    reasons.label('nothing-written')),
                actions: [{label: reasons.label('troubleshooting'), link: troubleshooting(reason)}],
            };
        }
        case ResultKind.FAILED:
            // The document's error when the switch handler raised the failure,
            // stderr when the command line was rejected before it ran.
            return {
                title: reasons.label('failed-title'),
                body: lines(
                    reasons.label('write-status-unknown'),
                    excerpt(result.doc === undefined ? result.stderr ?? '' : doc.error)),
                actions: [],
            };
        case ResultKind.UNSUPPORTED_FLAG:
            // monmux was replaced by an older one since the menu last read it.
            // It exited 1, and a failure promises nothing about the write.
            return {
                title: reasons.label('too-old-title'),
                body: lines(reasons.text('too-old'), reasons.label('write-status-unknown')),
                actions: [{label: reasons.label('install-monmux'), link: installMonmux()}],
            };
        default:
            // An answer outside the contract, or a kind this file has never
            // heard of. Either way the raw text is all there is, and it is shown
            // rather than interpreted - including that nothing it says settles
            // whether a command was sent.
            return {
                title: reasons.label('protocol-title'),
                body: lines(
                    reasons.text('protocol'),
                    reasons.label('write-status-unknown'),
                    excerpt(lines(textOf(result.stderr), textOf(result.stdout)))),
                actions: [{label: reasons.label('report-problem'), link: reportProblem()}],
            };
        }
    }
}

/**
 * @param {...?string} parts Lines, some of them null or empty.
 * @returns {string} The lines that have text, one per line.
 */
function lines(...parts) {
    return parts.filter(part => part !== null && part !== '').join('\n');
}

/**
 * @param {unknown} value Anything.
 * @returns {?string} The value trimmed, when it is a string with something in it.
 */
function textOf(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
