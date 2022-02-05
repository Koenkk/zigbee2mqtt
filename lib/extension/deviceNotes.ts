import * as settings from '../util/settings';
import utils from '../util/utils';
import fs from 'fs';
import data from '../util/data';
import path from 'path';
import logger from '../util/logger';
import stringify from 'json-stable-stringify-without-jsonify';
import bind from 'bind-decorator';
import Extension from './extension';

const notesExtension = '.txt';
const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/device/notes/(read|save)`);

export default class DeviceNotes extends Extension {
    private requestLookup: {[s: string]: (device: Device, message: KeyValue) => Promise<MQTTResponse>};

    override async start(): Promise<void> {
        this.requestLookup = {'read': this.getNotes, 'save': this.saveNotes};
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }

    private getExtensionsBasePath(): string {
        return data.joinPath('notes');
    }

    private getDevice(id: string): Device {
        const re = this.zigbee.resolveEntity(id);
        if (re != null && re.isDevice()) {
            return re;
        }
    }

    @bind private async saveNotes(device: Device, message: KeyValue): Promise<MQTTResponse> {
        const {notes} = message;
        const basePath = this.getExtensionsBasePath();
        const filePath = path.join(basePath, path.basename(`${device.ieeeAddr}${notesExtension}`));

        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath);
        }

        fs.writeFileSync(filePath, notes, 'utf-8');
        logger.info(`Notes for ${device.name} updated`);
        return utils.getResponse(message, {}, null);
    }

    @bind private async getNotes(device: Device, message: KeyValue): Promise<MQTTResponse> {
        const basePath = this.getExtensionsBasePath();
        const filePath = path.join(basePath, path.basename(`${device.ieeeAddr}${notesExtension}`));

        let mtime: string;
        let notes: string;
        if (!fs.existsSync(filePath)) {
            mtime = null;
            notes = '';
        } else {
            mtime = fs.statSync(filePath).mtime.toISOString();
            notes = fs.readFileSync(filePath, 'utf8');
        }

        logger.info(`Notes for ${device.name} requested`);
        return utils.getResponse(message, {notes: notes, mtime: mtime}, null);
    }

    @bind async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        if (data.topic.match(requestRegex)) {
            const match = data.topic.match(requestRegex);
            if (match && this.requestLookup[match[1].toLowerCase()]) {
                const message = utils.parseJSON(data.message, data.message) as KeyValue;
                try {
                    const {id} = message;
                    const device = this.getDevice(id);
                    if (device == null) {
                        throw new Error(`Device '${id}' is unknown`);
                    }

                    const response = await this.requestLookup[match[1].toLowerCase()](device, message);
                    await this.mqtt.publish(`bridge/response/device/notes/${match[1]}`, stringify(response));
                } catch (error) {
                    logger.error(`Request '${data.topic}' failed with error: '${error.message}'`);
                    const response = utils.getResponse(message, {}, error.message);
                    await this.mqtt.publish(`bridge/response/device/notes/${match[1]}`, stringify(response));
                }
            }
        }
    }
}
