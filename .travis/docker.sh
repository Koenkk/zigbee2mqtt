#!/bin/bash -e

login() {
  echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
}

tag_push() {
  docker tag $DOCKER_USERNAME/zigbee2mqtt:$1 $DOCKER_USERNAME/zigbee2mqtt:$2
  docker push $DOCKER_USERNAME/zigbee2mqtt:$2
}

build_and_push() {
  docker build --platform=$3 --build-arg COMMIT=$(git rev-parse --short HEAD) -t $DOCKER_USERNAME/zigbee2mqtt:$1 -f $2 .
  docker push $DOCKER_USERNAME/zigbee2mqtt:$1
}

# Only update Docker images for:
# - dev branch
# - version release
if [ "$TRAVIS_PULL_REQUEST" = "false" ] && [ ! -z ${TRAVIS_TAG+x} ] && [ ! "$TRAVIS_TAG" = "" ]
then
  echo "Updating docker images for master branch!"
  login

  # Push versioned images
  build_and_push "$TRAVIS_TAG" docker/Dockerfile.amd64 amd64
  build_and_push "$TRAVIS_TAG-arm32v6" docker/Dockerfile.arm32v6 arm
  build_and_push "$TRAVIS_TAG-arm64v8" docker/Dockerfile.arm64v8 arm64

  # Push latest images.
  tag_push "$TRAVIS_TAG-arm32v6" "arm32v6"
  tag_push "$TRAVIS_TAG-arm64v8" "arm64v8"
  tag_push "$TRAVIS_TAG" latest
  
  # Make sure that docker cli experimental is enabled from here
  docker manifest create $DOCKER_USERNAME/zigbee2mqtt:latest \
		$DOCKER_USERNAME/zigbee2mqtt:latest \
		$DOCKER_USERNAME/zigbee2mqtt:arm32v6 \
		$DOCKER_USERNAME/zigbee2mqtt:arm64v8 \
		
  docker manifest annotate $DOCKER_USERNAME/zigbee2mqtt:latest $DOCKER_USERNAME/zigbee2mqtt:arm32v6 --os linux --arch arm --variant v6
  docker manifest annotate $DOCKER_USERNAME/zigbee2mqtt:latest $DOCKER_USERNAME/zigbee2mqtt:arm64v8 --os linux --arch arm64 --variant v8
  
  docker manifest inspect $DOCKER_USERNAME/zigbee2mqtt:latest
  
  docker manifest push -p $DOCKER_USERNAME/zigbee2mqtt:latest
  
  docker run --rm mplatform/mquery $DOCKER_USERNAME/zigbee2mqtt:latest
  
  
elif [ "$TRAVIS_BRANCH" = "dev" -a "$TRAVIS_PULL_REQUEST" = "false" ]
then
  echo "Updating docker images for dev branch!"
  login
  build_and_push latest-dev docker/Dockerfile.amd64 amd64
  build_and_push arm32v6-dev docker/Dockerfile.arm32v6 arm
  build_and_push arm64v8-dev docker/Dockerfile.arm64v8 arm64
  
    # Make sure that docker cli experimental is enabled from here
  docker manifest create $DOCKER_USERNAME/zigbee2mqtt:latest-dev \
		$DOCKER_USERNAME/zigbee2mqtt:latest-dev \
		$DOCKER_USERNAME/zigbee2mqtt:arm32v6-dev \
		$DOCKER_USERNAME/zigbee2mqtt:arm64v8-dev

  docker manifest annotate $DOCKER_USERNAME/zigbee2mqtt:latest-dev $DOCKER_USERNAME/zigbee2mqtt:arm32v6-dev --os linux --arch arm --variant v6		
  docker manifest annotate $DOCKER_USERNAME/zigbee2mqtt:latest-dev $DOCKER_USERNAME/zigbee2mqtt:arm64v8-dev --os linux --arch arm64 --variant v8
  
  docker manifest inspect $DOCKER_USERNAME/zigbee2mqtt:latest-dev
  
  docker manifest push -p $DOCKER_USERNAME/zigbee2mqtt:latest-dev
  
  docker run --rm mplatform/mquery $DOCKER_USERNAME/zigbee2mqtt:latest-dev
  
else
  echo "Not updating docker images, triggered by pull request or not on master/dev branch"
fi
