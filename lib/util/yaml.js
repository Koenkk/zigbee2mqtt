const yaml = require('js-yaml');
const fs = require('fs');

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

function write(file, content) {
    fs.writeFileSync(file, yaml.safeDump(content));
}

module.exports = {read, readIfExists, write};
