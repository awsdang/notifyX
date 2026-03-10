#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GOOGLE_SERVICES_FILE="$PROJECT_ROOT/android/app/google-services.json"

if [[ ! -f "$GOOGLE_SERVICES_FILE" ]]; then
  cat <<'EOF'
Missing Firebase config file:
  android/app/google-services.json

Download it from Firebase Console for Android package:
  com.react_native_notification_test

Then place it at:
  sdks/examples/react_native_app/android/app/google-services.json
EOF
  exit 1
fi

export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="/Users/awsqi/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

METRO_PORT="${RCT_METRO_PORT:-8081}"

if lsof -i "tcp:${METRO_PORT}" >/dev/null 2>&1; then
  echo "Restarting Metro on port ${METRO_PORT}..."
  lsof -ti "tcp:${METRO_PORT}" | xargs kill -9 >/dev/null 2>&1 || true
fi

echo "Starting Metro on port ${METRO_PORT}..."
nohup npx react-native start --port "${METRO_PORT}" --reset-cache \
  >"$PROJECT_ROOT/.metro.log" 2>&1 &
for _ in {1..20}; do
  if lsof -i "tcp:${METRO_PORT}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Allow Android app to reach local API/dev server on host machine.
adb reverse tcp:3000 tcp:3000 >/dev/null 2>&1 || true
adb reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true

exec npx react-native run-android --no-packager "$@"
