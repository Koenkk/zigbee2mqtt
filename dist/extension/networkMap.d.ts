import type { Zigbee2MQTTNetworkMap } from "../types/api";
import Extension from "./extension";
/**
 * This extension creates a network map
 */
export default class NetworkMap extends Extension {
    #private;
    start(): Promise<void>;
    onMQTTMessage(data: eventdata.MQTTMessage): Promise<void>;
    raw(topology: Zigbee2MQTTNetworkMap): Zigbee2MQTTNetworkMap;
    graphviz(topology: Zigbee2MQTTNetworkMap): string;
    plantuml(topology: Zigbee2MQTTNetworkMap): string;
    networkScan(includeRoutes: boolean): Promise<Zigbee2MQTTNetworkMap>;
}
//# sourceMappingURL=networkMap.d.ts.map