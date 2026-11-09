#!/bin/bash
# Khởi động "Cậu Cả Live" trên Mac – nhấp đúp file này (hoặc mở "Cau Ca Live.app").
#   ./start.command              chạy app (mở bảng điều khiển trong trình duyệt)
#   ./start.command --reset-key  xoá Claude API key trong Keychain rồi hỏi lại
#   ./start.command --no-open    chạy nhưng không tự mở trình duyệt
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
SERVICE="cau-ca-live"; ACCOUNT="anthropic"
printf '\033]0;Cậu Cả Live\007'
echo "🍻  Cậu Cả Live – đang khởi động…"
mkdir -p "$HOME/Library/Application Support/CauCaLive" && echo "$ROOT" > "$HOME/Library/Application Support/CauCaLive/root"

pause_exit() { echo; read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng…"; echo; exit "${1:-1}"; }

ARGS=()
for a in "$@"; do
  if [ "$a" = "--reset-key" ]; then
    security delete-generic-password -s "$SERVICE" -a "$ACCOUNT" >/dev/null 2>&1 && echo "🔑 Đã xoá Claude API key khỏi Keychain." || echo "🔑 Keychain chưa có key."
  else ARGS+=("$a"); fi
done

# 1) Node.js 20+
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Chưa có Node.js (cần bản 20 trở lên)."
  echo "   Cài bằng:  brew install node   – hoặc tải bản LTS tại https://nodejs.org"
  open "https://nodejs.org/" 2>/dev/null
  pause_exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then echo "❌ Node.js $(node -v) quá cũ, cần 20 trở lên. Cập nhật: brew upgrade node"; pause_exit 1; fi

# 2) Thư viện (lần đầu hoặc khi có bản cập nhật)
if [ ! -d node_modules/@anthropic-ai/sdk ] || [ ! -d node_modules/ws ] || [ ! -d node_modules/tiktok-live-connector ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "📦 Đang cài thư viện (cần mạng)…"
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund || { echo "❌ Cài thư viện thất bại."; pause_exit 1; }
fi

# 3) Claude API key: lấy từ Keychain của Mac, chưa có thì hỏi một lần
if [ -z "$ANTHROPIC_API_KEY" ]; then
  ANTHROPIC_API_KEY="$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w 2>/dev/null)"
fi
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo
  echo "🔑 Chưa có Claude API key (tạo tại console.anthropic.com → API Keys)."
  read -r -p "   Lưu key vào Keychain của Mac ngay bây giờ? (c = có / Enter = bỏ qua): " ANS
  if [[ "$ANS" =~ ^[cCyY] ]]; then
    echo "   Dán key khi được hỏi, gõ 2 lần (ký tự sẽ không hiện ra):"
    security add-generic-password -U -s "$SERVICE" -a "$ACCOUNT" -l "Cậu Cả Live – Claude API key" -w \
      && ANTHROPIC_API_KEY="$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w 2>/dev/null)"
  else
    echo "   Bỏ qua – game vẫn chạy, Cậu Cả nói theo kịch bản có sẵn."
  fi
fi
[ -n "$ANTHROPIC_API_KEY" ] && export ANTHROPIC_API_KEY

# 4) Chạy app (Ctrl+C để dừng)
echo
node app/server.mjs "${ARGS[@]}"
CODE=$?
[ $CODE -ne 0 ] && pause_exit $CODE
exit 0
