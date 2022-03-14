const fs = require('fs');
const filename = process.argv[2];
const text = fs.readFileSync(filename, 'utf8');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');


for (const line of text.split('\n')) {
    const model = zigbeeHerdsmanConverters.devices.find((d) => d.model === line);
    if (!model) throw new Error(`${line} does not exist`);
    console.log(`- \`${line}\` ${model.vendor} ${model.description}`);
}
