import fs from 'fs';

import equals from 'fast-deep-equal/es6';
import yaml, {YAMLException} from 'js-yaml';

export class YAMLFileException extends YAMLException {
    file: string;

    constructor(error: YAMLException, file: string) {
        super(error.reason, error.mark);

        this.name = 'YAMLFileException';
        this.cause = error.cause;
        this.message = error.message;
        this.stack = error.stack;
        this.file = file;
    }
}

function read(file: string): KeyValue {
    try {
        const result = yaml.load(fs.readFileSync(file, 'utf8'));
        return (result as KeyValue) ?? {};
    } catch (error) {
        if (error instanceof YAMLException) {
            throw new YAMLFileException(error, file);
        }

        throw error;
    }
}

function readIfExists(file: string, fallback: KeyValue = {}): KeyValue {
    return fs.existsSync(file) ? read(file) : fallback;
}

function writeIfChanged(file: string, content: KeyValue): void {
    const before = readIfExists(file);

    if (!equals(before, content)) {
        fs.writeFileSync(file, yaml.dump(content));
    }
}

function updateIfChanged(file: string, key: string, value: KeyValue): void {
    const content = read(file);
    if (content[key] !== value) {
        content[key] = value;
        writeIfChanged(file, content);
    }
}

export default {read, readIfExists, updateIfChanged, writeIfChanged};
