#!/bin/sh -e

login() {
  echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
}

build_and_push() {
  docker build -t $DOCKER_USERNAME/zigbee2mqtt:$1 -f $2 .
  docker push $DOCKER_USERNAME/zigbee2mqtt:$1
}

# Only update docker images if on master branch and not pull request
if [ "$TRAVIS_BRANCH" = "master" -a "$TRAVIS_PULL_REQUEST" = "false" ]
then
  echo "Updating docker images!"
  login
  build_and_push latest docker/Dockerfile
  build_and_push armv7hf docker/Dockerfile.armv7hf
else
  echo "Not updating docker images, triggered by pull request or not on master branch"
fi
