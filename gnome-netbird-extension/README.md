# NetBird GNOME Shell Extension

A GNOME Shell extension that adds a NetBird VPN status tile to the Quick Settings panel.

## Features

- VPN connection status with toggle (connect/disconnect)
- NetBird IP address and FQDN
- Connected peer count
- Relay and DNS server status
- Session expiry countdown
- Auto-refreshes every 15 seconds

## Requirements

- GNOME Shell 50 (Fedora 44+)
- NetBird installed at `/usr/bin/netbird`

## Install

```bash
chmod +x install.sh
./install.sh
```

If you're on Wayland (default on Fedora), log out and back in after installing, then run:

```bash
gnome-extensions enable netbird@jlapthor
```

## Uninstall

```bash
chmod +x uninstall.sh
./uninstall.sh
```

## Usage

Open **Quick Settings** (click the top-right system area) — the NetBird tile appears alongside Wi-Fi, Bluetooth, etc. Click the tile to connect/disconnect, or expand the dropdown for full status details.
