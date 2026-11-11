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

### Bản phát hành (ký bằng khóa riêng)
Làm lần lượt:
1. Tạo khóa ký, chỉ cần một lần. Lệnh này tạo `~/Library/Application Support/CauCaLive/android-release.jks`, còn mật khẩu ngẫu nhiên được lưu trong Keychain (`CauCaLive-android-keystore`):
   ```bash
   ./android/tao-khoa-ky.command
   ```
2. Chép file `.jks` ra chỗ an toàn. Mất khóa thì không cập nhật được app đã cài.
3. Dựng bản phát hành:
   ```bash
   ./android/build-apk.sh release           # android/app/build/outputs/apk/release/app-release.apk
   ./android/build-apk.sh release install   # dựng rồi cài lên điện thoại
   ```
4. Lần đầu chuyển từ bản debug sang bản phát hành, phải gỡ app cũ trước (`adb uninstall vn.caucalive.app`), vì hai bản ký bằng hai khóa khác nhau. Gỡ app sẽ xoá cấu hình và Claude key đã nhập trên điện thoại.

Bản phát hành tắt gỡ lỗi WebView.

Script còn vá cờ regex `/v` thành `/u` trong `node_modules` của gói APK, qua `android/patch-node18.mjs`. Thư viện `got` dùng cờ `/v`, mà cờ này chỉ có từ Node 20.

## Dùng
1. Mở app **Cậu Cả Live**. Lần đầu mất vài giây để giải nén.
2. Bấm **Quay lại** để mở bảng điều khiển. Bấm Quay lại lần nữa để về game.
3. Trong bảng điều khiển:
   - Nhập @tên TikTok ở mục ⚡ Kết nối & phát.
   - Nhập Claude API key bằng nút **🔑 Nhập / đổi Claude API key**. Key nhập trong hộp thoại riêng của app, được mã hoá bằng Android Keystore, và không đưa vào trang web.
4. Mở app TikTok, chọn LIVE, rồi chọn chế độ chia sẻ màn hình (Trò chơi di động). Bắt đầu live, sau đó quay lại app Cậu Cả.

Khi app đang chạy, thanh thông báo có dòng **"🍻 Quán Cậu Cả đang mở"**. Đó là dịch vụ chạy nền giữ máy chủ, giọng MC và nhạc sống khi bạn ở trong app TikTok.
- Nút **Đóng quán** trên thông báo tắt hẳn app.
- Lần đầu mở app, Android hỏi hai việc: cho phép thông báo, và bỏ tối ưu pin. Chọn **Cho phép** cả hai.
- Trên MIUI, nên vào thêm *Cài đặt → Ứng dụng → Cậu Cả Live*, bật **Tự khởi động**, và đặt **Tiết kiệm pin** là **Không giới hạn**.

Cấu hình (`config.json`) và các khóa khác (`.secrets.json`) nằm trong bộ nhớ riêng của app. Cài bản APK mới vẫn giữ nguyên chúng.

## Giới hạn
- Không có OBS, bộ chuyển tiếp 3 nền tảng, giọng VieNeu hay nhạc nền từ thư mục. Các phần này chỉ có trên Mac.
- Karaoke YouTube nhúng phát được trong WebView: đã thử có tiếng, âm lượng 100. Video nào chủ video cấm nhúng thì vẫn không phát được, trên Mac cũng vậy.
- Khi app ở nền, game ngừng vẽ, nhưng máy chủ và kết nối live vẫn chạy. Lúc live phải để app Cậu Cả ở phía trước, vì TikTok chỉ quay những gì đang hiện trên màn hình.
