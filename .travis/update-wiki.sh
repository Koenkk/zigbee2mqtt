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

setup_git
update_wiki
