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
 * What a switch result tells the user. It switches on the kind the client
 * already classified, never on an exit code, and claims no more than monmux
 * did: a command is reported as sent, not as a switch, and only a refusal says
 * that nothing was written. The Shell 46 notification API it uses is unchanged
 * through 50.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {installMonmux, reportProblem, troubleshooting} from '../lib/links.js';
import {ResultKind} from '../lib/monmux.js';
import {SlotTargetKind} from '../lib/shortcuts.js';
import {excerpt, openLink} from './common.js';

/**
 * The refusal a click gets when several supported monitors are attached and it
 * was not pinned to one. While serial targeting is off, the notification for a
 * click in the menu names the preference that pins it.
 */
const MULTIPLE_CANDIDATES = 'multiple-candidates';

/** @typedef {import('../lib/monmux.js').Result} Result */
/** @typedef {import('../lib/reasons.js').Reasons} Reasons */
/** @typedef {import('../lib/shortcuts.js').Slot} Slot */
/** @typedef {import('../lib/shortcuts.js').SlotTarget} SlotTarget */

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
     * @param {() => boolean} serialTargeting Whether the user has serial
     *   targeting on, asked each time a refusal is posted.
     */
    constructor(reasons, serialTargeting) {
        this._reasons = reasons;
        this._serialTargeting = serialTargeting;

        /** @type {?MessageTray.Source} */
        this._source = null;
    }

    /**
     * Tell the user what a switch did.
     *
     * @param {?Result} result The client's result, or null when the run was
     *   cancelled - in which case whoever cancelled it is gone and nothing is
     *   posted.
     * @param {object} [options] Options.
     * @param {boolean} [options.fromMenu] Whether the switch was a click in the
     *   menu, which serial targeting can pin, rather than a shortcut, which it
     *   never does.
     * @returns {void}
     */
    notify(result, {fromMenu = true} = {}) {
        if (result === null)
            return;

        this._post(this._compose(result, fromMenu));
    }

    /**
     * Tell the user that a switch produced no result at all.
     *
     * Three things end up here, and nothing here can tell them apart: an input
     * name the client rejected before running anything, a monmux that could not
     * be started, and a monmux that ran and wrote output that is not valid
     * UTF-8, which may have sent a command. Only a refusal may promise that
     * nothing was written, so all three say that the write status is unknown.
     *
     * @param {unknown} error What the adapter threw.
     * @returns {void}
     */
    notifyError(error) {
        this._post({
            title: this._reasons.label('failed-title'),
            body: lines(
                this._reasons.label('run-failed'),
                this._reasons.label('write-status-unknown'),
                excerpt(String(error))),
            actions: [],
        });
    }

    /**
     * Tell the user that a shortcut was pressed and monmux was not started,
     * because its slot names no input that could be handed to it.
     *
     * Not a refusal, and it does not say that nothing was written: monmux never
     * ran, so there is no answer of its to report, only that it was not run.
     *
     * @param {Slot} slot The slot whose shortcut was pressed.
     * @param {SlotTarget} target What its input key holds: empty, or not an
     *   input name.
     * @returns {void}
     */
    notifySlot(slot, target) {
        const invalid = target.kind === SlotTargetKind.INVALID;

        this._post({
            title: this._reasons.label(invalid ? 'shortcut-invalid-input' : 'shortcut-no-input',
                {slot: String(slot.number)}),
            body: lines(
                invalid ? excerpt(target.input ?? '') : null,
                this._reasons.label('shortcut-nothing-run')),
            actions: [],
        });
    }

    /**
     * @param {Message} message What to post.
     * @returns {void}
     */
    _post({title, body, actions}) {
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
     * @param {boolean} fromMenu Whether the switch was a click in the menu.
     * @returns {Message} The notification's content.
     */
    _compose(result, fromMenu) {
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
                    // Only for a click in the menu, and only while the
                    // preference is off. A shortcut names no display, so the
                    // preference cannot pin it; and with the preference on, the
                    // click went unpinned because no serial was read for its
                    // display, which turning it on again would not change.
                    reason === MULTIPLE_CANDIDATES && fromMenu && !this._serialTargeting()
                        ? reasons.label('serial-targeting-hint')
                        : null,
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
