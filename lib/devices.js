const LED1623G12 = {
    model: 'LED1623G12',
    vendor: 'IKEA',
    description: 'TRADFRI LED bulb E27 1000 lumen, dimmable, opal white',
    supports: 'on/off, brightness',
    parsers: ['brightness'],
    
};

const LED1536G5 = {
    model: 'LED1536G5',
    vendor: 'IKEA',
    description: 'TRADFRI LED bulb E12/E14 400 lumen, dimmable, white spectrum, opal white',
    supports: 'on/off, brightness, color temperature',
    parsers: ['brightness', 'color'],
};

const devices = {
    // Xiaomi
    'lumi.sensor_switch': {
        model: 'WXKG01LM',
        vendor: 'Xiaomi',
        description: 'MiJia wireless switch',
        supports: 'single, double, triple, quadruple, many and long click',
        parsers: ['xiaomiBattery', 'xiaomiClick'],
    },
    'lumi.sensor_switch.aq2': {
        model: 'WXKG11LM',
        vendor: 'Xiaomi',
        description: 'Aqara wireless switch',
        supports: 'single, double, triple, quadruple click',
        parsers: ['xiaomiBattery', 'xiaomiClicks'],
    },
    'lumi.sensor_86sw1\u0000lu': {
        model: 'WXKG03LM',
        vendor: 'Xiaomi',
        description: 'Aqara single key wireless wall switch',
        supports: 'single click',
        parsers: ['xiaomiBattery', 'xiaomiSingleClick'],
    },
    'lumi.sensor_86sw2\u0000Un': {
        model: 'WXKG02LM',
        vendor: 'Xiaomi',
        description: 'Aqara double key wireless wall switch',
        supports: 'left, right and both click',
        ep: {
            1: 'left',
            2: 'right',
            3: 'both',
        },
        parsers: ['xiaomiBattery', 'xiaomiClickEp'],
    },
    'lumi.ctrl_neutral1': {
        model: 'QBKG04LM',
        vendor: 'Xiaomi',
        description: 'Aqara single key wired wall switch',
        supports: 'on/off',
        ep: {'': 2},
        parsers: ['xiaomiSwitchState'],
    },
    'lumi.ctrl_neutral2': {
        model: 'QBKG03LM',
        vendor: 'Xiaomi',
        description: 'Aqara double key wired wall switch',
        supports: 'l1 and l2 on/off',
        ep: {'l1': 2, 'l2': 3},
        parsers: ['xiaomiSwitch'],
    },
    'lumi.sens': {
        model: 'WSDCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia temperature & humidity sensor ',
        supports: 'temperature and humidity',
        parsers: ['xiaomiBattery', 'xiaomiTemperature', 'xiaomiHumidity'],
    },
    'lumi.weather': {
        model: 'WSDCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara temperature, humidity and pressure sensor',
        supports: 'temperature, humidity and pressure',
        parsers: ['xiaomiBattery', 'xiaomiTemperature', 'xiaomiHumidity', 'xiaomiPressure'],
    },
    'lumi.sensor_motion': {
        model: 'RTCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia human body movement sensor',
        supports: 'occupancy',
        parsers: ['xiaomiBattery', 'xiaomiOccupancy'],
    },
    'lumi.sensor_motion.aq2': {
        model: 'RTCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara human body movement and illuminance sensor',
        supports: 'occupancy and illuminance',
        parsers: ['xiaomiBattery', 'xiaomiOccupancy', 'xiaomiIlluminance'],
    },
    'lumi.sensor_magnet': {
        model: 'MCCGQ01LM',
        vendor: 'Xiaomi',
        description: 'MiJia door & window contact sensor',
        supports: 'contact',
        parsers: ['xiaomiBattery', 'xiaomiContact'],
    },
    'lumi.sensor_magnet.aq2': {
        model: 'MCCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara door & window contact sensor',
        supports: 'contact',
        parsers: ['xiaomiBattery', 'xiaomiContact'],
    },
    'lumi.sensor_wleak.aq1': {
        model: 'SJCGQ11LM',
        vendor: 'Xiaomi',
        description: 'Aqara water leak sensor',
        supports: 'water leak true/false',
        parsers: ['xiaomiBattery', 'xiaomiDetectedReport', 'xiaomiDetectedLeak'],
    },
    'lumi.sensor_cube': {
        model: 'MFKZQ01LM',
        vendor: 'Xiaomi',
        description: 'Mi smart home cube',
        supports: 'shake, wakeup, fall, tap, slide, flip180, flip90, rotate_left and rotate_right',
        parsers: ['xiaomiBattery', 'xiaomiCubeEvents', 'xiaomiCubeRotation'],
    },
    'lumi.plug': {
        model: 'ZNCZ02LM',
        description: 'Mi power plug ZigBee',
        supports: 'on/off, power measurement',
        vendor: 'Xiaomi',
        parsers: ['xiaomiState', 'xiaomiPower', 'xiaomiPlugReport'],
    },
    'lumi.ctrl_86plug': {
        model: 'QBCZ11LM',
        description: 'Aqara socket Zigbee',
        supports: 'on/off, power measurement',
        vendor: 'Xiaomi',
        parsers: ['xiaomiState', 'xiaomiPower'],
    },
    'lumi.sensor_smoke': {
        model: 'JTYJ-GD-01LM/BW',
        description: 'MiJia Honeywell smoke detector',
        supports: 'smoke',
        vendor: 'Xiaomi',
        parsers: ['xiaomiBattery', 'xiaomiDetectedSmoke'],
    },

    // IKEA
    'TRADFRI bulb E27 WS opal 980lm': {
        model: 'LED1545G12',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E27 980 lumen, dimmable, white spectrum, opal white',
        supports: 'on/off, brightness, color temperature',
        parsers: ['brightness', 'color'],
    },
    // LED1623G12 uses 2 model IDs, see https://github.com/Koenkk/zigbee2mqtt/issues/21
    'TRADFRI bulb E27 opal 1000lm': LED1623G12,
    'TRADFRI bulb E27 W opal 1000lm': LED1623G12,
    'TRADFRI bulb GU10 WS 400lm': {
        model: 'LED1537R6',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb GU10 400 lumen, dimmable, white spectrum',
        supports: 'on/off, brightness, color temperature',
        parsers: ['brightness', 'color'],
    },
    'TRADFRI bulb GU10 W 400lm': {
        model: 'LED1650R5',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb GU10 400 lumen, dimmable',
        supports: 'on/off, brightness',
        parsers: ['brightness'],
    },
    // LED1536G5 has an E12 and E14 version.
    'TRADFRI bulb E14 WS opal 400lm': LED1536G5,
    'TRADFRI bulb E12 WS opal 400lm': LED1536G5,
    'TRADFRI bulb E26 opal 1000lm': {
        model: 'LED1622G12',
        vendor: 'IKEA',
        description: 'TRADFRI LED bulb E26 1000 lumen, dimmable, opal white',
        supports: 'on/off, brightness',
        parsers: ['brightness'],
    },

    // Philips
    'LLC020': {
        model: '7146060PH',
        vendor: 'Philips',
        description: 'Hue Go',
        supports: 'on/off, brightness, color temperature, color xy',
        parsers: ['brightness', 'color'],
    },

    // Belkin
    'MZ100': {
        model: 'F7C033',
        vendor: 'Belkin',
        description: 'WeMo smart LED bulb',
        supports: 'on/off, brightness',
        parsers: ['brightness'],
    },

    // EDP
    'ZB-SmartPlug-1.0.0': {
        model: 'PLUG EDP RE:DY',
        vendor: 'EDP',
        description: 're:dy plug',
        supports: 'on/off, power measurement',
        report: [{
            'cid': 'seMetering',
            'attr': 'instantaneousDemand',
            'ep': 85,
            'minInt': 10,
            'maxInt': 60,
            'repChange': 1,
        }],
        parsers: ['plugEdpPower'],
    },

    // Texax Instruments
    'lumi.router': {
        model: 'CC2530.ROUTER',
        vendor: 'Texas Instruments',
        description: '[CC2530 router](http://ptvo.info/cc2530-based-zigbee-coordinator-and-router-112/)',
        supports: 'state, description, type, rssi',
        parsers: ['cc2530RouterState', 'cc2530Router'],
    },
};

module.exports = devices;
