const yaml = require('js-yaml');
const fs = require('fs');

function readYaml(file) {
    return yaml.safeLoad(fs.readFileSync(file, 'utf8'));
}

function readYamlIfExists(file) {
    return fs.existsSync(file) ? readYaml(file) : null;
}

function writeYaml(file, content) {
    fs.writeFileSync(file, yaml.safeDump(content));
}

module.exports = {readYaml, readYamlIfExists, writeYaml};
