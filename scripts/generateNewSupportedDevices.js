const fs = require('fs');
const filename = process.argv[2];
const text = fs.readFileSync(filename, 'utf8');
const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');


for (const line of text.split('\n')) {
    const [modelNumber, user] = line.split(',').map((t) => t.trim());
    const model = zigbeeHerdsmanConverters.devices.find((d) => d.model === modelNumber);
    if (!model) throw new Error(`${line} does not exist`);
    console.log(`- \`${modelNumber}\` ${model.vendor} ${model.description} (${user})`);
}
