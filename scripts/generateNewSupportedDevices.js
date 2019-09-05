const fs = require('fs');
const filename = process.argv[2];
const text = fs.readFileSync(filename, 'utf8');
const zigbeeShepherdConverters = require('zigbee-shepherd-converters');


for (const line of text.split('\n')) {
    const model = zigbeeShepherdConverters.devices.find((d) => d.model === line);
    console.log(`- \`${line}\` ${model.vendor} ${model.description}`);
}
