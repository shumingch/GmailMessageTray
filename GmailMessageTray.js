/*
 * Copyright (c) 2012-2017 Gmail Message Tray contributors
 *
 * Gmail Message Tray Extension is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gmail Message Tray Extension is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Authors:
 * Adam Jabłoński <jablona123@gmail.com>
 * Shuming Chan <shuming0207@gmail.com>
 *
 */
"use strict";
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Main = imports.ui.main;
const Util = imports.misc.util;
const Lang = imports.lang;
const GmailNotification = Me.imports.GmailNotification.GmailNotification;
const Source = imports.ui.messageTray.Source;
const console = Me.imports.console.console;
const Gettext = imports.gettext.domain('gmail_notify');
const _ = Gettext.gettext;

const EXTENSION_NAME = "Gmail Message Tray";
const DIALOG_ERROR = 'dialog-error';
const MAIL_READ = 'mail-read';
const MAIL_UNREAD = 'mail-unread';
const MAIL_MARK_IMPORTANT = 'mail-mark-important';

function simplehash(toHash) {
  var hash = 0, i, chr;
  if (toHash.length === 0) return hash;
  for (i = 0; i < toHash.length; i++) {
    chr   = toHash.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

const GmailMessageTray = new Lang.Class({
    Name: 'GmailMessageTray',
    _init: function (extension) {
        this.numUnread = 0;
        this.config = extension.config;
        this.sources = [];
        this.messageTray = Main.panel.statusArea.dateMenu.menu;
        this.errorSource = this._newErrorSource();
        this.messagesShown = [];
    },
    _newErrorSource: function(){
        return new Source(EXTENSION_NAME, DIALOG_ERROR);
    },
    _createNotification: function (content, iconName, popUp, permanent, cb) {
        const source = new Source(EXTENSION_NAME, MAIL_READ);
        return this._createNotificationWithSource(source, content, iconName, popUp, permanent, cb);
    },
    _createNotificationWithSource: function (source, content, iconName, popUp, permanent, cb) {
        Main.messageTray.add(source);
        const notification = new GmailNotification(source, content, iconName);
        notification.connect('activated', () => {
            try {
                cb();
            } catch (err) {
                console.error(err);
            }
        });

        if (permanent) {
            notification.setResident(true);
        }
        if (popUp) {
            source.notify(notification);
        } else {
            notification.acknowledged = true;
            source.pushNotification(notification);
        }

        this.sources.push(source);
        return notification;
    },

    _showNoMessage: function () {
        if (!this.config.getNoMail()) {
            return;
        }
        const content = {
            from: this.mailbox,
            date: new Date(),
            subject: _('No new messages')
        };
        const callback = () => {
            this._openEmail("");
            this.messageTray.close();
        };
        this._createNotification(content, MAIL_READ, false, true, callback);
    },
    showError: function (error) {
        const popup = this.errorSource.count === 0;
        this.errorSource.destroy();
        this.errorSource = this._newErrorSource();
        const content = {
            from: error,
            date: new Date(),
            subject: EXTENSION_NAME
        };
        this._createNotificationWithSource(this.errorSource, content, DIALOG_ERROR, popup, true, () => {
            this._openBrowser("https://github.com/shumingch/GmailMessageTray");
        });
    },
    _createEmailSummary: function () {
        return {
            from: this.mailbox,
            date: new Date(),
            subject: _('%s unread messages').format(this.numUnread)
        };
    },
    _showEmailSummaryNotification: function (popUp) {
        const callback = () => {
            if (this.messageTray.isOpen) {
                this._openEmail("");
            }
            this.messageTray.toggle();
        };
        const summary = this._createEmailSummary();
        return this._createNotification(summary, MAIL_MARK_IMPORTANT, popUp, true, callback);
    },
    destroySources: function () {
        for (let source of this.sources) {
            source.destroy();
        }
    },
    _createEmailNotification: function (msg) {
        const callback = () => {
            this._openEmail(msg.link);
            this.messageTray.close();
        };
        this._createNotification(msg, MAIL_UNREAD, false, false, callback);
    },
    updateContent: function (content, numUnread, mailbox) {
        const popUp = numUnread > this.numUnread;
        this.numUnread = numUnread;
        this.mailbox = mailbox;

        this.destroySources();
        let newMessages = 0
        if (content !== undefined) {
            if (content.length > 0) {
                for (let msg of content) {
                    let msgHash = simplehash(msg.link)
                    let unseen = this.messagesShown.find((h) => h == msgHash) == undefined
                    if (unseen)
                    {
                        this.messagesShown.push(msgHash)
                        this._createEmailNotification(msg)
                        newMessages++
                    }
                }
                if (newMessages) {
                    this._showEmailSummaryNotification(popUp);
                }
            }
        }
        if (!newMessages) {
            this._showNoMessage();
        }
    },
    _openBrowser: function (link) {
        if (link === '' || link === undefined) {
            link = 'https://www.gmail.com';
        }
        try {
            Util.trySpawnCommandLine("xdg-open " + link);
        } catch (err) {
            this._showXdgError(err);
        }
    },
    _openEmail: function (link) {
        if (this.config.getReader() === 0) {
            this._openBrowser(link);
        } else {
            try {
                Util.trySpawnCommandLine("xdg-email");
            } catch (err) {
                this._showXdgError(err);
            }
        }
    },
    _showXdgError: function (err) {
        console.error(err);
        const content = {
            from: _('Please install xdg-utils'),
            date: new Date(),
            subject: EXTENSION_NAME
        };
        this._createNotification(content, DIALOG_ERROR, true, true, () => {
        });
    }
});

