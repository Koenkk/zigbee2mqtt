<div align="center">
    <a href="https://github.com/koenkk/zigbee2mqtt">
        <img width="150" height="150" src="images/logo.png">
    </a>
    <br>
    <br>
    <div style="display: flex;">
        <a href="https://github.com/Koenkk/zigbee2mqtt/actions?query=workflow%3Aci">
            <img src="https://github.com/koenkk/zigbee2mqtt/workflows/ci/badge.svg">
        </a>
        <a href="https://github.com/Koenkk/zigbee2mqtt/releases">
            <img src="https://img.shields.io/github/release/koenkk/zigbee2mqtt.svg">
        </a>
        <a href="https://github.com/Koenkk/zigbee2mqtt/stargazers">
            <img src="https://img.shields.io/github/stars/koenkk/zigbee2mqtt.svg">
        </a>
        <a href="https://www.paypal.me/koenkk">
            <img src="https://img.shields.io/badge/donate-PayPal-blue.svg">
        </a>
        <a href="https://discord.gg/dadfWYE">
            <img src="https://img.shields.io/discord/556563650429583360.svg">
        </a>
        <a href="http://zigbee2mqtt.discourse.group/">
            <img src="https://img.shields.io/discourse/https/zigbee2mqtt.discourse.group/status.svg">
        </a>
        <a>
            <img src="https://img.shields.io/badge/Coverage-100%25-brightgreen.svg">
        </a>
        <a href="https://www.codacy.com/manual/Koenkk/zigbee2mqtt?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=Koenkk/zigbee2mqtt&amp;utm_campaign=Badge_Grade">
            <img src="https://api.codacy.com/project/badge/Grade/24f1e0fe39f04daa810e8a1416693d3f">
        </a>
        <a href="https://www.npmjs.com/package/zigbee2mqtt">
            <img src="https://img.shields.io/npm/v/zigbee2mqtt">
        </a>
    </div>
    <h1>Zigbee2MQTT  🌉 🐝</h1>
    <p>
        Allows you to use your Zigbee devices <b>without</b> the vendor's bridge or gateway.
    </p>
    <p>
        It bridges events and allows you to control your Zigbee devices via MQTT. In this way you can integrate your Zigbee devices with whatever smart home infrastructure you are using.
    </p>
</div>

## [Getting started](https://www.zigbee2mqtt.io/guide/getting-started)

The [documentation](https://www.zigbee2mqtt.io/) provides you all the information needed to get up and running! Make sure you don't skip sections if this is your first visit, as there might be important details in there for you.

If you aren't familiar with **Zigbee** terminology make sure you [read this](https://www.zigbee2mqtt.io/advanced/zigbee/01_zigbee_network.html) to help you out.

## [Integrations](https://www.zigbee2mqtt.io/guide/usage/integrations.html)

Zigbee2MQTT integrates well with (almost) every home automation solution because it uses MQTT. However the following integrations are worth mentioning:

<img align="left" height="100px" width="100px" src="https://user-images.githubusercontent.com/7738048/40914297-49e6e560-6800-11e8-8904-36cce896e5a8.png">

### [Home Assistant](https://www.home-assistant.io/)

-   [Home Assistant OS](https://www.home-assistant.io/installation/): Using [the official addon](https://github.com/zigbee2mqtt/hassio-zigbee2mqtt)
-   Other installation: using instructions [here](https://www.zigbee2mqtt.io/guide/usage/integrations/home_assistant.html)

<br>

<img align="left" height="100px" width="100px" src="https://etc.athom.com/logo/white/256.png">

### [Homey](https://homey.app/)

-   Integration implemented in the [Homey App](https://homey.app/nl-nl/app/com.gruijter.zigbee2mqtt/)
-   Documentation and support in the [Homey Forum](https://community.homey.app/t/83214)

<br>

<img align="left" height="100px" width="100px" src="https://user-images.githubusercontent.com/2734836/47615848-b8dd8700-dabd-11e8-9d77-175002dd8987.png">

### [Domoticz](https://www.domoticz.com/)

-   Integration implemented in Domoticz ([documentation](https://www.domoticz.com/wiki/Zigbee2MQTT)).

<br>

<img align="left" height="100px" width="100px" src="./images/gladys-assistant-logo.jpg">

### [Gladys Assistant](https://gladysassistant.com/)

-   Integration implemented natively in Gladys Assistant ([documentation](https://gladysassistant.com/docs/integrations/zigbee2mqtt/)).

<br>

<img align="left" height="100px" width="100px" src="https://forum.iobroker.net/assets/uploads/system/site-logo.png">

### [IoBroker](https://www.iobroker.net/)

-   Integration implemented in IoBroker ([documentation](https://github.com/o0shojo0o/ioBroker.zigbee2mqtt)).

<br>

## Architecture

![Architecture](images/architecture.png)

### Internal Architecture

Zigbee2MQTT is made up of three modules, each developed in its own Github project. Starting from the hardware (adapter) and moving up; [zigbee-herdsman](https://github.com/koenkk/zigbee-herdsman) connects to your Zigbee adapter and makes an API available to the higher levels of the stack. For e.g. Texas Instruments hardware, zigbee-herdsman uses the [TI zStack monitoring and test API](https://github.com/koenkk/zigbee-herdsman/raw/master/docs/Z-Stack%20Monitor%20and%20Test%20API.pdf) to communicate with the adapter. Zigbee-herdsman handles the core Zigbee communication. The module [zigbee-herdsman-converters](https://github.com/koenkk/zigbee-herdsman-converters) handles the mapping from individual device models to the Zigbee clusters they support. [Zigbee clusters](https://github.com/Koenkk/zigbee-herdsman/blob/master/docs/07-5123-08-Zigbee-Cluster-Library.pdf) are the layers of the Zigbee protocol on top of the base protocol that define things like how lights, sensors and switches talk to each other over the Zigbee network. Finally, the Zigbee2MQTT module drives zigbee-herdsman and maps the zigbee messages to MQTT messages. Zigbee2MQTT also keeps track of the state of the system. It uses a `database.db` file to store this state; a text file with a JSON database of connected devices and their capabilities. Zigbee2MQTT provides a [web-based interface](https://github.com/nurikk/zigbee2mqtt-frontend) that allows monitoring and configuration.

### Developing

Zigbee2MQTT uses TypeScript (partially for now). Therefore after making changes to files in the `lib/` directory you need to recompile Zigbee2MQTT. This can be done by executing `npm run build`. For faster development instead of running `npm run build` you can run `npm run build-watch` in another terminal session, this will recompile as you change files.
In first time before building you need to run `npm install --include=dev`
Before submitting changes run `npm run test-with-coverage`, `npm run pretty:check` and `npm run eslint`

## Supported devices

See [Supported devices](https://www.zigbee2mqtt.io/supported-devices) to check whether your device is supported. There is quite an extensive list, including devices from vendors like [Xiaomi](https://www.zigbee2mqtt.io/supported-devices/#v=Xiaomi), [Ikea](https://www.zigbee2mqtt.io/supported-devices/#v=IKEA), [Philips](https://www.zigbee2mqtt.io/supported-devices/#v=Philips), [OSRAM](https://www.zigbee2mqtt.io/supported-devices/#v=OSRAM) and more.

If it's not listed in [Supported devices](https://www.zigbee2mqtt.io/supported-devices), support can be added (fairly) easily, see [How to support new devices](https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html).

## Support & help

If you need assistance you can check [opened issues](https://github.com/Koenkk/zigbee2mqtt/issues). Feel free to help with Pull Requests when you were able to fix things or add new devices or just share the love on social media.
