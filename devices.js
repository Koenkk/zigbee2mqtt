const devices = {
    'lumi.sensor_switch': {
        model: 'WXKG01LM',
        description: 'MiJia wireless switch',
        supports: 'single, double, triple, quadruple, many and long click',
    },
    'lumi.sens': {
        model: 'WSDCGQ01LM',
        description: 'MiJia temperature & humidity sensor ',
        supports: 'temperature and humidity',
    },
    'lumi.sensor_motion': {
        model: 'RTCGQ01LM',
        description: 'MiJia human body movement sensor',
        supports: 'occupancy, motion and no motion'
    },
    'lumi.sensor_magnet': {
        model: 'MCCGQ01LM',
        description: 'MiJia door & window contact sensor',
        supports: 'open and closed state',
    },
}

module.exports = devices;
