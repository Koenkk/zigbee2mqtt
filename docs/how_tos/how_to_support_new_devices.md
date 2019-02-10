# How to support new devices

Zigbee2mqtt uses [zigbee-shepherd-converters](https://github.com/Koenkk/zigbee-shepherd-converters) to parse messages to and from devices. This was originally part of Zigbee2mqtt but has been moved to a separate library so that other projects can also take advantage of this.

This page will guide you through the process of adding support for new devices to [zigbee-shepherd-converters](https://github.com/Koenkk/zigbee-shepherd-converters).

In case you require any help feel free to create an [issue](https://github.com/Koenkk/zigbee2mqtt/issues).

## 1. Pairing the device with Zigbee2mqtt
The first step is to pair the device with zigbee2mqtt. It should be possible to pair your unsupported device out of the box because zigbee2mqtt can pair with any zigbee device. You need to find out how to bring your device into pairing mode, most of the time via a factory reset. For some vendors this is already documented [here](https://koenkk.github.io/zigbee2mqtt/getting_started/pairing_devices.html).

Once you successfully paired the device you will see something like:
```
2018-5-1 18:06:41 INFO New device with address 0x00158d0001b79111 connected!
2018-5-1 18:06:42 WARN Device with modelID 'lumi.sens' is not supported.
2018-5-1 18:06:42 WARN Please see: https://koenkk.github.io/zigbee2mqtt/how_tos/how_to_support_new_devices.html
```

*NOTE: Make sure that `permit_join: true` is set in `configuration.yaml` otherwise new devices cannot join the network.*

## 2. Adding your device
The next step is the to add an entry of your device to `node_modules/zigbee-shepherd-converters/devices.js`. In order to provide support for E.G. the `lumi.sens` from step 1 you would add:
```js
{
    zigbeeModel: ['lumi.sens'], // The model ID from: Device with modelID 'lumi.sens' is not supported.
    model: 'WSDCGQ01LM', // Vendor model number, look on the device for a model number
    vendor: 'Xiaomi', // Vendor of the device (only used for documentation and startup logging)
    description: 'MiJia temperature & humidity sensor ', // Description of the device, copy from vendor site. (only used for documentation and startup logging)
    supports: 'temperature and humidity', // Actions this device supports (only used for documentation)
    fromZigbee: [], // We will add this later
    toZigbee: [], // Should be empty, unless device can be controlled (e.g. lights, switches).
},
```

Once finished, restart Zigbee2mqtt and trigger some actions on the device. You will see messages like:
```
2018-5-1 18:19:41 WARN No converter available for 'WSDCGQ01LM' with cid 'msTemperatureMeasurement' and type 'attReport'
2018-5-1 18:19:41 WARN Please create an issue on https://github.com/Koenkk/zigbee2mqtt/issues with this message.
```

In case your device is not reporting anything, it could be that this device requires additional configuration. This can be done by adding a `configure:` section ([examples here](https://github.com/Koenkk/zigbee-shepherd-converters/blob/master/devices.js)). In case your device is a contact or motion sensor, it could be that this is an [IAS device](https://stackoverflow.com/questions/31241211/zigbee-ias-device-enroll-and-response). Example of an IAS `configure:` section:

```js
configure: (ieeeAddr, shepherd, coordinator, callback) => {
    const device = shepherd.find(ieeeAddr, 1);
    const actions = [
        (cb) => device.write('ssIasZone', 'iasCieAddr', coordinator.device.getIeeeAddr(), cb),
        (cb) => device.functional('ssIasZone', 'enrollRsp', {enrollrspcode: 0, zoneid: 23}, cb),
    ];

    execute(device, actions, callback);
},
```

## 3. Adding converter(s) for your device
In order to parse the messages of your zigbee device we need to add converter(s) to `node_modules/zigbee-shepherd-converters/converters/fromZigbee.js`.

Before adding new converters, please check if you can reuse any existing one.

For E.G. the following message
```
2018-5-1 18:19:41 WARN No converter available for 'WSDCGQ01LM' with cid 'msTemperatureMeasurement' and type 'attReport'
2018-5-1 18:19:41 WARN Please create an issue on https://github.com/Koenkk/zigbee2mqtt/issues with this message.
```

You would add to `node_modules/zigbee-shepherd-converters/converters/fromZigbee.js`:
```js
xiaomi_temperature: {
    cid: 'msTemperatureMeasurement',
    type: 'attReport',
    convert: (model, msg, publish, options) => {
        return {temperature: parseFloat(msg.data.data['measuredValue']) / 100.0};
    },
},
```

To find out the structure of the message and which attributes you need to grab from the message you could first start with:
```js
xiaomi_temperature: {
    cid: 'msTemperatureMeasurement',
    type: 'attReport',
    convert: (model, msg, publish, options) => {
        console.log(msg.data)
    },
},
```

Now update your device in `node_modules/zigbee-shepherd-converters/devices.js` with the new converter.
```js
{
    zigbeeModel: ['lumi.sens'],
    model: 'WSDCGQ01LM',
    vendor: 'Xiaomi',
    description: 'MiJia temperature & humidity sensor ',
    supports: 'temperature and humidity',
    fromZigbee: [fz.xiaomi_temperature],  # <-- added here
    toZigbee: [],
},
```

Repeat until your device does not produce any more log messages like:
```
2018-5-1 18:19:41 WARN No converter available for 'WSDCGQ01LM' with cid 'msTemperatureMeasurement' and type 'attReport'
2018-5-1 18:19:41 WARN Please create an issue on https://github.com/Koenkk/zigbee2mqtt/issues with this message.
```

## 4. (Optional) Add home assistant configuration for your device
In order to automatically discover this device in home assistant your device needs to be added to `mapping` in `lib/extension/homeassistant.js`.

## 5. Done!
Now it's time to submit a pull request to [zigbee-shepherd-converters](https://github.com/Koenkk/zigbee-shepherd-converters) so this device is supported out of the box by zigbee2mqtt. :smiley:
