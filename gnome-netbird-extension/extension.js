import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const REFRESH_INTERVAL_SECONDS = 15;

function parseNetbirdStatus(output) {
    const info = {};
    const lines = output.split('\n');
    for (const line of lines) {
        const match = line.match(/^\s*(.+?):\s+(.+)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            switch (key) {
                case 'Management':
                    info.management = value;
                    break;
                case 'Signal':
                    info.signal = value;
                    break;
                case 'Relays':
                    info.relays = value;
                    break;
                case 'Nameservers':
                    info.nameservers = value;
                    break;
                case 'FQDN':
                    info.fqdn = value;
                    break;
                case 'NetBird IP':
                    info.ip = value;
                    break;
                case 'NetBird IPv6':
                    info.ipv6 = value;
                    break;
                case 'Interface type':
                    info.interfaceType = value;
                    break;
                case 'Peers count':
                    info.peers = value;
                    break;
                case 'Session expires':
                    info.sessionExpires = value;
                    break;
                case 'Daemon version':
                    info.version = value;
                    break;
            }
        }
    }

    info.connected = (info.management === 'Connected' && info.signal === 'Connected');
    return info;
}

function formatSessionExpiry(expiryStr) {
    if (!expiryStr) return 'Unknown';
    const parenMatch = expiryStr.match(/\((.+)\)/);
    if (parenMatch) return parenMatch[1];
    return expiryStr;
}

function runNetbirdCommand(args) {
    return new Promise((resolve, reject) => {
        try {
            const proc = Gio.Subprocess.new(
                ['/usr/bin/netbird', ...args],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            proc.communicate_utf8_async(null, null, (source, res) => {
                try {
                    const [, stdout, stderr] = source.communicate_utf8_finish(res);
                    const exitStatus = source.get_exit_status();
                    if (exitStatus === 0) {
                        resolve(stdout);
                    } else {
                        reject(new Error(stderr || `Exit code ${exitStatus}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

function addDetailRow(section, label, value) {
    const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    const box = new St.BoxLayout({
        x_expand: true,
        style_class: 'netbird-details-label',
    });
    const labelWidget = new St.Label({
        text: label,
        style_class: 'netbird-header-label',
        x_expand: true,
    });
    const valueWidget = new St.Label({
        text: value,
        style_class: 'netbird-value-label',
    });
    box.add_child(labelWidget);
    box.add_child(valueWidget);
    item.add_child(box);
    section.addMenuItem(item);
    return valueWidget;
}

const NetBirdToggle = GObject.registerClass(
class NetBirdToggle extends QuickSettings.QuickMenuToggle {
    _init(extensionObject) {
        super._init({
            title: 'NetBird',
            subtitle: 'Checking...',
            iconName: 'network-vpn-symbolic',
        });

        this._extensionObject = extensionObject;

        this.menu.setHeader('network-vpn-symbolic', 'NetBird VPN');

        this._detailsSection = new PopupMenu.PopupMenuSection();
        this._valueWidgets = {};
        this._valueWidgets.status = addDetailRow(this._detailsSection, 'Status', '...');
        this._valueWidgets.ip = addDetailRow(this._detailsSection, 'IP', '...');
        this._valueWidgets.fqdn = addDetailRow(this._detailsSection, 'FQDN', '...');
        this._valueWidgets.peers = addDetailRow(this._detailsSection, 'Peers', '...');
        this._valueWidgets.relays = addDetailRow(this._detailsSection, 'Relays', '...');
        this._valueWidgets.dns = addDetailRow(this._detailsSection, 'DNS', '...');
        this._valueWidgets.session = addDetailRow(this._detailsSection, 'Session', '...');
        this._valueWidgets.version = addDetailRow(this._detailsSection, 'Version', '...');
        this.menu.addMenuItem(this._detailsSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._connectItem = this.menu.addAction('Connect', () => this._toggleConnection());

        this.connect('clicked', () => this._toggleConnection());

        this._refresh();
    }

    async _refresh() {
        try {
            const output = await runNetbirdCommand(['status']);
            const info = parseNetbirdStatus(output);
            this._updateUI(info);
        } catch (e) {
            this._setDisconnectedUI(`Error: ${e.message}`);
        }
    }

    _updateUI(info) {
        if (info.connected) {
            this.checked = true;
            this.subtitle = `${info.peers || '?'} peers`;
            this.iconName = 'network-vpn-symbolic';
            this._valueWidgets.status.text = 'Connected';
            this._valueWidgets.ip.text = info.ip || '-';
            this._valueWidgets.fqdn.text = info.fqdn || '-';
            this._valueWidgets.peers.text = info.peers || '-';
            this._valueWidgets.relays.text = info.relays || '-';
            this._valueWidgets.dns.text = info.nameservers || '-';
            this._valueWidgets.session.text = formatSessionExpiry(info.sessionExpires);
            this._valueWidgets.version.text = info.version || '-';
            this._connectItem.label.text = 'Disconnect';
        } else {
            this._setDisconnectedUI('Disconnected');
        }
    }

    _setDisconnectedUI(statusText) {
        this.checked = false;
        this.subtitle = 'Disconnected';
        this.iconName = 'network-vpn-disabled-symbolic';
        this._valueWidgets.status.text = statusText;
        this._valueWidgets.ip.text = '-';
        this._valueWidgets.fqdn.text = '-';
        this._valueWidgets.peers.text = '-';
        this._valueWidgets.relays.text = '-';
        this._valueWidgets.dns.text = '-';
        this._valueWidgets.session.text = '-';
        this._valueWidgets.version.text = '-';
        this._connectItem.label.text = 'Connect';
    }

    async _toggleConnection() {
        try {
            if (this.checked) {
                await runNetbirdCommand(['down']);
            } else {
                await runNetbirdCommand(['up']);
            }
        } catch (_e) {
            // will be picked up on next refresh
        }
        // small delay then refresh
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }
});


export default class NetBirdExtension extends Extension {
    enable() {
        this._toggle = new NetBirdToggle(this);

        this._indicator = new QuickSettings.SystemIndicator(this);
        this._indicator.quickSettingsItems.push(this._toggle);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            REFRESH_INTERVAL_SECONDS,
            () => {
                this._toggle._refresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    disable() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }

        if (this._indicator) {
            this._indicator.quickSettingsItems.forEach(item => item.destroy());
            this._indicator.destroy();
            this._indicator = null;
        }

        this._toggle = null;
    }
}
