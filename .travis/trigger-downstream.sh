#!/bin/bash

function travis_trigger() {
     local org=$1 && shift
     local repo=$1 && shift
     local branch=${1:-master} && shift

     body="{
             \"request\": {
               \"branch\": \"${branch}\"
              }
           }"

     curl -s -X POST \
          -H "Content-Type: application/json" \
          -H "Accept: application/json" \
          -H "Travis-API-Version: 3" \
          -H "Authorization: token $TRAVIS_TOKEN" \
          -d "$body" \
          "https://api.travis-ci.org/repo/${org}%2F${repo}/requests"
}

# Only trigger downstream if on dev branch and not pull request
if [ "$TRAVIS_BRANCH" = "dev" -a "$TRAVIS_PULL_REQUEST" = "false" ]
then
  echo "Triggering build of downstream projects!"
  travis_trigger "danielwelch" "hassio-zigbee2mqtt" "master"
else
  echo "Not triggering build of downstream projects, triggered by pull request or not on dev branch"
fi
