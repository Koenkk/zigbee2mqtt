qemu-aarch64-static and qemu-arm-static are taken from https://github.com/resin-io/qemu/releases/tag/v2.9.0%2Bresin1

##################

If the zigbee2mqtt docker image should be executed as non-root user, pass through the device with the "--device" statement (in the example below, "--device /dev/ttyACM0" is the actual device) and add the user to the respective dialout group with the "--group-add dialout" statement, e.g.:

1. Identify your device:
```
$ ls -l /dev/serial/by-id
```

2. Identify the group that has access to the device (in Ubuntu, e.g. it might be assigned to "dialout"):
```
$ ls -l /dev/ttyACM*
```

3. Check the user&group id you want to execute the docker image with:
```
$ id
```

4. Start the docker container (note: priveleged mode is not required):
```
$ sudo docker run \
   -it \
   --name=zigbee2mqtt \
   -v ($pwd)/zigbee2mqtt/data:/app/data \
   -v /run/udev:/run/udev:ro \
   --device=/dev/ttyACM0 \
   --user 1001:1001 \
   --group-add dialout \
   -e TZ=Europe/Berlin \
   koenkk/zigbee2mqtt</b>
```
   
   
