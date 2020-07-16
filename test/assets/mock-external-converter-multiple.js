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
    model: 'external_converters_device',
    homeassistant: [homeassistantSwitch],
}, {
    mock: 2
}];

module.exports = mockDevices;