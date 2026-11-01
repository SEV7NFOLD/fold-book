#!/usr/bin/env bash
set -euo pipefail

smoke_result=failed
trap 'printf "smoke_result=%s\\n" "$smoke_result" >> "$GITHUB_OUTPUT"' EXIT

adb install foldbook.apk
adb logcat -c
adb shell am start -W -n com.sev7nfold.foldbook/com.google.androidbrowserhelper.trusted.LauncherActivity
sleep 15
adb logcat -d -s AndroidRuntime:E > /tmp/foldbook-android-runtime.log

if grep -q "FATAL EXCEPTION" /tmp/foldbook-android-runtime.log; then
  cat /tmp/foldbook-android-runtime.log
  exit 1
fi

resumed_activity="$(adb shell dumpsys activity activities | tr -d '\r' | grep -E 'mResumedActivity|topResumedActivity' | tail -n 1 || true)"
echo "Foreground after launch: $resumed_activity"
if ! printf '%s' "$resumed_activity" | grep -Eq 'com\.android\.chrome|WebViewFallbackActivity'; then
  adb shell dumpsys activity activities || true
  adb logcat -d -s AndroidRuntime:E ActivityTaskManager:E
  exit 1
fi

smoke_result=passed
