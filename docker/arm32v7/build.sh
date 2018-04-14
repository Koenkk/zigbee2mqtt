#!/bin/bash

docker build -t koenkk/xiaomi-zb2mqtt:arm32v7 -f Dockerfile ../../
docker push koenkk/xiaomi-zb2mqtt:arm32v7
