#!/bin/sh
set -e

# Xcode Cloud doesn't have Node pre-installed — install via Homebrew
brew install node

# Install Node dependencies
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install --legacy-peer-deps

# Install CocoaPods dependencies
cd ios
pod install
