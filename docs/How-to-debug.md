In case zigbee2mqtt isn't working as expected the following tips can help you in finding the problem.

## Change log level on startup
Using `DEBUG` environment variable will trigger 'debug' level to be applied across all zigbee2mqtt logging as well. 

### zigbee-shepherd debug logging 
To enable debug logging for zigbee-shepherd start zigbee2mqtt with: `DEBUG=zigbee-shepherd* npm start`. For more information about zigbee-shepherd debug logging see: [zigbee-shepherd debug messages](https://github.com/zigbeer/zigbee-shepherd/wiki#8-debug-messages).

### zigbee2mqtt debug logging
To enable debug logging for zigbee2mqtt add the following in your `configuration.yaml`

```
advanced:
  log_level: debug
```

### All debug logging
To enable debug logging for both zigbee2mqtt and zigbee-shepherd start zigbee2mqtt with `DEBUG=* npm start`.

### Docker
To enable debug logging in the zigbee2mqtt Docker container add `-e DEBUG=*` to your `docker run` command.

## Change log level during runtime 
Publish the log level on `zigbee2mqtt/bridge/config/log_level` topic.
This is not persistent (will not be saved to configuration.yaml). Possible messages are: 'error', 'warn', 'info', 'debug'