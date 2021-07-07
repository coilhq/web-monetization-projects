#!/bin/bash -u
# We use set -e and bash with -u to bail on first non zero exit code of any
# processes launched or upon any unbound variable.
# We use set -x to print commands before running them to help with
# debugging.
set -ex

# To publish to CoilPreview
# export WEXT_SHIPIT_CHROME_EXTENSION_ID=iehmfkldnblennopinmmagfidpflefkp
# export WEXT_MANIFEST_SUFFIX=Preview

export WEXT_MANIFEST_VERSION="$COIL_DEV_VERSION"
# shellcheck disable=SC2155
export WEXT_MANIFEST_VERSION_NAME="$COIL_DEV_VERSION - $(git branch --show) - $(git show -s --pretty='%h - %ad' --date=short)"
export WEXT_MANIFEST_SUFFIX=${WEXT_MANIFEST_SUFFIX:-'Dev'}
export WEXT_MANIFEST_SUFFIX_NO_DATE='true'
# shellcheck disable=SC2155
export WEXT_BUILD_CONFIG="{\"extensionBuildString\":\"$(git show --no-patch --no-notes --pretty='== %h == %cd == %s ==' )\"}"
./build.sh prod chrome
shipit chrome dist
