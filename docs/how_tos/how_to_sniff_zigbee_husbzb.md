# How to sniff Zigbee traffic with an HUSBZB-1 stick
If you happen to have a spare HUSBZB-1 stick, you can also use this to sniff traffic.

## Prerequisites
* Computer
  * Ubuntu machine (tested with 18.10)
  * Windows machine (tested with Windows 10)
* HUSBZB-1 stick
* Wireshark (for instructions on how to install, see the [other docs](./how_to_sniff_zigbee_traffic.md)
* Java

## 1. Install drivers
### Ubuntu
On linux systems, the HUSBZB-1 stick should work out of the box with no modifications.

### Windows
Found on https://www.amazon.com/gp/customer-reviews/RSPH6UCG0N3WK/
1. Download Silicon Labs CP210x drivers (Amazon won't let me link this, but it should be easy to Google)
2. Extract drivers to a folder (I'll use C:\CP210x_Windows_Drivers as an example)
3. Open Windows Device Manager (Win+X, M)
4. Right-click on "Other Devices > HubZ ZigBee Com Port" (NOT Z-Wave) and select "Update driver"
5. Select "Browse my computer for driver software"
6. Select "Let me pick from a list of available drivers on my computer"
7. Leave "Show All Devices" selected and click "Next"
8. Click "Have Disk"
9. Enter the folder name where you extracted the downloaded drivers: C:\CP210x_Windows_Drivers
10. Select "Silicon Labs CP210x USB to UART Bridge" and click "Next"
11. Windows will prompt that it cannot confirm the device ID, click "Yes" to proceed.
12. Write down the com port of the ZigBee device, something like COM5 or COM6.
  1. You can find this by going to "Ports (COM & LPT)" in the device manager

## 2. Installing required tools
Both Windows and Ubuntu use the same program for sniffing, found https://github.com/zsmartsystems/com.zsmartsystems.zigbee.sniffer. Scroll down to the bottom to download a precompiled jar file.

### Ubuntu
No extra software besides `ZigbeeSniffer.jar` and Wireshark is needed

### Windows
Download and install https://nmap.org/npcap/ and make sure you select to install the "Npcap Loopback Adapter" when installing. It shouldn't matter whether or not you use Winpcap compatibility mode.

## 3. Sniffing traffic
In a terminal or command line, run `java -jar ZigbeeSniffer.jar -baud 57600 -flow hardware -port {PORT}`.
On Windows, `PORT` should be replaced by `COM5` or whatever you wrote down in step 1.
On linux, `PORT` will be something like `/dev/ttyUSB3` or wherever you plugged in your HUSBZB-1 device.

Once you have the application running, you should see it connect to and start sniffing traffic on the network.

After that, open up Wireshark and start capturing on the loopback adapater.

Then, apply a filter `udp.port=17754` in order to filter down to only Zigbee traffic.

Lastly, follow the steps at [step 3 of the other docs](./how_to_sniff_zigbee_traffic.md#3-sniffing-traffic) to set up your encryption keys the same.
