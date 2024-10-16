const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const filename = process.argv[2];
const moduleCode = fs.readFileSync(filename);
const moduleFakePath = path.join(__dirname, 'externally-loaded.js');
const sandbox = {
    require: require,
    module: {},
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
};
vm.runInNewContext(moduleCode, sandbox, moduleFakePath);
const converter = sandbox.module.exports;
assert(!converter.toZigbee || !converter.toZigbee.includes(undefined));
assert(!converter.fromZigbee || !converter.fromZigbee.includes(undefined));
