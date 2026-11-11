# App Android (live bằng điện thoại)

App `vn.caucalive.app` chạy cả quán trên điện thoại, không cần Mac:
- Máy chủ `app/server.mjs` chạy bằng Node 18 (nodejs-mobile) ngay trong app.
- Game hiện toàn màn hình trong WebView.
- Giọng MC dùng giọng tiếng Việt của Android (Google TTS).

Đã thử trên Redmi K40 (Android 13, Adreno 650): 60 FPS với khoảng 40 khách, độ nét 1.75.

## Dựng và cài từ Mac
Cần:
- Node 20 trở lên.
- Android SDK ở `~/Library/Android/sdk`, gồm platform 35, NDK 29.0.14206865 và CMake 3.31.6.
- `adb`.

```bash
./android/build-apk.sh            # tạo android/app/build/outputs/apk/debug/app-debug.apk
./android/build-apk.sh install    # tạo rồi cài lên điện thoại đang cắm USB
```

Lần đầu, script tải nodejs-mobile (khoảng 100 MB) và kiểm SHA256.

Script còn vá cờ regex `/v` thành `/u` trong `node_modules` của gói APK, qua `android/patch-node18.mjs`. Thư viện `got` dùng cờ `/v`, mà cờ này chỉ có từ Node 20.

## Dùng
1. Mở app **Cậu Cả Live**. Lần đầu mất vài giây để giải nén.
2. Bấm **Quay lại** để mở bảng điều khiển. Bấm Quay lại lần nữa để về game.
3. Trong bảng điều khiển:
   - Nhập @tên TikTok ở mục ⚡ Kết nối & phát.
   - Nhập Claude API key bằng nút **🔑 Nhập / đổi Claude API key**. Key nhập trong hộp thoại riêng của app, được mã hoá bằng Android Keystore, và không đưa vào trang web.
4. Mở app TikTok, chọn LIVE, rồi chọn chế độ chia sẻ màn hình (Trò chơi di động). Bắt đầu live, sau đó quay lại app Cậu Cả.

Cấu hình (`config.json`) và các khóa khác (`.secrets.json`) nằm trong bộ nhớ riêng của app. Cài bản APK mới vẫn giữ nguyên chúng.

## Giới hạn
- Không có OBS, bộ chuyển tiếp 3 nền tảng, giọng VieNeu hay nhạc nền từ thư mục. Các phần này chỉ có trên Mac.
- Karaoke bằng YouTube nhúng có thể bị YouTube chặn trong WebView. Chưa thử.
- Chưa có dịch vụ chạy nền: nếu MIUI tắt app khi bạn ở lâu trong app TikTok, mở lại app Cậu Cả.
- Bản debug ký bằng khóa debug của máy Mac. Muốn phát hành cho máy khác thì cần khóa ký riêng.
