const yaml = require('js-yaml');
const fs = require('fs');

function read(file) {
    return yaml.safeLoad(fs.readFileSync(file, 'utf8'));
}

function readIfExists(file) {
    return fs.existsSync(file) ? read(file) : null;
}

function write(file, content) {
    fs.writeFileSync(file, yaml.safeDump(content));
}

module.exports = {read, readIfExists, write};
