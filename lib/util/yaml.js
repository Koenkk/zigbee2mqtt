const yaml = require('js-yaml');
const fs = require('fs');
const equals = require('fast-deep-equal');

function read(file) {
    try {
        return yaml.safeLoad(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.name === 'YAMLException') {
            error.message =
                `\n\n\n` +
                `\t====================================================================\n` +
                `\tYour YAML file '${file}' is invalid\n` +
                `\tUse e.g. https://jsonformatter.org/yaml-validator to find and fix the issue.\n` +
                `\t====================================================================\n` +
                `\n\n` +
                error.message;
        }


        throw error;
    }
}

function readIfExists(file) {
    return fs.existsSync(file) ? read(file) : null;
}

function writeIfChanged(file, content) {
    const before = readIfExists(file);
    if (!equals(before, content)) {
        fs.writeFileSync(file, yaml.safeDump(content));
    }
}

function updateIfChanged(file, key, value) {
    const content = read(file);
    if (content[key] !== value) {
        content[key] = value;
        writeIfChanged(file, content);
    }
}

module.exports = {read, readIfExists, writeIfChanged, updateIfChanged};
