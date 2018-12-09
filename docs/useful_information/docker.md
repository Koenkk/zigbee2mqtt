It is possible to run zigbee2mqtt in a Docker container. 

First run the container, this will create the configuration directory. Change `configuration.yaml` according to your situation and start again.

### Parameters
* `-v $(pwd)/data:/app/data`: Directory where zigbee2mqtt stores it configuration
* `--device=/dev/ttyACM0`: Location of CC2531 USB sniffer

## Supported architectures
### amd64
```bash
docker run \
   -it \
   -v $(pwd)/data:/app/data \
   --device=/dev/ttyACM0 \
   koenkk/zigbee2mqtt
```

### arm32v6 (E.G. Raspberry Pi)
```bash
docker run \
   -it \
   -v $(pwd)/data:/app/data \
   --device=/dev/ttyACM0 \
   koenkk/zigbee2mqtt:arm32v6
```

### arm64v8
```bash
docker run \
   -it \
   -v $(pwd)/data:/app/data \
   --device=/dev/ttyACM0 \
   koenkk/zigbee2mqtt:arm64v8
```

## Updating
To update to the latest Docker image:
```bash
docker rm -f [ZIGBEE2MQTT_CONTAINER_NAME]
docker rmi -f [ZIGBEE2MQTT_IMAGE_NAME] # e.g. koenkk/zigbee2mqtt:arm32v6 
# Now run the container again, Docker will automatically pull the latest image.
```

