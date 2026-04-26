#!/bin/sh
set -e

# Install Node dependencies
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install --legacy-peer-deps

# Install CocoaPods dependencies
cd ios
pod install
