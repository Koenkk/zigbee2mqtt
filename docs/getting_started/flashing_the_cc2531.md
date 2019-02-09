# Flashing the firmware on the CC2531 USB stick
The CC2531 USB stick needs to be flashed with a custom firmware.

*NOTE 1: The following instructions assume you have a CC Debugger. In case you don't, see [Alternative firmware flashing methods](../information/alternative_flashing_methods.md).*

*NOTE 2: When you have already flashed the stick and paired devices to it, reflashing it requires to re-pair all your devices! You can try to avoid this (see: [Flashing without re-pairing](../information/flashing_without_re-pairing.md))*

## Windows
1. Install [SmartRF Flash programmer](http://www.ti.com/tool/FLASH-PROGRAMMER) (**NOT V2**). This software is free but requires a Texas Instruments account in order to download.
2. Install the [CC debugger driver](http://www.ti.com/general/docs/lit/getliterature.tsp?baseLiteratureNumber=swrc212&fileType=zip) on your PC (Windows only). Before continuing, verify that the CC Debugger driver has been installed correctly. See [Figure 1. Verify Correct Driver Installation @ Chapter 5.1](http://www.ti.com/lit/ug/swru197h/swru197h.pdf). In case the CC Debugger is not recognized correctly [install the driver manually](https://www.youtube.com/watch?v=jyKrxxXOvQY).
2. Connect `CC debugger --> Downloader cable CC2531 --> CC2531 USB sniffer`.
3. Connect **BOTH** the `CC2531 USB sniffer` and the `CC debugger` to your PC using USB.
3. If the light on the CC debugger is RED press set reset button on the CC debugger. The light on the CC debugger should now turn GREEN. If not use [CC debugger user guide](http://www.ti.com/lit/ug/swru197h/swru197h.pdf) to troubleshoot your problem.
![How to connect](../images/connected.jpg)
4. Download the firmware [CC2531ZNP-Prod.hex](https://github.com/Koenkk/Z-Stack-firmware/tree/master/coordinator/CC2531/bin)
5. Start SmartRF Flash Programmer, setup as shown below and press `Perform actions`. Make sure to select the `.hex` file, not the `.bin` file!
![SmartRF Flash Programmer](../images/smartrf.png)

## Linux or MacOS
Credits to [@Frans-Willem](https://github.com/frans-Willem) for majority of instructions.

1. Install prerequisites for [CC-Tool](https://github.com/dashesy/cc-tool) using a package manager (e.g. [Homebrew](https://brew.sh/) for macOS)
* Ubuntu: dh-autoreconf, libusb-1.0, libboost-all-dev
* Fedora: dh-autoreconf, boost-devel, libusb1-devel
* Archlinux: dh-autoreconf, libusb, boost
* macOS: brew install autoconf automake libusb boost pkgconfig libtool

2. Build cc-tool
```bash
git clone https://github.com/dashesy/cc-tool.git
cd cc-tool
./bootstrap
./configure
make
```
3. Connect `CC debugger --> Downloader cable CC2531 --> CC2531 USB sniffer`.
4. Connect **BOTH** the `CC2531 USB sniffer` and the `CC debugger` to your PC using USB.
5. If the light on the CC debugger is RED, press the Reset button on the CC debugger. The light on the CC debugger should now turn GREEN. If not, follow the [CC debugger user guide](http://www.ti.com/lit/ug/swru197h/swru197h.pdf) to troubleshoot your problem.
![How to connect](../images/connected.jpg)
6. Download the firmware [CC2531ZNP-Prod.hex](https://github.com/Koenkk/Z-Stack-firmware/tree/master/coordinator/CC2531/bin).
7. Flash your firmware:
```
sudo ./cc-tool -e -w CC2531ZNP-Prod.hex
```

# What's next?
[Running Zigbee2mqtt](running_zigbee2mqtt.md)
