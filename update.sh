#!/usr/bin/env bash
cd "$(dirname "$0")"

if [ "$1" != "force" ]; then
    echo "Checking for updates..."
    git fetch -q
    NEW_COMMITS="$(git rev-list HEAD...@{upstream} --count)"
    if [ "$NEW_COMMITS" -gt 0 ]; then
        echo "Update available!"
    else
        echo "No update available. Use '$0 force' to skip the check."
        exit 0
    fi
fi

NEED_RESTART=0

OSNAME="$(uname -s)"
if [ "$OSNAME" == "FreeBSD" ]; then
    echo "Checking Zigbee2MQTT status..."
    if service zigbee2mqtt status >/dev/null; then
        echo "Stopping Zigbee2MQTT..."
        service zigbee2mqtt stop
        NEED_RESTART=1
    fi
else
    if which systemctl 2> /dev/null > /dev/null; then
        echo "Checking Zigbee2MQTT status..."
        if systemctl is-active --quiet zigbee2mqtt; then
            echo "Stopping Zigbee2MQTT..."
            sudo systemctl stop zigbee2mqtt
            NEED_RESTART=1
        fi
    else
        echo "Skipped stopping Zigbee2MQTT, no systemctl found"
    fi
fi

echo "Updating..."
git pull --no-rebase

echo "Installing dependencies..."
pnpm i --frozen-lockfile

echo "Building..."
pnpm run build

if [ $NEED_RESTART -eq 1 ]; then
    echo "Starting Zigbee2MQTT..."
    if [ "$OSNAME" == "FreeBSD" ]; then
        service zigbee2mqtt start
    else
        sudo systemctl start zigbee2mqtt
    fi
fi

echo "Done!"
