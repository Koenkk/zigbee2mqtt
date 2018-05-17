const LED1623G12 = {
    model: 'LED1623G12',
    vendor: 'IKEA',
    description: 'TRADFRI LED bulb E27 1000 lumen, dimmable, opal white',
    supports: 'on/off, brightness',
};

const devices = {
    // Xiaomi
    'lumi.sensor_switch': {
        model: 'WXKG01LM',
        vendor: 'Xiaomi',
        description: 'MiJia wireless switch',
        supports: 'single, double, triple, quadruple, many and long click',
    },
    'lumi.sensor_switch.aq2': {
        model: 'WXKG11LM',
        vendor: 'Xiaomi',
        description: 'Aqara wireless switch',
        supports: 'single, double, triple, quadruple click',
    },
    'lumi.sensor_86sw1\u0000lu': {
        model: 'WXKG03LM',
        vendor: 'Xiaomi',
        description: 'Aqara single key wireless wall switch',
        supports: 'single click',
    },
    'lumi.sensor_86sw2\u0000Un': {
        model: 'WXKG02LM',
        vendor: 'Xiaomi',
        description: 'Aqara double key wireless wall switch',
        supports: 'left, right and both click',
    },
    'lumi.ctrl_neutral1': {
        model: 'QBKG04LM',
        vendor: 'Xiaomi',
        description: 'Aqara single key wired wall switch',
        supports: 'on/off',
        ep: {'': 2},
    },
    'lumi.ctrl_neutral2': {
        model: 'QBKG03LM',
        vendor: 'Xiaomi',
        description: 'Aqara double key wired wall switch',
        supports: 'l1 and l2 on/off',
        ep: {'l1': 2, 'l2': 3},
    },
    'lumi.sens': {
        model: 'WSDCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia temperature & humidity sensor ',
        supports: 'temperature and humidity',
    },
    'lumi.weather': {
        model: 'WSDCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara temperature, humidity and pressure sensor',
        supports: 'temperature, humidity and pressure',
    },
    'lumi.sensor_motion': {
        model: 'RTCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia human body movement sensor',
        supports: 'occupancy',
    },
    'lumi.sensor_motion.aq2': {
        model: 'RTCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara human body movement and illuminance sensor',
        supports: 'occupancy and illuminance',
    },
    'lumi.sensor_magnet': {
        model: 'MCCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia door & window contact sensor',
        supports: 'contact',
    },
    'lumi.sensor_magnet.aq2': {
        model: 'MCCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara door & window contact sensor',
        supports: 'contact',
    },
    'lumi.sensor_wleak.aq1': {
        model: 'SJCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara water leak sensor',
        supports: 'water leak true/false',
    },
    'lumi.sensor_cube': {
        model: 'MFKZQ01LM',
        vendor: 'Xiaomi',
        description: 'Mi smart home cube',
        supports: 'shake, wakeup, fall, tap, slide, flip180, flip90, rotate_left and rotate_right',
    },
    'lumi.plug': {
        model: 'ZNCZ02LM',
        description: 'Mi power plug ZigBee',
        supports: 'on/off, power measurement',
        vendor: 'Xiaomi',
    },
    'lumi.ctrl_86plug': {
        model: 'QBCZ11LM',
        description: 'Aqara socket Zigbee',
        supports: 'on/off, power measurement',
        vendor: 'Xiaomi',
    },
    'lumi.sensor_smoke': {
        model: 'JTYJ-GD-01LM/BW',
        description: 'MiJia Honeywell smoke detector',
        supports: 'smoke',
        vendor: 'Xiaomi',
    },

    // IKEA
    'TRADFRI bulb E27 WS opal 980lm': {
        model: 'LED1545G12',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E27 980 lumen, dimmable, white spectrum, opal white',
        supports: 'on/off, brightness, color temperature',
    },
    // LED1623G12 uses 2 model IDs, see https://github.com/Koenkk/zigbee2mqtt/issues/21
    'TRADFRI bulb E27 opal 1000lm': LED1623G12,
    'TRADFRI bulb E27 W opal 1000lm': LED1623G12,
    'TRADFRI bulb GU10 WS 400lm': {
        model: 'LED1537R6',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb GU10 400 lumen, dimmable, white spectrum',
        supports: 'on/off, brightness, color temperature',
    },
    'TRADFRI bulb GU10 W 400lm': {
        model: 'LED1650R5',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb GU10 400 lumen, dimmable',
        supports: 'on/off, brightness',
    },
    'TRADFRI bulb E14 WS opal 400lm': {
        model: 'LED1536G5',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E14 400 lumen, dimmable, white spectrum, opal white',
        supports: 'on/off, brightness, color temperature',
    },

    // Philips
    'LLC020': {
        model: '7146060PH',
        vendor: 'Philips',
        description: 'Hue Go',
        supports: 'on/off, brightness, color temperature, color xy',
    },

    // Belkin
    'MZ100': {
        model: 'F7C033',
        vendor: 'Belkin',
        description: 'WeMo smart LED bulb',
        supports: 'on/off, brightness',
    },
};

module.exports = devices;
