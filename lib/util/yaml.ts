import yaml from 'js-yaml';
import fs from 'fs';
import equals from 'fast-deep-equal/es6';

function read(file: string): KeyValue {
    try {
        return yaml.load(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.name === 'YAMLException') {
            error.file = file;
        }

        throw error;
    }
}

function readIfExists(file: string, default_?: KeyValue): KeyValue {
    return fs.existsSync(file) ? read(file) : default_;
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
