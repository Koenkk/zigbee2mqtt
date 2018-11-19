const chai = require('chai');
const sinon = require('sinon');
const DevicePublish = require('../lib/extension/devicePublish');
const settings = require('../lib/util/settings');

const mqtt = {
    subscribe: (topic) => {},
};

describe('DevicePublish', () => {
    let devicePublish;

    beforeEach(() => {
        devicePublish = new DevicePublish(null, mqtt, null, null);
    });

    describe('Parse topic', () => {
        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt1/my_device_id/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt1/my_device_id/sett';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt/my_device_id/write';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should handle non-valid topics', () => {
            const topic = 'zigbee2mqtt/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should handle non-valid topics', () => {
            const topic = 'set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed, null);
        });

        it('Should parse set topic', () => {
            const topic = 'zigbee2mqtt/my_device_id/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, 'my_device_id');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse get topic', () => {
            const topic = 'zigbee2mqtt/my_device_id2/get';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'get');
            chai.assert.strictEqual(parsed.deviceID, 'my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse topic with when base topic has multiple slashes', () => {
            const stub = sinon.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        base_topic: 'zigbee2mqtt/at/my/home',
                    },
                };
            });

            const topic = 'zigbee2mqtt/at/my/home/my_device_id2/get';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'get');
            chai.assert.strictEqual(parsed.deviceID, 'my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
            stub.restore();
        });

        it('Should parse topic with when deviceID has multiple slashes', () => {
            const topic = 'zigbee2mqtt/floor0/basement/my_device_id2/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, 'floor0/basement/my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse topic with when base and deviceID have multiple slashes', () => {
            const stub = sinon.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        base_topic: 'zigbee2mqtt/at/my/basement',
                    },
                };
            });

            const topic = 'zigbee2mqtt/at/my/basement/floor0/basement/my_device_id2/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, 'floor0/basement/my_device_id2');
            chai.assert.strictEqual(parsed.postfix, '');
            stub.restore();
        });

        it('Should parse set with ieeAddr topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/left/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, 'left');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/right/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, 'right');
        });

        it('Should parse set with postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/bottom_left/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689');
            chai.assert.strictEqual(parsed.postfix, 'bottom_left');
        });

        it('Shouldnt parse set with invalid postfix topic', () => {
            const topic = 'zigbee2mqtt/0x12345689/invalid/set';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'set');
            chai.assert.strictEqual(parsed.deviceID, '0x12345689/invalid');
            chai.assert.strictEqual(parsed.postfix, '');
        });

        it('Should parse set with and slashes in base and deviceID postfix topic', () => {
            const stub = sinon.stub(settings, 'get').callsFake(() => {
                return {
                    mqtt: {
                        base_topic: 'zigbee2mqtt/at/my/home',
                    },
                };
            });

            const topic = 'zigbee2mqtt/at/my/home/my/device/in/basement/sensor/bottom_left/get';
            const parsed = devicePublish.parseTopic(topic);
            chai.assert.strictEqual(parsed.type, 'get');
            chai.assert.strictEqual(parsed.deviceID, 'my/device/in/basement/sensor');
            chai.assert.strictEqual(parsed.postfix, 'bottom_left');
            stub.restore();
        });
    });
});
