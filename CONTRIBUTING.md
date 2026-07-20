# Contributing to Zigbee2MQTT

> [!WARNING]
> Any AI-driven pull request with more than 500 lines of code will not be considered. If wanting to submit something that requires more, split the work into easily review-able pull requests that can be introduced in increments (e.g. pre-refactor, base feature, additional features).

Everybody is invited and welcomed to contribute to Zigbee2MQTT.
Zigbee2MQTT is written in TypeScript.
It uses [zigbee-herdsman](https://github.com/koenkk/zigbee-herdsman) for communication with the adapter/coordinator and [zigbee-herdsman-converters](https://github.com/koenkk/zigbee-herdsman-converters) to provide device-specific definitions.

- Pull requests are always created against the [**dev**](https://github.com/Koenkk/zigbee2mqtt/tree/dev) branch.
- Easiest way to start developing Zigbee2MQTT is by setting up a development environment (a.k.a. bare-metal installation). You can follow this [guide](https://www.zigbee2mqtt.io/guide/installation/01_linux.html) to do this.
- You can run the tests locally by executing `pnpm test`. Zigbee2MQTT enforces 100% code coverage, in case you add new code check if your code is covered by running `pnpm run test:coverage`. The coverage report can be found under `coverage/lcov-report/index.html`.
- Linting & formatting is also enforced and can be run with `pnpm run check` (can use `pnpm run check:w` to fix small issues automatically).
- If you want to add support for a new device no change to Zigbee2MQTT has to be made, only to zigbee-herdsman-converters. You can find a guide for it [here](https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html).