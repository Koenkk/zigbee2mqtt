import yaml from 'js-yaml';
import fs from 'fs';
import equals from 'fast-deep-equal/es6';

function read(file: string): Record<string, unknown> {
    try {
        // eslint-disable-next-line
        // @ts-ignore
        return yaml.load(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.name === 'YAMLException') {
            error.file = file;
        }

        throw error;
    }
}

function readIfExists(file: string, default_?: Record<string, unknown>): Record<string, unknown> {
    return fs.existsSync(file) ? read(file) : default_;
}

function writeIfChanged(file: string, content: Record<string, unknown>): void {
    const before = readIfExists(file);
    if (!equals(before, content)) {
        fs.writeFileSync(file, yaml.dump(content));
    }
}

function updateIfChanged(file: string, key: string, value: unknown): void {
    const content = read(file);
    if (content[key] !== value) {
        content[key] = value;
        writeIfChanged(file, content);
    }
}

module.exports = {read, readIfExists, writeIfChanged, updateIfChanged};
