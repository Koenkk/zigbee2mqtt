**IMPORTANT:** Before you start, make sure that `permit_join: true` is set in your `configuration.yaml`. Otherwise new devices cannot join the network!
It's equally important that `permit_join: false` is set in your `configuration.yaml` after initial setup is done to keep your Zigbee network safe and to avoid accidental joining of other Zigbee devices.

Start by checking if your Zigbee device is supported, see  [Supported devices](../information/supported_devices.md).

Once you see something similar to `New device with address 0x00159d00016da0c8 connected!` in the log your device is paired.

## Xiaomi
Different devices require different pairing methods. In case you get an `Error [ERR_UNHANDLED_ERROR]: Unhandled error. (Cannot get the Node Descriptor of the Device: 0x00158d0001720111)` you should try a different pairing method. See [Supported devices](../information/supported_devices.md) to figure out if your device is MiJia or Aqara.
* Most MiJia devices: press and hold the reset button on the device for +- 5 seconds (until the blue light starts blinking). **IMPORTANT**: Release and start pressing the reset button every second. This keeps the device awake, otherwise pairing will **fail!**.
* Most Aqara devices: press and hold reset button on the device for +- 5 seconds until the blue light blinks three times, release the reset button (the blue light will blink once more) and wait.
* Most Aqara wall switches: press and hold the button on the device for +- 10 seconds (until the blue light starts blinking and stops blinking), release and wait.
* [Video: Pairing Xiaomi Aqara Cube MFKZQ01LM](https://www.youtube.com/watch?v=uhMrcIAdGxg&feature=youtu.be)

*NOTE: When you fail to pair a device, try replacing the battery, this could solve the problem.*

## Belkin WeMo smart LED bulb
[Resetting or Restoring the Wemo® Smart LED Bulb, F7C033](http://www.belkin.com/us/support-article?articleNum=116178)

## IKEA TRADFRI
The factory reset procedure differs between TRADFRI components:

* Factory reset the light bulb ([video](https://www.youtube.com/watch?v=npxOrPxVfe0)). After resetting the bulb will automatically connect. While pairing, keep the bulb close the the CC2531 USB sniffer.
What works for me every time is using (very) short “on’s” and a little bit longer “off’s”…
I start with bulb on, then off, and then 6 “on’s”, where I kill the light as soon as the bulb shows signs of turning on… Hope that make sense…?

* To factory reset the TRADFRI wireless dimmer (ICTC-G-1) press the button 4 times (so the red lights starts blinking).

* To factory reset the TRADFRI control outlet, press and hold the reset button (pinhole underneath the light, located at the top of the outlet) with a paperclip until the white light starts fading. Hold onto the button for a few more seconds, then release. After this, the outlet will automatically connect.

* To factory reset the TRADFRI drivers (ICPSHC24-10EU-IL-1 and ICPSHC24-30EU-IL-1) use a small pin or paperclip to push the reset button once.

## Philips Hue
Factory reset the light bulb see [HOWTO: Factory reset a Hue bulb](https://www.youtube.com/watch?v=qvlEAELiJKs). After resetting the bulb will automatically connect.

* This is also possible with the [Tradfri Remote Control](https://www.ikea.com/us/en/images/products/tradfri-remote-control__0489469_PE623665_S4.JPG) by pressing and holding the reset button on the bottom of the remote (next to the battery). [This may not always work](https://github.com/Koenkk/zigbee2mqtt/issues/296#issuecomment-416923751).
* Philips Hue Lightstrip Plus V2 have been successfully reset using the [Hue Dimmer Switch](https://www2.meethue.com/en-us/support/dimmer-switch) by holding the On and Off buttons at the same time for 10 seconds while holding next to the Lightstrip controller, afterwards the Lightstrips can join Zigbee2MQTT.
* For the 7146060PH (Philips Hue Go), **the power cord has to be connected**, after the blinking light (**INSTEAD** of step four in the video), press and keep holding the button on the bottom until the device is paired (+- 60 seconds). While holding the button the Hue Go will give you a nice light show :smile:.

### Philips Living Colors IRIS (Friends of HUE)
Philips Living Colors IRIS comes with Philips (HUE) Remote Gen 3 (Round Click Wheel).
To Pair hold Hold ON and Bottom Left Key (Favorite 1) in Front of the LED until the Light Blinks and turns Orange. If connection was succesfull the Light will turn Green.

## Innr
Factory reset using [Innr manual reset instructions](https://www.youtube.com/watch?v=4zkpZSv84H4). After resetting the bulb will automatically connect.

## Hive
Follow instructions from [How do I reset my Hive Active Light?](https://www.hivehome.com/ca/support/Help_installing_Hive/HIH_Hive_Active_Light/How-do-I-reset-my-Hive-Active-Light). After resetting the bulb will automatically connect.

## OSRAM
### OSRAM Light Bulb
Follow instruction from [Manual reset](http://belkin.force.com/Articles/articles/en_US/Troubleshooting_and_Tutorials/Resetting-the-OSRAM-LIGHTIFY-Tunable-White-60-Bulb#a). After resetting the bulb will automatically connect.
### OSRAM Smart+ Plug
For the OSRAM Smart+ plug (AB3257001NJ) hold the on/off button until your hear a click (+- 10 seconds).
### OSRAM Smart+ Switch Mini
For the OSRAM Smart+ Switch Mini (AC0251100NJ) hold the Middle and Arrow Down Buttons for 10 Seconds to Reset the Device. Hold the Middle and Arrow Up Buttons for 3 Seconds to connect. If the Switch is connected hold Middle and Arrow Up Buttons for 3 Seconds to disconnect.
### OSRAM Switch 4x-LIGHTIFY
For the OSRAM Switch 4x-LIGHTIFY (AB371860055) hold the Bottom Left and Top Right Button for 3 Seconds to connect.

## PLUG EDP RE:DY
Factory reset the plug (hold the switch button for >10sec). After resetting the switch will automatically connect.

## Netvox power socket
Factory reset by:
- Press and hold the Binding Key for 15 seconds. The network indicator will flash green 3 times
(at the 3rd, the 10th, and the 15th second).
- After releasing the Binding Key, press the Switch Key within 2 seconds. The network indicator
will rapidly flash green.
- After fast flashes, Z809A will reboot, and the restore is completed. The socket will automatically connect now.
