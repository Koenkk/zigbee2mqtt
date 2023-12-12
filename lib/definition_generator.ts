import {default as HerdsmanDevice } from 'zigbee-herdsman/dist/controller/model/device';
import {default as fz} from 'zigbee-herdsman-converters/converters/fromZigbee';
import {default as tz} from 'zigbee-herdsman-converters/converters/toZigbee';
import * as exposes from 'zigbee-herdsman-converters/lib/exposes';
import { Configure, Logger } from 'zigbee-herdsman-converters/lib/types';
import * as reporting from 'zigbee-herdsman-converters/lib/reporting';
import logger from './util/logger';
import * as zhc from 'zigbee-herdsman-converters';

const e = exposes.presets;

// This is the type that will change definition based on some defined conditions.
type definitionModifier = (endpoint: zh.Endpoint) => Partial<zhc.Definition>;

export default class DefinitionGenerator {
    generate(device: HerdsmanDevice): zhc.Definition {
        const configs: Configure[] = [];

        const definition: zhc.Definition = {
            model: device.modelID || '',
            zigbeeModel: [device.modelID || 'custom'],
            toZigbee: [tz.read as any, tz.write, tz.command, tz.factory_reset],
            fromZigbee: [],
            description: '',
            options: [],
            vendor: device.manufacturerName || 'custom',
            exposes: [],
            configure: async (device: zh.Device, coordinatorEndpoint: zh.Endpoint, lgr: Logger) => {
                for (let i = 0; i < configs.length; i++) {
                    await configs[i](device, coordinatorEndpoint, lgr)
                }
            },
        };

        let definitionUpdated = false;

        device.endpoints.forEach(endpoint => {
            const clusters = endpoint.getInputClusters();

            clusters.forEach(cluster => {
                const generator = modifiers[cluster.name || cluster.ID.toString()]
                if (!generator) {
                    logger.debug(`Device '${device.modelID}' (ieeeAddr ${device.ieeeAddr}) has unknown cluster for generation: ${cluster.name}`);
                    return;
                }

                definitionUpdated = true;
                const partialDefinition = generator(endpoint);
                this.mergeDefinitions(definition, partialDefinition, configs)
            })
        })
        // Do not provide definition if we didn't generate anything
        if (!definitionUpdated) {
            return null;
        }

        return definition
    }

    private mergeDefinitions(into: zhc.Definition, from: Partial<zhc.Definition>, configs: Configure[]) {
        if (from.fromZigbee) {
            if (!into.fromZigbee) {
                into.fromZigbee = [];
            }
    
            into.fromZigbee.push(...from.fromZigbee);
        }
    
        if (from.toZigbee) {
            if (!into.toZigbee) {
                into.toZigbee = [];
            }
    
            into.toZigbee.push(...from.toZigbee);
        }
    
        if (from.exposes) {
            if (!into.exposes) {
                into.exposes = [];
            }
    
            (into.exposes as zhc.Expose[]).push(...(from.exposes as zhc.Expose[]))
        }
    
        if (from.configure !== undefined) {
            configs.push(from.configure);
        }
    }
}

const modifiers: {[clusterName: string]: definitionModifier} = {
    'genBasic': (_: zh.Endpoint): Partial<zhc.Definition> =>{
        return {
            fromZigbee: [fz.linkquality_from_basic as any],
            exposes: [e.linkquality() as any],
        }
    },
    'genIdentify': (_: zh.Endpoint): Partial<zhc.Definition> => {
        return {
            toZigbee: [tz.identify as any],
        }
    },
    'msTemperatureMeasurement': (endpoint: zh.Endpoint): Partial<zhc.Definition> => {
        return {
            fromZigbee: [fz.temperature as any],
            exposes: [e.temperature() as any],
            configure: async (device: zh.Device, coordinatorEndpoint: zh.Endpoint, logger: Logger) => {
                await reporting.bind(endpoint, coordinatorEndpoint, ['msTemperatureMeasurement']);
                await reporting.temperature(endpoint);
            }
        }
    },
    'msPressureMeasurement': (endpoint: zh.Endpoint): Partial<zhc.Definition> => {
        return {
            fromZigbee: [fz.pressure as any],
            exposes: [e.pressure() as any],
            configure: async (device: zh.Device, coordinatorEndpoint: zh.Endpoint, logger: Logger) => {
                await reporting.bind(endpoint, coordinatorEndpoint, ['msPressureMeasurement']);
                await reporting.pressure(endpoint);
            }
        }
    },
    'msRelativeHumidity': (endpoint: zh.Endpoint): Partial<zhc.Definition> => {
        return {
            fromZigbee: [fz.humidity as any],
            exposes: [e.humidity() as any],
            configure: async (device: zh.Device, coordinatorEndpoint: zh.Endpoint, logger: Logger) => {
                await reporting.bind(endpoint, coordinatorEndpoint, ['msRelativeHumidity']);
                await reporting.humidity(endpoint);
            }
        }
    },
}