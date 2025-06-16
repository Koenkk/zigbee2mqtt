import Extension from "./extension";
export declare const loadTopicGetSetRegex: () => void;
interface ParsedTopic {
    ID: string;
    endpoint: string | undefined;
    attribute: string;
    type: "get" | "set";
}
export default class Publish extends Extension {
    start(): Promise<void>;
    parseTopic(topic: string): ParsedTopic | undefined;
    parseMessage(parsedTopic: ParsedTopic, data: eventdata.MQTTMessage): KeyValue | undefined;
    updateMessageHomeAssistant(message: KeyValue, entityState: KeyValue): void;
    onMQTTMessage(data: eventdata.MQTTMessage): Promise<void>;
    private getDefinitionConverters;
}
export {};
//# sourceMappingURL=publish.d.ts.map