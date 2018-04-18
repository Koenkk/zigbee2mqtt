#!/bin/bash

docker build -t koenkk/zigbee2mqtt:arm32v7 -f Dockerfile ../../
docker push koenkk/zigbee2mqtt:arm32v7
