#!/bin/bash

######################################
##  INITIALIZE                      ##
######################################

set -o errexit -o pipefail -o noclobber -o nounset

! getopt --test > /dev/null
if [[ ${PIPESTATUS[0]} -ne 4 ]]; then
    echo "Unfortunately getopt failed in this environment."
    exit 2
fi


PROGRAM_NAME="zigbee2socat_installer"
VERSION="1.0"


######################################
##  PARSE ARGUMENTS                 ##
######################################

OPTS="a:p:uvmhV"
LONG="addr:,port:,uninstall,verbose,man,help,version"

# Concern: possible to escape getopt and execute commands as root?
! PARSED=$(getopt -n $PROGRAM_NAME \
                  -o $OPTS \
                  -l $LONG \
                  -- "$@")
if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
    printf "Error parsing arguments. Try %s --help\n" "$PROGRAM_NAME"
    exit 3
fi
eval set -- "$PARSED" # Use remaining arguments that weren't parsed


function handle_opts {
    if [[ $# = 1 ]]; then
        usage
    fi
    while true; do
    case $1 in
        -a|--addr)
            ip=$2; shift 2; continue ;;

        -p|--port)
            port=$2; shift 2; continue ;;

        -u|--uninstall)
            uninstall ;;

        -v|--verbose)
            verbose=1; shift; continue ;;

        -m|--man)
            makemanual ;;

        -h|--help)
            usage ;;

        -V|--version)
            version ;;

        --) # No more arguments to parse
            shift; break ;;

        *)
            printf "Programming error! Option: %s\n" "$1"
            exit 4 ;;
    esac;done
}


######################################
##  START OF MAIN                   ##
######################################

verbose=0
ip=""
port=""

function main {
    handle_opts "$@"

    if [[ "$ip" = "" ]]; then
        echo "IP-address not specified"
        exit 5
    fi

    # Is the port valid?
    if [[ $port -lt 1 || $port -gt 65535 ]]; then
        printf "Port %s, is outside range: [1-65535]\n" "$port"
        exit 6
    fi

    zigbee-socatvusb-install-package
}


######################################
##  FUNCTIONS BELOW                 ##
######################################

function zigbee-socatvusb-install-package {
    echo "Installing socat:"
    sudo apt-get install socat
    echo

    echo "Make dir for zigbee vusb"
    sudo mkdir -p /opt/zigbee2mqtt/vusb/ || die "Couldn't mkdir /opt/zigbee2mqtt/vusb/"
    sudo chown -R pi:pi /opt/zigbee2mqtt/vusb/ || die "Couldn't chown /opt/zigbee2mqtt/vusb/"

    echo "Creating service file zigbee-socatvusb.service"
    service_path="/etc/systemd/system/zigbee-socatvusb.service"

    [[ -f $service_path ]] && sudo rm $service_path
    echo "[Unit]
    Description=socat-vusb
    After=network-online.target

    [Service]
    User=pi
    ExecStart=/usr/bin/socat -d -d pty,raw,echo=0,link=/opt/zigbee2mqtt/vusb/zigbee_cc2530 tcp:$ip:$port,reuseaddr
    Restart=always
    RestartSec=10

    [Install]
    WantedBy=multi-user.target" > $service_path || die "Couldn't create service /etc/systemd/system/zigbee-socatvusb.service"

    sudo systemctl --system daemon-reload

    echo "Installation is now complete"
    echo
    echo "Service can be started after configuration by running: sudo systemctl start zigbee-socatvusb"
}

function uninstall {
    service_path="systemctl status socat-vusb.service"
    [[ -f $service_path ]] && sudo rm $service_path
    sudo systemctl --system daemon-reload
    echo "Uninstalled successfully"
    exit 0
}

function makemanual {
    [[ -f "$PROGRAM_NAME.man" ]] && sudo rm $PROGRAM_NAME.man
    help2man -N ./$PROGRAM_NAME.sh > $PROGRAM_NAME.man ; man ./$PROGRAM_NAME.man
    exit 0
}

function usage {
    echo -e "\
    \rSetup for development version of Zigbee2Socat

    -a, --addr IP       Listen on this IP-address
    -p, --port PORT     Listen on this port
    -u, --uninstall     Uninstall zigbee-socatvusb.service
    -v, --verbose       Print more information
    -m, --man           Make and display manual
    -h, --help          Display this help message

    \rOriginal concept by JFLN\
    "
    exit 0
}

function version {
    echo "$PROGRAM_NAME $VERSION"
    exit 0
}

function die {
    printf "%s\n" "$1"
    exit 1
}


main "$@" # Call main-function last
