#!/usr/bin/env bash
# ==========================================================
#   LAILA AI — One-Command APK Builder
#   Run this on YOUR computer (Mac / Linux / WSL on Windows)
#   after cloning the repo. It handles everything.
# ==========================================================
set -e

cd "$(dirname "$0")"

echo "🔍  Checking Node.js..."
command -v node >/dev/null || { echo "❌  Install Node.js 20 LTS: https://nodejs.org"; exit 1; }

echo "🔍  Checking EAS CLI..."
command -v eas >/dev/null || npm install -g eas-cli

echo "📦  Installing dependencies..."
command -v yarn >/dev/null || npm install -g yarn
yarn install --frozen-lockfile || yarn install

echo "🏥  Health check..."
npx expo-doctor

echo "🔐  Logging in to Expo (if not already)..."
eas whoami >/dev/null 2>&1 || eas login

echo "🔗  Linking project to your EAS account..."
eas init --non-interactive || eas init

echo "🏗️   Building Android APK (preview profile, installable)..."
eas build --platform android --profile preview --non-interactive

echo ""
echo "✅  Done! Open the URL above → Install → done."
echo "    (Or scan the QR code shown in the terminal with your phone.)"
