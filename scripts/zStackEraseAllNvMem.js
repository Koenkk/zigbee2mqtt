const {ZnpCommandStatus, NvSystemIds} = require('zigbee-herdsman/dist/adapter/z-stack/constants/common');
const {ZnpVersion} = require('zigbee-herdsman/dist/adapter/z-stack/adapter/tstype');
const {Subsystem} = require('zigbee-herdsman/dist/adapter/z-stack/unpi/constants');
const {Znp} = require('zigbee-herdsman/dist/adapter/z-stack/znp');


class ZStackNvMemEraser {
    constructor(device) {
        this.znp = new Znp(device, 115200, false);
    }

    async start() {
        await this.znp.open();
        const attempts = 3;
        for (let i = 0; i < attempts; i++) {
            try {
                await this.znp.request(Subsystem.SYS, 'ping', {capabilities: 1});
                break;
            } catch (e) {
                if (attempts - 1 === i) {
                    throw new Error(`Failed to connect to the adapter (${e})`);
                }
            }
        }
        // Old firmware did not support version, assume it's Z-Stack 1.2 for now.
        try {
            this.version = (await this.znp.request(Subsystem.SYS, 'version', {})).payload;
        } catch (e) {
            console.log(`Failed to get zStack version, assuming 1.2`);
            this.version = {'transportrev': 2, 'product': 0, 'majorrel': 2,
                'minorrel': 0, 'maintrel': 0, 'revision': ''};
        }

        console.log(`Detected znp version '${ZnpVersion[this.version.product]}' (${JSON.stringify(this.version)})`);

        await this.clearAllNvMemItems();

        process.exit(0);
    }

    async clearAllNvMemItems() {
        let maxNvMemId;
        switch (this.version.product) {
        case ZnpVersion.zStack12: maxNvMemId = 0x0302; break;
        case ZnpVersion.zStack30x: maxNvMemId = 0x033F; break;
        case ZnpVersion.zStack3x0: maxNvMemId = 0x032F; break;
        }

        let deletedCount = 0;
        console.log(`Clearing all NVMEM items, from 0 to ${maxNvMemId}`);
        for (let id=0; id<=maxNvMemId; id++) {
            let len;
            const needOsal = !(this.version.product == ZnpVersion.zStack3x0 && id <= 7);
            if (needOsal) {
                const lengthRes = await this.znp.request(Subsystem.SYS, 'osalNvLength', {id: id});
                len = lengthRes.payload['length'];
            } else {
                const lengthRes = await this.znp.request(Subsystem.SYS, 'nvLength',
                    {sysid: NvSystemIds.ZSTACK, itemid: id, subid: 0});
                len = lengthRes.payload['len'];
            }
            if (len != 0) {
                console.log(`NVMEM item #${id} - deleting, size: ${len}`);
                if (needOsal) {
                    await this.znp.request(Subsystem.SYS, 'osalNvDelete',
                        {id: id, len: len},
                        null, [ZnpCommandStatus.SUCCESS, ZnpCommandStatus.NV_ITEM_INITIALIZED]);
                } else {
                    await this.znp.request(Subsystem.SYS, 'nvDelete',
                        {sysid: NvSystemIds.ZSTACK, itemid: id, subid: 0},
                        null, [ZnpCommandStatus.SUCCESS, ZnpCommandStatus.NV_ITEM_INITIALIZED]);
                }
                deletedCount++;
            }
        }
        console.log(`Clearing all NVMEM items finished, deleted ${deletedCount} items`);
    }
}
const processArgs = process.argv.slice(2);
if (processArgs.length != 1) {
    console.log('ZStack NVMEM eraser.');
    console.log('Usage:');
    console.log('   node zStackEraseAllNvMem.js <SERIAL_PORT>');
    process.exit(1);
}

const eraser = new ZStackNvMemEraser(processArgs[0]);

eraser.start();
