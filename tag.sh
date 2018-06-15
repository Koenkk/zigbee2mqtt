#!/bin/sh
echo "{\"id\": \"$(git rev-parse --short HEAD)\"}" > data/hash.json
echo "Hash version '$(git rev-parse --short HEAD)' generated successfully"