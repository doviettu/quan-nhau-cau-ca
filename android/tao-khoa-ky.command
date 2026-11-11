#!/bin/bash
# Tạo khóa ký APK bản phát hành (chạy MỘT lần trên Mac). Mật khẩu ngẫu nhiên lưu trong Keychain (CauCaLive-android-keystore).
# Giữ kỹ file khóa + mật khẩu: mất khóa thì không cập nhật được app đã cài (phải gỡ app, mất cấu hình trên điện thoại).
set -euo pipefail
DIR="$HOME/Library/Application Support/CauCaLive"
KS="$DIR/android-release.jks"
if [ -f "$KS" ]; then echo "Đã có khóa: $KS"; exit 0; fi
mkdir -p "$DIR"
CAUCA_KS_PASS="$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 32)"
export CAUCA_KS_PASS
keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias caucalive -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass:env CAUCA_KS_PASS -dname "CN=Cau Ca Live, O=Quan nhau via he Cau Ca, C=VN" >/dev/null
chmod 600 "$KS"
security add-generic-password -U -s CauCaLive-android-keystore -a android -l "Cậu Cả Live – mật khẩu khóa ký APK" -w "$CAUCA_KS_PASS"
unset CAUCA_KS_PASS
echo "✅ Đã tạo khóa ký: $KS"
echo "   Mật khẩu nằm trong Keychain (CauCaLive-android-keystore)."
echo "   Hãy chép file khóa này ra chỗ an toàn (ổ ngoài/iCloud). Mất khóa = không cập nhật được app trên điện thoại."
