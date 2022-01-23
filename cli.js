#!/usr/bin/env node
const path = require('path');

if (!process.env['ZIGBEE2MQTT_DATA']) {
	
	if (process.env['HOME']) {
		process.env['ZIGBEE2MQTT_DATA'] = process.env['ZIGBEE2MQTT_DATA'] || path.join(process.env['HOME'], '.z2m');
	} else if (process.cwd()) {
		process.env['ZIGBEE2MQTT_DATA'] = path.join(process.cwd(), 'data');
	}
}
	
console.log('DataDir ' + process.env['ZIGBEE2MQTT_DATA']);
require('./index');
