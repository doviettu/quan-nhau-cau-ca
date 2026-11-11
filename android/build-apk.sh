#!/bin/bash
# Dựng APK Cậu Cả Live cho Android (arm64). Cần: Node 20+, Android SDK (ANDROID_HOME) có NDK + CMake.
#   ./android/build-apk.sh            → android/app/build/outputs/apk/debug/app-debug.apk
#   ./android/build-apk.sh install    → dựng rồi cài lên điện thoại đang cắm USB (adb)
set -euo pipefail
cd "$(dirname "$0")"
ANDROID_DIR="$PWD"; ROOT="$(cd .. && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

# 1) Node.js for Mobile (Node 18, có căn trang 16 KB) – tải một lần, kiểm SHA256
NM_TAG=v18.20.4-capawesome.3
NM_SHA=0a8d094d3f60bcd3b8ff0ad98e4aafeeb59c933fbf53af82eb7cdeab015c503f
if [ ! -f app/libnode/bin/arm64-v8a/libnode.so ]; then
  mkdir -p build/dl
  ZIP=build/dl/nodejs-mobile-$NM_TAG-android.zip
  [ -f "$ZIP" ] || curl -fL -o "$ZIP" "https://github.com/capawesome-team/nodejs-mobile/releases/download/$NM_TAG/nodejs-mobile-$NM_TAG-android.zip"
  echo "$NM_SHA  $ZIP" | shasum -a 256 -c -
  rm -rf app/libnode build/nm && mkdir -p build/nm && unzip -q "$ZIP" -d build/nm
  mkdir -p app/libnode/bin && cp -R build/nm/include app/libnode/ && cp -R build/nm/bin/arm64-v8a app/libnode/bin/
fi

# 2) Mã nguồn máy chủ + game, cài thư viện sạch (không có gói dev), vá cho Node 18, nén vào assets
STAGE=build/nodejs-project
rm -rf "$STAGE" && mkdir -p "$STAGE/app" "$STAGE/bridge"
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$ROOT/index.html" "$STAGE/"
cp "$ROOT"/app/*.mjs "$ROOT/app/panel.html" "$ROOT/app/locfilter.cjs" "$STAGE/app/"
cp "$ROOT"/bridge/*.mjs "$STAGE/bridge/"
(cd "$STAGE" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
node patch-node18.mjs "$STAGE"
mkdir -p app/src/main/assets && rm -f app/src/main/assets/nodejs-project.zip
(cd "$STAGE" && zip -qr -X "$ANDROID_DIR/app/src/main/assets/nodejs-project.zip" .)

# 3) Dựng APK
./gradlew --no-daemon -q assembleDebug
APK=app/build/outputs/apk/debug/app-debug.apk
echo "✅ $ANDROID_DIR/$APK ($(du -h "$APK" | cut -f1))"
if [ "${1:-}" = "install" ]; then adb install -r "$APK" && adb shell monkey -p vn.caucalive.app -c android.intent.category.LAUNCHER 1 >/dev/null; fi
