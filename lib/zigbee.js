const ZShepherd = require('zigbee-shepherd');
const logger = require('./util/logger');
const settings = require('./util/settings');
const deviceMapping = require('./devices');
const data = require('./util/data');

const shepherdSettings = {
    net: {
        panId: settings.get().advanced.pan_id,
        channelList: [settings.get().advanced.hasOwnProperty('channel')
            ? settings.get().advanced.channel
            : 11]
    },
    dbPath: data.joinPath('database.db')
};

function getTimestamp() {
    var d = new Date();
    return d.getTime();
}

class Zigbee {
    constructor() {
        this.handleReady = this.handleReady.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.checkOnlineTimer = null;
        this.lastDeviceActivity = {}; // timestamps of last data/activity
        this.lastControllerActivity = 0;
    }

    start(onMessage, callback) {
        logger.info(`Starting zigbee-shepherd`);

        this.lastDeviceActivity = {};

        this.shepherd = new ZShepherd(settings.get().serial.port, shepherdSettings);

        // TO-DO: Shepherd may crash here in case of any problems with a COM port (not present, busy)
        // Try re-open it after some time. It will be very useful in headless autonomous systems
        this.shepherd.start((error) => {
            if (error) {
                logger.error('Error while starting zigbee-shepherd!');
            } else {
                logger.info('zigbee-shepherd started');
            }

            callback(error);
        });

        // Register callbacks.
        this.shepherd.on('ready', this.handleReady);
        this.shepherd.on('ind', this.handleMessage);

        // this event may appear if zigbee lib cannot decode bad packets (Invalid checksum)
        this.shepherd.on('error', this.handleError);

        this.onMessage = onMessage;
    }

    stop(callback) {
        if(this.checkOnlineTimer) {
            clearTimeout(this.checkOnlineTimer);
            this.checkOnlineTimer = null;
        }

        this.shepherd.stop((error) => {
            logger.info('zigbee-shepherd stopped');
            callback(error);            
            this.lastDeviceActivity = {};
        });
    }

    handleReady() {
        logger.info('zigbee-shepherd ready');

        const devices = this.getAllClients();

        logger.info(`Currently ${devices.length} devices are joined:`);
        devices.forEach((device) => logger.info(this.getDeviceLogMessage(device)));

        // Set all Xiaomi devices (manufId === 4151) to be online, so shepherd won't try
        // to query info from devices (which would fail because they go tosleep).
        // Xiaomi lumi.plug has manufId === 4447 and can be in the sleep mode too
        devices.forEach((device) => {
            if ((device.manufId === 4151)/* || (device.manufId === 4447)*/){
                this.setLastDeviceActivity(device.ieeeAddr);
                this.shepherd.find(device.ieeeAddr, 1).getDevice().update({
                    status: 'online',
                    joinTime: Math.floor(Date.now()/1000)
                });
            }
        });

        // Set timer at interval to check online status of Zigbee routers.
        // For example, it prevents Xiaomi routers to go to a deep sleep mode
        const interval = 1 * 1000; // seconds * 1000.
        this.checkOnlineTimer = setTimeout(this.checkOnline.bind(this), interval);
        this.lastControllerActivity = getTimestamp();
    }

    permitJoin(permit) {
        if (permit) {
            logger.info('Zigbee: allowing new devices to join.');
        } else {
            logger.info('Zigbee: disabling joining new devices.');
        }

        this.shepherd.permitJoin(permit ? 255 : 0, (error) => {
            if (error) {
                logger.info(error);
            }
        });
    }

    getAllClients() {
        return this.shepherd.list().filter((device) => device.type !== 'Coordinator');
    }

    handleMessage(message) {
        if (message.endpoints && (message.endpoints.length > 0))
        {
            //TO-DO publish last activity timestamp to MQTT / bridge / state / last_data_timestamp
            //allows to diagnose problems from GUI without logs
            var ep = message.endpoints[0];
            if (ep.device)
            {
              this.setLastDeviceActivity(ep.device.ieeeAddr);
            }
        }

        if (this.onMessage) {
            this.onMessage(message);
        }
    }

    handleError(message) {
        logger.error(message);
    }

    getDeviceLogMessage(device) {
        let friendlyName = 'unknown';
        let friendlyDevice = {model: 'unkown', description: 'unknown'};

        if (deviceMapping[device.modelId]) {
            friendlyDevice = deviceMapping[device.modelId];
        }

        if (settings.getDevice(device.ieeeAddr)) {
            friendlyName = settings.getDevice(device.ieeeAddr).friendly_name
        }

        return `${friendlyName} (${device.ieeeAddr}): ${friendlyDevice.model} - ${friendlyDevice.vendor} ${friendlyDevice.description}`;
    }

    getDevice(deviceID) {
        return this.shepherd.list().find((d) => d.ieeeAddr === deviceID);
    }

    publish(deviceID, cId, cmd, zclData, ep, callback) {
        // Find device in zigbee-shepherd
        let device = this.getDevice(deviceID);
        if (!device || !device.epList || !device.epList.length) {
            logger.error(`Zigbee cannot determine endpoint for '${deviceID}'`);
            return;
        }

        ep = ep ? ep : device.epList[0];
        device = this.shepherd.find(deviceID, ep);

        if (!device) {
            logger.error(`Zigbee cannot publish message to device because '${deviceID}' is not known by zigbee-shepherd`);
            return;
        }

        logger.info(`Zigbee publish to '${deviceID}', ${cId} - ${cmd} - ${JSON.stringify(zclData)} - ${ep}`);
        device.functional(cId, cmd, zclData, callback);
    }

    setLastDeviceActivity(ieeeAddr) {
        this.lastDeviceActivity[ieeeAddr] = getTimestamp();
    }

    checkOnline() {
          var dt = getTimestamp();

          if ((dt - this.lastControllerActivity) > 3600000) {
            // no data received in 1 hour.
            // This problem may occur sometimes with CC2531 (USB devices can be pluged/unpluged by a PnP system)           
            // try to restart and self-recovery
            this.checkOnlineTimer = null;
            this.lastControllerActivity = dt;
            this.lastDeviceActivity = {};
            logger.warn('Soft restart');
            this.shepherd.reset('soft', (err) => {
                if(err){
                    logger.warn('Soft reset error:', err);
                        this.stop( (err) => {
                            logger.warn('Stop:', err);
                            this.start(this.onMessage, () => {});
                        });
                }
                else{
                    this.checkOnlineTimer = setTimeout(this.checkOnline.bind(this), 1000);
                }
            });
            return;
          }

          var handleCheckOnlineResp = function(err) {
            if (err) {
              logger.error('Check online result [ Device:', this.getDeviceLogMessage(this.device), ', Command:', this.command, ', Error:', err, ']');
              // TO-DO: publish a last error message to MQTT / bridge / state / last_error
              // allows to diagnose problems without logs
              // publish_error(err);
            }
          };

          var device, devInfo, devType, power, dev_desc;
          for (device in this.lastDeviceActivity) {
            if ((dt - this.lastDeviceActivity[device]) > 60000) {
              this.lastDeviceActivity[device] = dt;

              devInfo = this.shepherd._findDevByAddr(device);
              if (devInfo) {
                // battery powered endpoint devices are in the sleep mode most time
                if(devInfo.powerSource){
                    power = devInfo.powerSource.toLowerCase().split(' ')[0];
                }
                else{
                    power = 'unknown';
                }
                devType = devInfo.type.toLowerCase();
                if (
                  ((power !== 'battery') && (power !== 'unknown')) ||
                  (devType === 'router')
                ) {
                    dev_desc = this.getDeviceLogMessage(devInfo);
                    logger.info('Data timeout for device:', dev_desc, ' Checking online status.');
                    this.shepherd.controller.checkOnline(devInfo, handleCheckOnlineResp.bind({
                        device: devInfo,
                        command: 'nodeDescReq'
                    }));
                }
              }
            }
          }

          this.checkOnlineTimer = setTimeout(this.checkOnline.bind(this), 1000);
          return;
    }

}

module.exports = Zigbee;
