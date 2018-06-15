#!/bin/sh -e

login() {
  echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
}

build_and_push() {
  docker build --build-arg COMMIT=$(git rev-parse --short HEAD) -t $DOCKER_USERNAME/zigbee2mqtt:$1 -f $2 .
  docker push $DOCKER_USERNAME/zigbee2mqtt:$1
}

# Only update docker images if on master branch and not pull request
if [ "$TRAVIS_BRANCH" = "master" -a "$TRAVIS_PULL_REQUEST" = "false" ]
then
  echo "Updating docker images for master branch!"
  login
  build_and_push latest docker/Dockerfile.amd64
  build_and_push arm32v6 docker/Dockerfile.arm32v6
  build_and_push arm64v8 docker/Dockerfile.arm64v8
elif [ "$TRAVIS_BRANCH" = "dev" -a "$TRAVIS_PULL_REQUEST" = "false" ]
then
  echo "Updating docker images for dev branch!"
  login
  build_and_push latest-dev docker/Dockerfile.amd64
  build_and_push arm32v6-dev docker/Dockerfile.arm32v6
  build_and_push arm64v8-dev docker/Dockerfile.arm64v8
else
  echo "Not updating docker images, triggered by pull request or not on master/dev branch"
fi
