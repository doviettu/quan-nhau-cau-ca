#!/bin/bash
# Cài & thiết lập OBS cho "Cậu Cả Live" – nhấp đúp file này (chỉ cần làm một lần).
#  1) cài OBS Studio và ffmpeg (bằng Homebrew) nếu máy chưa có
#  2) bật sẵn WebSocket của OBS (cổng 4455, mật khẩu tự tạo) để app tự điều khiển OBS
#  3) mở OBS – lần đầu macOS hỏi quyền Ghi màn hình: bấm Cho phép
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
printf '\033]0;Cài OBS cho Cậu Cả Live\007'
pause_exit() { echo; read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng…"; echo; exit "${1:-0}"; }
echo "🎬  Cài OBS cho Cậu Cả Live"; echo

if ! command -v brew >/dev/null 2>&1; then
  echo "❌ Chưa có Homebrew. Cài theo hướng dẫn tại https://brew.sh rồi chạy lại file này."; open "https://brew.sh" 2>/dev/null; pause_exit 1
fi
if ! command -v node >/dev/null 2>&1; then echo "📦 Cài Node.js…"; brew install node || pause_exit 1; fi

if [ -d "/Applications/OBS.app" ]; then echo "✅ Đã có OBS Studio"; else echo "📦 Cài OBS Studio (vài phút)…"; brew install --cask obs || { echo "❌ Cài OBS thất bại – tải tay tại https://obsproject.com"; pause_exit 1; }; fi
if command -v ffmpeg >/dev/null 2>&1; then echo "✅ Đã có ffmpeg"; else echo "📦 Cài ffmpeg…"; brew install ffmpeg || { echo "❌ Cài ffmpeg thất bại"; pause_exit 1; }; fi

# OBS phải tắt khi sửa cấu hình, nếu không OBS ghi đè lúc thoát
if pgrep -xq "OBS" || pgrep -xq "obs"; then
  echo "⏳ Đang tắt OBS để bật WebSocket…"; osascript -e 'quit app "OBS"' >/dev/null 2>&1; for i in 1 2 3 4 5 6 7 8 9 10; do pgrep -xq "OBS" || pgrep -xq "obs" || break; sleep 1; done
fi
node app/obs-setup.mjs --enable || pause_exit 1

echo; echo "🚀 Mở OBS…"; open -a OBS 2>/dev/null || open "/Applications/OBS.app"
cat <<'MSG'

Xong phần tự động. Còn 3 việc bạn tự làm (một lần):
  1. macOS hỏi quyền "Ghi màn hình & âm thanh hệ thống" cho OBS → bấm Cho phép
     (hoặc: Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Ghi màn hình & âm thanh hệ thống → bật OBS),
     rồi tắt và mở lại OBS.
  2. Mở app Cậu Cả Live → thẻ 🎬 OBS → "Cài đặt OBS và khóa luồng": tích YouTube/Facebook,
     dán khóa luồng của từng nơi, bấm 💾 Lưu. (Mật khẩu OBS app tự đọc, không cần dán.)
  3. Mỗi buổi live: bấm ▶️ Bắt đầu buổi live trên bảng điều khiển.
MSG
pause_exit 0
