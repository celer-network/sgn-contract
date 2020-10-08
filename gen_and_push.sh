#!/usr/bin/env bash
# Add a commit with generated abi/bin files to the PR
# This script should only be run by build bot for abi/bin consistency
# email/name are just placeholder

set -e

PRID="$1"
BRANCH="$2"

TRUFFLE_VER=$(node_modules/.bin/truffle version)
PR_COMMIT_ID=""

setup_git() {
  git config --global user.email "build@celer.network"
  git config --global user.name "Build Bot"
}

get_pr() {
  git fetch origin pull/$PRID/head:$BRANCH
  git checkout $BRANCH
}

extract_abi_bin() {
  jq .abi build/contracts/$1.json >genfiles/$1.abi
  jq -r .bytecode build/contracts/$1.json >genfiles/$1.bin
}

update_genfiles() {
  mkdir -p genfiles
  extract_abi_bin DPoS
  extract_abi_bin SGN
}

# append a new commit with generated files to current PR
commit_and_push() {
  git add genfiles/
  git commit -m "Update genfiles by build bot" -m "$TRUFFLE_VER"
  # gh_token is an env in CI project setting
  git push https://${GH_TOKEN}@github.com/celer-network/sgn-contract.git $BRANCH &>/dev/null
}

# $1 is contract abi/bin name, $2 is go pkg name
abigen_files() {
  # mkdir -p $2
  ../node_modules/.bin/abigen -abi ../genfiles/$1.abi -bin ../genfiles/$1.bin -pkg $2 -type $1 -out $2/$3.go
}

# send a PR to gobinding repo
sync_go_binding() {
  echo "sync go binding ..."
  PR_COMMIT_ID=$(git rev-parse --short HEAD)
  echo sgn-contract PR Head Commit: $PR_COMMIT_ID
  REPO=https://${GH_TOKEN}@github.com/celer-network/sgn.git
  git clone $REPO sgn
  pushd sgn
  git checkout develop # based on develop branch of sgn repo
  git fetch
  echo "checkout branch $BRANCH"
  git checkout $BRANCH || git checkout -b $BRANCH
  git status
  echo "abigen files ..."
  abigen_files DPoS mainchain dpos
  abigen_files SGN mainchain sgn
  if [[ $(git status --porcelain) ]]; then
    echo "syncing go binding on branch $BRANCH"
    git add .
    git status
    git commit -m "Sync go binding based on sgn-contract PR $PRID" -m "sgn-contract commit: $PR_COMMIT_ID"
    git push origin $BRANCH
  fi
  popd
  rm -rf sgn
}

echo "update go binding ..."
setup_git
get_pr
node_modules/.bin/truffle compile
update_genfiles
sync_go_binding
if [[ $(git status --porcelain) ]]; then
  commit_and_push
else
  echo "Genfiles and go bindings are not changed. Nothing to update or sync."
fi
