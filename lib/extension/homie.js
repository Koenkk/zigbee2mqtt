const zigbeeShepherdConverters = require('zigbee-shepherd-converters');
const settings = require('../util/settings');
const logger = require('../util/logger');
const utils = require('../util/utils');
const Queue = require('queue');
const zigbee2mqttVersion = require('../../package.json').version;

class HomieZigbeeNode {
    constructor(homie, ieeeAddr, name, model) {
        this.homie = homie;
        this.name = name;
        this.ieeeAddr = ieeeAddr;
        this.model = model;
        this.props = {};
        this.deviceTopic = homie.settings.baseTopic + "/" + name;

        this.publish("$homie", "3.0.1");
        this.publish("$name", this.name);
        this.publish("$localip", this.homie.settings.ip);
        this.publish("$mac", this.homie.settings.mac);
        this.publish("$implementation", "zigbee2mqtt");
        this.publish("$fw/name", "zigbee2mqtt");
        this.publish("$fw/version", zigbee2mqttVersion);

        this.publish("$nodes", "node");

        this.publish("$stats", "uptime");
        this.publish("$stats/interval", "60");

        this.publish("node/$name", name);
        this.publish("node/$type", model.vendor + "/" + model.model);
        this.publish("node/$properties", "vendor,model,address,description");

        this.publish("node/vendor", model.vendor);
        this.publish("node/vendor/$name", "Vendor");
        this.publish("node/vendor/$datatype", "string");
        this.publish("node/model", model.model);
        this.publish("node/model/$name", "Model");
        this.publish("node/model/$datatype", "string");
        this.publish("node/address", ieeeAddr);
        this.publish("node/address/$name", "ZigBee Address");
        this.publish("node/address/$datatype", "string");
        this.publish("node/description", model.description);
        this.publish("node/description/$name", "Description");
        this.publish("node/description/$datatype", "string");

        if (this.homie.state.exists(ieeeAddr)) {
            this.handleDeviceState(this.homie.state.get(ieeeAddr));
        }

        this.publish("$state", "ready");
    }
    publish(topic, payload, retain=true) {
        setImmediate(() => {
            this.homie.mqtt.publish(topic, "" + payload, {retain: retain, qos: 0}, () => {}, this.deviceTopic)
        });
    }
    rgb(color, brightness) {
        if (color.hasOwnProperty('r') && color.hasOwnProperty('g') && color.hasOwnProperty('b')) {
            if (brightness !== 0 && !brightness) {
                return color;
            }

            // double check if the color is brightness adjusted
            let xyb = this.xyb(color.r, color.g, color.b);

            if (Math.abs(brightness - xyb.brightness) > 1) {
                // adjust the brightness
                return this.rgb({x:xyb.x,y:xyb.y},brightness);
            }
            return color;
        }
        if (color.hasOwnProperty("x") && color.hasOwnProperty("y")) {
            // see https://github.com/usolved/cie-rgb-converter/blob/master/cie_rgb_converter.js
            if ((brightness !== 0 && !brightness) || brightness > 255) {
                brightness = 255;
            }
            var z = 1.0 - color.x - color.y;
            var Y = (brightness / 255.0);
            var X = (Y / color.y) * color.x;
            var Z = (Y / color.y) * z;
            var red 	=  X * 1.656492 - Y * 0.354851 - Z * 0.255038;
            var green 	= -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
            var blue 	=  X * 0.051713 - Y * 0.121364 + Z * 1.011530;
            if (red > blue && red > green && red > 1.0) {
                green = green / red;
                blue = blue / red;
                red = 1.0;
            }
            else if (green > blue && green > red && green > 1.0) {
                red = red / green;
                blue = blue / green;
                green = 1.0;
            }
            else if (blue > red && blue > green && blue > 1.0) {
                red = red / blue;
                green = green / blue;
                blue = 1.0;
            }
            red 	= red <= 0.0031308 ? 12.92 * red : (1.0 + 0.055) * Math.pow(red, (1.0 / 2.4)) - 0.055;
            green 	= green <= 0.0031308 ? 12.92 * green : (1.0 + 0.055) * Math.pow(green, (1.0 / 2.4)) - 0.055;
            blue    = blue <= 0.0031308 ? 12.92 * blue : (1.0 + 0.055) * Math.pow(blue, (1.0 / 2.4)) - 0.055;
            red 	= Math.round(red * 255) || 0;
            green 	= Math.round(green * 255) || 0;
            blue 	= Math.round(blue * 255) || 0;

            if (isNaN(red)) red = 0;
            if (isNaN(green)) green = 0;
            if (isNaN(blue)) blue = 0;

            return {r:red,g:green,b:blue};
        }
        logger.warn('unhandled color format: ' + JSON.stringify(color));
        return color;
    }
    xyb(red,green,blue) {
        var red = red / 255.0;
        var green = green / 255.0;
        var blue = blue / 255.0;
        // see https://github.com/usolved/cie-rgb-converter/blob/master/cie_rgb_converter.js
        var red 	= (red > 0.04045) ? Math.pow((red + 0.055) / (1.0 + 0.055), 2.4) : (red / 12.92);
        var green 	= (green > 0.04045) ? Math.pow((green + 0.055) / (1.0 + 0.055), 2.4) : (green / 12.92);
        var blue    = (blue > 0.04045) ? Math.pow((blue + 0.055) / (1.0 + 0.055), 2.4) : (blue / 12.92); 
        var X 		= red * 0.664511 + green * 0.154324 + blue * 0.162028;
        var Y 		= red * 0.283881 + green * 0.668433 + blue * 0.047685;
        var Z       = red * 0.000088 + green * 0.072310 + blue * 0.986039;
        var x 		= X / (X + Y + Z);
        var y       = Y / (X + Y + Z);
        var b = Math.round(Y * 255);
        if (b < 1 && b > 0) {
            b = 1;
        }
        return {x:x,y:y,brightness:b};
    }
    handleZigbee(message) {
        if (message.type == 'devInterview' || message.type == 'devIncoming') {
            return;
        }
        if (!message.data || (!message.data.cid && !message.data.cmdId)) {
            return;
        }

        const cid = message.data.cid;
        const cmdId = message.data.cmdId;
        const converters = this.model.fromZigbee.filter((c) => {
            if (cid) {
                return c.cid === cid && c.type === message.type;
            } else if (cmdId) {
                return c.cmd === cmdId;
            }

            return false;
        });

        if (converters.length === 0) {
            return
        }

        converters.forEach((converter) => {
            const payload = converter.convert(this.model, message, (p) => {}, settings.getDevice(this.ieeeAddr));
            if (payload) {
                this.handleDeviceState(payload);
            }
        });
    }
    handleDeviceState(message) {
        let updateProperties = false;

        if (message.hasOwnProperty('brightness') && this.props.hasOwnProperty('color')) {
            if (!message.hasOwnProperty('color') || (!message.color.hasOwnProperty('x') && !message.color.hasOwnProperty('r'))) {
                message.color = this.props.color;
            }
        }
        if (message.hasOwnProperty('color') && message.color.hasOwnProperty('x') && !message.hasOwnProperty('brightness')) {
            message.brightness = this.props.brightness;
        }

        // status values

        if (message.hasOwnProperty('linkquality')) {
            if (!this.props['linkquality']) {
                updateProperties = true;
                this.publish("node/linkquality/$name", "link quality");
                this.publish("node/linkquality/$unit", "%");
                this.publish("node/linkquality/$datatype", "integer");
            }
            this.props['linkquality'] = message.linkquality;
            this.publish("node/linkquality", message.linkquality);
        }

        if (message.hasOwnProperty('battery')) {
            if (!this.props['battery']) {
                updateProperties = true;
                this.publish("node/battery/$name", "battery level");
                this.publish("node/battery/$unit", "%");
                this.publish("node/battery/$datatype", "integer");
            }
            this.props['battery'] = message.battery;
            this.publish("node/battery", message.battery);
        }

        // sensors

        if (message.hasOwnProperty('occupancy')) {
            if (!this.props['occupancy']) {
                updateProperties = true;
                this.publish("node/occupancy/$name", "occupancy");
                this.publish("node/occupancy/$datatype", "boolean");
            }
            this.props['occupancy'] = message.occupancy;
            this.publish("node/occupancy", message.occupancy);
        }

        if (message.hasOwnProperty('contact')) {
            if (!this.props['contact']) {
                updateProperties = true;
                this.publish("node/contact/$name", "contact");
                this.publish("node/contact/$datatype", "boolean");
            }
            this.props['contact'] = message.contact;
            this.publish("node/contact", message.contact);
        }

        if (message.hasOwnProperty('illuminance')) {
            if (!this.props['illuminance']) {
                updateProperties = true;
                this.publish("node/illuminance/$name", "light level");
                this.publish("node/illuminance/$datatype", "integer");
            }
            this.props['illuminance'] = message.illuminance;
            this.publish("node/illuminance", message.illuminance);
        }

        if (message.hasOwnProperty('temperature')) {
            if (!this.props['temperature']) {
                updateProperties = true;
                this.publish("node/temperature/$name", "temperature");
                this.publish("node/temperature/$unit", "°C");
                this.publish("node/temperature/$datatype", "float");
            }
            this.props['temperature'] = message.temperature;
            this.publish("node/temperature", message.temperature);
        }

        // changeable values

        if (message.hasOwnProperty('state')) {
            if (!this.props['on']) {
                updateProperties = true;
                this.homie.mqtt.subscribe(this.deviceTopic + "/node/on/set");
                this.publish("node/on/$name", "turned on");
                this.publish("node/on/$datatype", "boolean");
                this.publish("node/on/$settable", "true");
            }
            let on = (message.state === true || message.state === 'ON');
            this.props['on'] = on;
            this.publish("node/on", on);
        }

        if (message.hasOwnProperty('brightness')) {
            if (!this.props['brightness']) {
                updateProperties = true;
                this.homie.mqtt.subscribe(this.deviceTopic + "/node/brightness/set");
                this.publish("node/brightness/$name", "brightness");
                this.publish("node/brightness/$unit", "%");
                this.publish("node/brightness/$format", "0:100");
                this.publish("node/brightness/$datatype", "float");
                this.publish("node/brightness/$settable", "true");
            }
            this.props['brightness'] = message.brightness;
            this.publish("node/brightness", message.brightness / 2.55);
        }

        if (message.hasOwnProperty('color')) {
            var color = {};
            if (message.hasOwnProperty('brightness')) {
                color = this.rgb(message.color, message.brightness);
            } else {
                color = this.rgb(message.color, this.props.brightness);
            }
            if (!this.props['color']) {
                updateProperties = true;
                this.homie.mqtt.subscribe(this.deviceTopic + "/node/color/set");
                this.publish("node/color/$name", "color");
                this.publish("node/color/$format", "rgb");
                this.publish("node/color/$datatype", "color");
                this.publish("node/color/$settable", "true");
            }
            this.props.color = color;
            this.publish("node/color", color.r + "," + color.g + "," +  color.b);
        }

        if (!updateProperties) {
            return;
        }

        var props = "vendor,model,address,description";
        for (var k in this.props) {
            props += "," + k;
        }
        this.publish("node/$properties", props);
    }
    handleMQTT(topic, message) {
        logger.info(this.name + ' got ' + topic + ':' + message);

        let subtopic = topic.substring(this.deviceTopic.length + 1);
        let fragments = subtopic.split('/');
        if (fragments[0] !== 'node' || fragments.length !== 3) {
            return;
        }

        let key = null;
        let json = null;
        let state = 'OFF';

        if (fragments[1] === 'color') {
            const rgb = message.split(',').map((v) => parseInt(v));
            const xyb = this.xyb(rgb[0],rgb[1],rgb[2]);
            key = 'color';
            json = {color:{x:xyb.x,y:xyb.y},brightness:xyb.brightness};
        }
        if (fragments[1] === 'brightness') {
            const brightness = parseInt(message);
            state = 'ON';
            key = 'brightness';
            json = {brightness:brightness*2.55/100.0};
        }
        if (fragments[1] === 'on') {
            if (message === 'true' || message === 'TRUE' || message === 'True' || message === 'ON' || message === 'on') {
                state = 'ON';
            }
            key = 'state';
            json = {state:state};
        }

        if (!key) {
            return;
        }
    
        let converter = this.model.toZigbee.find((c) => c.key.includes(key));
        if (!converter) {
            return;
        }

        let zigbeeMessage = converter.convert(key, json[key], json, 'set');
        if (!zigbeeMessage) {
            return;
        }

        logger.info('Sending ' + JSON.stringify(message) + ' as ' + JSON.stringify(zigbeeMessage) + ' to ' + this.name);

        // TODO: implements endpoints

        this.homie.queue.push((queueCallback) => {
            this.homie.zigbee.publish(
                this.ieeeAddr,
                zigbeeMessage.cid,
                zigbeeMessage.cmd,
                zigbeeMessage.cmdType,
                zigbeeMessage.zclData,
                zigbeeMessage.cfg,
                null,
                (error, rsp) => {
                    // Devices do not report when they go off, this ensures state (on/off) is always in sync.
                    if (!error && (key === 'state' || key === 'brightness')) {
                        this.handleDeviceState({state:state});
                    }
                    queueCallback();
                }
            );
        });

        if (key == 'color') {
            // also send brightness
            let converter = this.model.toZigbee.find((c) => c.key.includes('brightness'));
            if (converter) {
                let zigbeeMessage = converter.convert('brightness', json['brightness'], json, 'set');
                if (zigbeeMessage) {
                    this.homie.queue.push((queueCallback) => {
                        this.homie.zigbee.publish(
                            this.ieeeAddr,
                            zigbeeMessage.cid,
                            zigbeeMessage.cmd,
                            zigbeeMessage.cmdType,
                            zigbeeMessage.zclData,
                            zigbeeMessage.cfg,
                            null,
                            (error, rsp) => {
                                // Devices do not report when they go off, this ensures state (on/off) is always in sync.
                                if (!error && (key === 'state' || key === 'brightness')) {
                                    this.handleDeviceState({state:state});
                                }
                                queueCallback();
                            }
                        );
                    });
                }
            }
        }

        if (zigbeeMessage.zclData.transtime) {
            const time = zigbeeMessage.zclData.transtime * 100;
            const zigbeeMessage = converter.convert(key, json[key], json, 'get');
            setTimeout(() => {
                // Add job to queue
                this.homie.queue.push((queueCallback) => {
                    this.homie.zigbee.publish(
                        this.ieeeAddr,
                        zigbeeMessage.cid,
                        zigbeeMessage.cmd,
                        zigbeeMessage.cmdType,
                        zigbeeMessage.zclData,
                        zigbeeMessage.cfg,
                        null,
                        (error, rsp) => {
                            queueCallback();
                        }
                    );
                });
            }, time);
        }

        if (key == 'color') {
            let converter = this.model.toZigbee.find((c) => c.key.includes('brightness'));
            if (converter) {
                let zigbeeMessage = converter.convert('brightness', json['brightness'], json, 'set');
                if (zigbeeMessage.zclData.transtime) {
                    const time = zigbeeMessage.zclData.transtime * 100;
                    const zigbeeMessage = converter.convert('brightness', json['brightness'], json, 'get');
                    setTimeout(() => {
                        // Add job to queue
                        this.homie.queue.push((queueCallback) => {
                            this.homie.zigbee.publish(
                                this.ieeeAddr,
                                zigbeeMessage.cid,
                                zigbeeMessage.cmd,
                                zigbeeMessage.cmdType,
                                zigbeeMessage.zclData,
                                zigbeeMessage.cfg,
                                null,
                                (error, rsp) => {
                                    queueCallback();
                                }
                            );
                        });
                    }, time);
                }
            }
        }

        return true;
    }
}

/**
 * This extensions provides Homie compatibility
 */
class Homie {
    constructor(zigbee, mqtt, state, publishDeviceState) {
        this.zigbee = zigbee;
        this.mqtt = mqtt;
        this.state = state;
        this.publishDeviceState = publishDeviceState;

        this.queue = new Queue();
        this.queue.concurrency = 1;
        this.queue.autostart = true;

        // Internal settings
        this.settings = {};
        this.settings.baseTopic = settings.get().homie.base_topic || "homie";
        this.settings.device = settings.get().homie.device || "zigbee2mqtt";
        this.settings.name = settings.get().homie.name || "zigbee2mqtt";
        this.settings.mac = settings.get().homie.mac || "FF:FF:FF:FF:FF:FF";
        this.settings.ip = settings.get().homie.ip || "255.255.255.255";
        this.settings.statsInterval = settings.get().homie.stats_interval || 60;

        this.settings.deviceTopic = this.settings.baseTopic + "/" + this.settings.device

        this.discovered = {};
        this.names = {};
        this.startTime = Math.floor(new Date() / 1000);
        setInterval(() => this.updateStats(), utils.secondsToMilliseconds(this.settings.statsInterval));
    }

    publish(topic, payload, retain=true) {
        setImmediate(() => {
            this.mqtt.publish(topic, "" + payload, {retain: retain, qos: 0}, () => {}, this.settings.deviceTopic);
        });
    }

    updateStats() {
        let uptime = Math.max(0, Math.floor(new Date() / 1000) - this.startTime);
        this.publish("$stats/uptime", uptime);
        this.publish("$stats/interval", this.settings.statsInterval);
        for (var k in this.discovered) {
            this.discovered[k].publish("$stats/uptime", uptime);
            this.discovered[k].publish("$stats/interval", this.settings.statsInterval);
        }
    }

    onMQTTConnected() {
        // create this device in the homie tree
        this.publish("$homie", "3.0.1");
        this.publish("$name", this.settings.name);
        this.publish("$localip", this.settings.ip);
        this.publish("$mac", this.settings.mac);
        this.publish("$implementation", "zigbee2mqtt");
        this.publish("$fw/name", "zigbee2mqtt");
        this.publish("$fw/version", zigbee2mqttVersion);

        this.publish("$state", "init");
        this.publish("$nodes", "bridge");

        this.publish("bridge/$name", "ZigBee to MQTT bridge");
        this.publish("bridge/$type", "zigbee2mqtt");
        this.publish("bridge/$properties", "permit_join");

        this.publish("bridge/permit_join/$name", "allow zigbee devices to join the network");
        this.publish("bridge/permit_join/$datetype", "boolean");
        this.publish("bridge/permit_join", this.zigbee.getPermitJoin());

        this.publish("$stats", "uptime");
        this.publish("$stats/interval", "60");
        this.updateStats();

        // MQTT discovery of all paired devices on startup.
        this.zigbee.getAllClients().forEach((device) => {
            const mappedModel = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
            if (mappedModel) {
                this.discover(device.ieeeAddr, mappedModel, true);
            }
        });

        // mark device as ready
        this.publish("$state", "ready");
    }
    discover(ieeeAddr, mappedModel, force=false) {
        // Check if already discoverd and check if there are configs.
        const discover = force || !this.discovered[ieeeAddr];
        if (!discover || !settings.getDevice(ieeeAddr)) {

            return;
        }

        const friendlyName = settings.getDevice(ieeeAddr).friendly_name;
        
        this.discovered[ieeeAddr] = new HomieZigbeeNode(this, ieeeAddr, friendlyName, mappedModel);
        this.names[friendlyName] = this.discovered[ieeeAddr];
    }

    onMQTTMessage(topic, message) {
        if (!topic.startsWith(this.settings.baseTopic + "/")) {
            return;
        }

        var subtopic = topic.substring(this.settings.baseTopic.length + 1);
        if (!subtopic.endsWith("/set")) {
            return;
        }
    
        var fragments = subtopic.split('/');
        if (this.names.hasOwnProperty(fragments[0])) {
            let msg = message.toString('utf8');
            return this.names[fragments[0]].handleMQTT(topic, msg);
        }

        return;
    }

    onZigbeeMessage(message, device, mappedModel) {
        if (!device) {
            return
        }
        if (device.ieeeAddr && !this.discovered[device.ieeeAddr]) {
            if (!mappedModel && device.modelId) {
                mappedModel = zigbeeShepherdConverters.findByZigbeeModel(device.modelId);
            }
            if (mappedModel) {
                this.discover(device.ieeeAddr, mappedModel);
            }
        }
        if (device.ieeeAddr && this.discovered[device.ieeeAddr]) {
            this.discovered[device.ieeeAddr].handleZigbee(message);
        }
}

}

module.exports = Homie;
