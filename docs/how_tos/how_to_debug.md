# How to debug

In case Zigbee2mqtt isn't working as expected the following tips can help you in finding the problem.

## Enabling logging

### Zigbee2mqtt debug logging
To enable debug logging for zigbee2mqtt add the following in your `configuration.yaml`

```yaml
advanced:
  log_level: debug
```

### zigbee-shepherd debug logging
To enable debug logging for zigbee-shepherd start zigbee2mqtt with: `DEBUG=zigbee-shepherd* npm start`. For more information about zigbee-shepherd debug logging see: [zigbee-shepherd debug messages](https://github.com/zigbeer/zigbee-shepherd/wiki#8-debug-messages).

### All debug logging
To enable debug logging for both Zigbee2mqtt and zigbee-shepherd start Zigbee2mqtt with `DEBUG=* npm start`.

### Docker
To enable debug logging in the Zigbee2mqtt Docker container add `-e DEBUG=*` to your `docker run` command.

## Change log level during runtime
See [MQTT topics and message structure](../information/mqtt_topics_and_message_structure.md)