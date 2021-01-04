<div align="center">
    <a href="https://github.com/koenkk/zigbee2mqtt">
        <img width="150" height="150" src="images/logo.png">
    </a>
    <br>
    <br>
    <div style="display: flex;">
        <a href="https://github.com/Koenkk/zigbee2mqtt/actions?query=workflow%3ACI">
            <img src="https://github.com/koenkk/zigbee2mqtt/workflows/CI/badge.svg">
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
        Allows you to use your Zigbee devices <b>without</b> the vendors bridge or gateway.
    </p>
    <p>
        It bridges events and allows you to control your Zigbee devices via MQTT. In this way you can integrate your Zigbee devices with whatever smart home infrastructure you are using.
    </p>
</div>

## [Getting started](https://www.zigbee2mqtt.io/#getting-started)
The [documentation](https://www.zigbee2mqtt.io/) provides you all the information needed to get up and running! Make sure you don't skip sections if this is your first visit, as there might be important details in there for you.

If you aren't familiar with **Zigbee** terminology make sure you [read this](https://www.zigbee2mqtt.io/information/zigbee_network.html) to help you out.

## [Integrations](https://www.zigbee2mqtt.io/#integration)
Zigbee2MQTT integrates well with (almost) every home automation solution because it uses MQTT. However the following integrations are worth mentioning:

<img align="left" height="100px" width="100px" src="https://user-images.githubusercontent.com/7738048/40914297-49e6e560-6800-11e8-8904-36cce896e5a8.png">

### [Home Assistant](https://www.home-assistant.io/)
- [Home Assistant](https://www.home-assistant.io/hassio/): Using [the official addon](https://github.com/zigbee2mqtt/hassio-zigbee2mqtt)
- Generic install or Hassbian: Using instructions [here](https://www.zigbee2mqtt.io/integration/home_assistant.html)

<img align="left" height="100px" width="100px" src="https://user-images.githubusercontent.com/2734836/47615848-b8dd8700-dabd-11e8-9d77-175002dd8987.png">

### [Domoticz](https://www.domoticz.com/)
- Integration implemented in [domoticz-zigbee2mqtt-plugin](https://github.com/stas-demydiuk/domoticz-zigbee2mqtt-plugin)

<br>

## Architecture
![Architecture](images/architecture.png)

### Internal Architecture
Zigbee2MQTT is made up of three modules, each developed in its own Github project. Starting from the hardware (adapter) and moving up; [zigbee-herdsman](https://github.com/koenkk/zigbee-herdsman) connects to your Zigbee adapter an makes an API available to the higher levels of the stack. For e.g. Texas Instruments hardware, zigbee-herdsman uses the [TI zStack monitoring and test API](https://github.com/koenkk/zigbee-herdsman/raw/master/docs/Z-Stack%20Monitor%20and%20Test%20API.pdf) to communicate with the adapter. Zigbee-herdsman handles the core Zigbee communication. The module [zigbee-herdsman-converters](https://github.com/koenkk/zigbee-herdsman-converters) handles the mapping from individual device models to the Zigbee clusters they support. [Zigbee clusters](https://github.com/Koenkk/zigbee-herdsman/raw/master/docs/Zigbee%20Cluster%20Library%20Specification%20v7.pdf) are the layers of the Zigbee protocol on top of the base protocol that define things like how lights, sensors and switches talk to each other over the Zigbee network.  Finally, the Zigbee2MQTT module drives zigbee-herdsman and maps the zigbee messages to MQTT messages. Zigbee2MQTT also keeps track of the state of the system.  It uses a `database.db` file to store this state; a text file with a JSON database of connected devices and their capabilities.

## Supported devices
See [Supported devices](https://www.zigbee2mqtt.io/information/supported_devices.html) to check whether your device is supported. There is quite an extensive list, including devices from vendors like Xiaomi, Ikea, Philips, OSRAM and more.

If it's not listed in [Supported devices](https://www.zigbee2mqtt.io/information/supported_devices.html), support can be added (fairly) easy, see [How to support new devices](https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html).

## Support & help
If you need assistance you can check [opened issues](https://github.com/Koenkk/zigbee2mqtt/issues). Feel free to help with Pull Requests when you were able to fix things or add new devices or just share the love on social media.
