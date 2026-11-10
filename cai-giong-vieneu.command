#!/bin/bash
# Cài giọng đọc tiếng Việt VieNeu-TTS cho Cậu Cả (chạy trên máy, không cần internet sau khi cài).
# Nhấp đúp file này một lần. Cài vào: ~/Library/Application Support/CauCaLive/vieneu
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DIR="$HOME/Library/Application Support/CauCaLive/vieneu"
pause_exit() { echo; read -r -p "Nhấn Enter để đóng cửa sổ…" _; exit "$1"; }

echo "🗣️  Cài giọng VieNeu-TTS cho Cậu Cả"
echo "   Thư mục cài: $DIR"
echo

PY=""
for c in python3.12 python3.11 python3.13 python3.10; do
  if command -v "$c" >/dev/null 2>&1; then PY="$(command -v "$c")"; break; fi
done
if [ -z "$PY" ]; then
  if ! command -v brew >/dev/null 2>&1; then echo "❌ Cần Homebrew để cài Python (https://brew.sh)."; pause_exit 1; fi
  echo "📦 Cài Python 3.12 bằng Homebrew…"
  brew install python@3.12 || { echo "❌ Cài Python thất bại."; pause_exit 1; }
  PY="$(command -v python3.12)"
fi
echo "🐍 Dùng $("$PY" --version) ($PY)"

mkdir -p "$DIR"
if [ ! -x "$DIR/venv/bin/python" ]; then
  "$PY" -m venv "$DIR/venv" || { echo "❌ Không tạo được môi trường Python."; pause_exit 1; }
fi
"$DIR/venv/bin/python" -m pip install --upgrade pip >/dev/null
echo "📦 Cài thư viện VieNeu (vài phút)…"
"$DIR/venv/bin/python" -m pip install "vieneu==3.8.3" || { echo "❌ Cài VieNeu thất bại."; pause_exit 1; }

echo "⬇️  Tải mô hình giọng (lần đầu, có thể mất vài phút)…"
HF_HOME="$DIR/hf" "$DIR/venv/bin/python" - <<'PY' || { echo "❌ Tải mô hình thất bại – kiểm tra mạng rồi chạy lại."; pause_exit 1; }
from vieneu import Vieneu
tts = Vieneu(mode="v3turbo", backend="onnx")
for _ in tts.infer_stream("Xin chào cả nhà, Cậu Cả đây!", apply_watermark=False):
    pass
print("OK")
PY

echo
echo "✅ Xong! Tắt app (Ctrl+C) rồi mở lại Cau Ca Live.app – Cậu Cả sẽ nói bằng giọng VieNeu."
echo "   Đổi giọng trong bảng điều khiển → ⚙️ Cấu hình → Giọng Cậu Cả."
pause_exit 0
