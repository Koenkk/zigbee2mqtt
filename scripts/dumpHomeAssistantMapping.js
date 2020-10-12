const HomeAssistant = require('../lib/extension/homeassistant');
const stringify = require('json-stable-stringify-without-jsonify');
const homeassistant = new HomeAssistant(null, null, null, null, {on: () => {}});
const mapping = Object.entries(homeassistant._getMapping());
mapping.sort((a, b) => {
    if (a[0] > b[0]) {
        return -1;
    }
    if (b[0] > a[0]) {
        return 1;
    }
    return 0;
});

for (const map of mapping) {
    map[1].sort((a, b) => {
        return JSON.stringify(a).localeCompare(JSON.stringify(b));
    });

    const toDelete = [];
    for (const entry of map[1]) {
        if (entry.type === 'light') {
            if (entry.discovery_payload.brightness === false) delete entry.discovery_payload.brightness;
            if (entry.discovery_payload.color_temp === false) delete entry.discovery_payload.color_temp;
            if (entry.discovery_payload.xy === false) delete entry.discovery_payload.xy;
            if (entry.discovery_payload.hs === false) delete entry.discovery_payload.hs;
        } else if (entry.object_id === 'linkquality') {
            toDelete.push(entry);
        }
    }

    toDelete.forEach((d) => map[1].splice(map[1].indexOf(d), 1));

    console.log(`${map[0]} - ${stringify(map[1])}`);
}
