# Contributing to Zigbee2MQTT

Everybody is invited and welcome to contribute to Zigbee2MQTT. Zigbee2MQTT is writen in JavaScript and is based upon [zigbee-herdsman](https://github.com/koenkk/zigbee-herdsman) and [zigbee-herdsman-converters](https://github.com/koenkk/zigbee-herdsman-converters). Zigbee-herdsman-converters contains all device definition, zigbee-herdsman is responsible for handling all communication with the adapter.

- Pull requests are always created against the [**dev**](https://github.com/Koenkk/zigbee2mqtt/tree/dev) branch.
- Easiest way to start developing Zigbee2MQTT is by setting up a development environment (aka bare-metal installation). You can follow this [guide](https://www.zigbee2mqtt.io/getting_started/running_zigbee2mqtt.html#running-zigbee2mqtt) to do this.
- You can run the tests locally by executing `npm test`. Zigbee2MQTT enforces 100% code coverage, in case you add new code check if you code is covered by running `npm run test-with-coverage`. The coverage report can be found under `coverage/lcov-report/index.html`. Linting is also enforced and can be run with `npm run eslint`.
- When you want to add support for a new devices no changes to Zigbee2MQTT have to be made, only to zigbee-herdsman-converters. You can find a guide for it [here](https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html).
