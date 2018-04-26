#!/bin/sh -e

setup_git() {
  git config --global user.email "travis@travis-ci.org"
  git config --global user.name "Travis CI"
}

update_wiki() {
  rm -rf zigbee2mqtt.wiki
  git clone https://${GH_TOKEN}@github.com/Koenkk/zigbee2mqtt.wiki.git
  npm run docgen zigbee2mqtt.wiki
  cd zigbee2mqtt.wiki
  git push origin
}

# Only update wiki if on master branch and not pull request
if [ "$TRAVIS_BRANCH" = "master" -a "$TRAVIS_PULL_REQUEST" = "false" ]
then
  setup_git
  update_wiki
else
  echo "Not updating wiki, triggered by pull request or not on master branch"
fi
