const homeassistantSwitch = {
    type: 'switch',
    object_id: 'switch',
    discovery_payload: {
        payload_off: 'OFF',
        payload_on: 'ON',
        value_template: '{{ value_json.state }}',
        command_topic: true,
    },
};

const mockDevices = [{
    mock: 1,
    model: 'external_converters_device_1',
    homeassistant: [homeassistantSwitch],
    zigbeeModel: ['external_converter_device_1'],
    vendor: 'external_1',
    description: 'external_1',
    fromZigbee: [],
    toZigbee: [],
    exposes: [],
}, {
    mock: 2,
    model: 'external_converters_device_2',
    zigbeeModel: ['external_converter_device_2'],
    vendor: 'external_2',
    description: 'external_2',
    fromZigbee: [],
    toZigbee: [],
    exposes: [],
}];

module.exports = mockDevices;