const assert = require('assert');
const filename = process.argv[2];
const converter = require('./' + filename);
assert(!converter.toZigbee.includes(undefined));
assert(!converter.fromZigbee.includes(undefined));
