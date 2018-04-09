module.exports = [
    {
        supportedDevices: [260],
        description: 'WXKG01LM switch (260)',
        topic: 'switch',
        parse: (msg) => {
            return msg.data.data['onOff'] === 0 ? 'on' : 'off';
        }
    },
]

// // TODO
// 1001: {
//     topic: 'temperature',
//     payload: (msg) => parseFloat(msg.data.data['measuredValue']) / 100.0,
// },
// // TODO
// 1002: {
//     topic: 'humidity',
//     payload: (msg) => parseFloat(msg.data.data['measuredValue']) / 100.0,
// },
// // TODO
// 1003: {
//     topic: 'pressure',
//     payload: (msg) => parseFloat(msg.data.data['16']) / 10.0,
// },
// // TODO
// 1004: {
//     topic: 'occupancy',
//     payload: (msg) => msg.data.data['occupancy'],      
// },
// // TODO
// 1005: {
//     topic: 'illuminance',
//     payload: (msg) => msg.data.data['measuredValue'],       
// },