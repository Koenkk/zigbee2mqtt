# Alternative flashing methods

*NOTE: When you have already flashed the stick and paired devices to it, reflashing it requires to re-pair all your devices!*

### Via Arduino/ESP8266
Flashing firmware via Arduino is implemented using the project https://github.com/wavesoft/CCLib
**But with minor improvements!!!**

[AndrewLinden](https://github.com/AndrewLinden) described that he was able to flash CC2531 using CCLib [with comments](https://github.com/wavesoft/CCLib/issues/19).

As described [I made a fork of the CCLib library with minor changes](https://github.com/kirovilya/CCLib) for flashing firmware via Arduino:

* Timeouts of operations
* After opening the port (I have in Windows 7) Arduino reboots and, accordingly, does not respond to requests - made a 3 seconds pause (found somewhere in internet).
* The port speed is reduced to 9600, because at another speed leaving communication errors:
`ERROR: Could not read from the serial port!`

Flashing proccess:
1. Download and unpack the archive with the library https://github.com/kirovilya/CCLib.

2. Flashing Arduino sketch via Arduino IDE
CCLib\Arduino\CCLib\Examples\CCLib_proxy\CCLib_proxy.ino

**If flashing via esp8266 (wemos d1 mini), you need change connection (p. 5) and Pinout configuration in Arduino/CCLib/Examples/CCLib_proxy/CCLib_proxy.ino:**
```
int CC_RST   = 5;
int CC_DC    = 4;
int CC_DD_I  = 14;
int CC_DD_O  = 12;
```

3. Install Python 2.7 or later (tested with python 2.7.13), if not installed

4. Install pyserial 3.0.1, if not installed
`pip install -r CCLib\Python\requirements.txt`
or
`pip install pyserial==3.0.1`

5. Connect the contacts as described https://github.com/kirovilya/CCLib#1-prepare-your-arduino-board
**But in my case, I connected completely without resistors, combined the contacts CC_DD_I and CC_DD_O together and connected to the DD pin of the DEBUG connector!**

![](https://www.waveshare.com/img/devkit/CC-Debugger/CC-Debugger-JTAG-Header.jpg)

I connected only 3 specified contacts and GND. During the firmware, the stick and Arduino must be connected to the USB.

![](https://github.com/kirovilya/files/blob/master/IMG_20180111_193941.jpg)
![](https://github.com/kirovilya/files/blob/master/IMG_20180111_193923.jpg)
![](https://github.com/kirovilya/files/blob/master/IMG_20180110_234401.jpg)

6. After that, try to get information about the chip - if it works, then the connection is correct (example for COM9 port - Arduino port):

```
C:\Projects\CCLib\Python>python cc_info.py -p COM9
INFO: Found a CC2531 chip on COM9

Chip information:
      Chip ID : 0xb524
   Flash size : 256 Kb
    Page size : 2 Kb
    SRAM size : 8 Kb
          USB : Yes

Device information:
 IEEE Address : 00124b0014aa
           PC : 0000

Debug status:
 [ ] CHIP_ERASE_BUSY
 [ ] PCON_IDLE
 [X] CPU_HALTED
 [ ] PM_ACTIVE
 [ ] HALT_STATUS
 [ ] DEBUG_LOCKED
 [X] OSCILLATOR_STABLE
 [ ] STACK_OVERFLOW

Debug config:
 [ ] SOFT_POWER_MODE
 [ ] TIMERS_OFF
 [X] DMA_PAUSE
 [X] TIMER_SUSPEND
```
[Another example of connection on MacOS](https://github.com/wavesoft/CCLib/issues/22#issuecomment-384452424)

7. If everything is successful, download [the firmware](https://github.com/Koenkk/Z-Stack-firmware/tree/master/coordinator).
Before we flash the firmware we need to make a modification to it. Open the `.hex`
file in a text editor and **remove the second last line**. Now save the file.

8. Start the flashing firmware (it takes a long time, about 2-3 hours):

```
C:\Projects\ZigBee>python cc_write_flash.py -e -p COM9 --in=CC2531ZNP-Pro-Secure_LinkKeyJoin_mod.hex
INFO: Found a CC2531 chip on COM9

Chip information:
      Chip ID : 0xb524
   Flash size : 256 Kb
    Page size : 2 Kb
    SRAM size : 8 Kb
          USB : Yes
Sections in CC2531ZNP-Pro-Secure_LinkKeyJoin_mod.hex:

 Addr.    Size
-------- -------------
 0x0000   8176 B
 0x1ff6   10 B
 0x3fff0   1 B
 0x2000   239616 B

This is going to ERASE and REPROGRAM the chip. Are you sure? <y/N>:  y

Flashing:
 - Chip erase...
 - Flashing 4 memory blocks...
 -> 0x0000 : 8176 bytes
    Progress 100%... OK
 -> 0x1ff6 : 10 bytes
    Progress 100%... OK
 -> 0x3fff0 : 1 bytes
    Progress 100%... OK
 -> 0x2000 : 239616 bytes
    Progress 100%... OK

Completed
```