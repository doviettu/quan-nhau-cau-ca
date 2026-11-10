# Hướng dẫn live cùng lúc TikTok, YouTube và Facebook

Dành cho máy Mac mini chạy app "Cậu Cả Live". Một cửa sổ game được phát lên ba nơi. Comment, quà và tim từ cả ba nơi đổ về chung một quán.

```
                ┌──────────────── Cửa sổ game (Chrome dọc 540×960) ────────────────┐
                │                                                                  │
   OBS ── chụp cửa sổ ──► 1 luồng ──► Bộ chuyển tiếp của app (ffmpeg) ──► YouTube + Facebook (+ TikTok nếu có khóa luồng)
   TikTok LIVE Studio ── chụp cửa sổ ──► TikTok   (khi tài khoản TikTok chưa có khóa luồng)

   App Cậu Cả Live ◄── comment/quà/tim ── TikTok (@tên) · YouTube (API key) · Facebook (Page token)
```

> **[CXM]** = mình chưa thử trên máy thật, chỉ dựa trên tài liệu hoặc diễn đàn. Hãy chạy thử một buổi riêng tư trước khi live thật.

---

## Phần A. Chuẩn bị một lần

### A1. Máy và mạng
- **Tốc độ tải lên (upload):** mỗi luồng 720p cần khoảng 3–4 Mbps, ba nơi khoảng 12 Mbps. Nên có **từ 20 Mbps** trở lên. Kiểm tra ở speedtest.net. Cắm dây mạng nếu được.
- **Bộ mã hoá:** dùng bộ mã hoá phần cứng của Mac (Apple VT) trong OBS để máy không quá nóng.
- **Hệ điều hành:** macOS 13 (Ventura) trở lên, để OBS thu được tiếng của máy mà không cần cài thêm phần mềm.

### A2. App Cậu Cả Live
Làm theo README mục 1: cài Node.js, tải repo, mở `Cau Ca Live.app`. Muốn giọng đọc tự nhiên thì cài thêm VieNeu (README mục 4).

### A3. TikTok
- Tài khoản đủ điều kiện live.
- **Cách 1 – qua OBS (gọn nhất):** nếu TikTok cấp cho tài khoản **Server URL + khóa luồng** (thường thấy trong LIVE Center / LIVE Producer trên web, chỉ một số tài khoản có), dán hai thông tin này vào thẻ 🎬 OBS của app. OBS phát luôn cả TikTok. **[CXM]**
- **Cách 2 – LIVE Studio (như cũ):** nếu chưa có khóa luồng, LIVE Studio vẫn chụp cửa sổ game và phát lên TikTok. OBS lo YouTube và Facebook.
- Với cả hai cách, app đọc comment TikTok bằng **@tên**.

### A4. YouTube
1. **Bật tính năng phát trực tiếp:** vào YouTube Studio → **Tạo → Phát trực tiếp**. Lần đầu YouTube có thể yêu cầu xác minh số điện thoại và **chờ tới 24 giờ** mới live được.
2. **Lấy API key để app đọc chat:**
   1. Vào console.cloud.google.com, **tạo project mới** (ví dụ "cauca-chat"). Nên tách riêng với key karaoke để không dùng chung hạn mức.
   2. Vào **APIs & Services → Library**, bật **YouTube Data API v3**.
   3. Vào **APIs & Services → Credentials**, bấm **Create credentials → API key**.
   4. Ở mục giới hạn key (Application restrictions), chọn *Websites* rồi thêm `http://127.0.0.1:8686/*`. App gửi kèm địa chỉ này khi gọi Google.
3. Mở **YouTube Studio → Phát trực tiếp → Luồng (Stream)**:
   - Chép **Khóa luồng (Stream key)**.
   - Chọn **Độ trễ cực thấp** để chat theo kịp hình.
   - Có thể bật *Khóa luồng cố định* để lần sau khỏi chép lại.

### A5. Facebook (chỉ dùng được cho **Trang**)
1. Cần một **Trang Facebook** bạn quản lý. Live trên trang cá nhân thì app không đọc được comment.
2. **Lấy Page access token để app đọc comment:**
   1. Vào developers.facebook.com → **My Apps → Create App**, chọn loại *Business*.
   2. Mở **Tools → Graph API Explorer**, chọn app vừa tạo.
   3. Bấm **Add permissions**, thêm `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, rồi bấm **Generate Access Token** và đồng ý.
   4. Ở ô **User or Page**, chọn **Trang của bạn**. Ô Access Token lúc này là **Page token**.
   5. Muốn token lâu hết hạn hơn: mở **Access Token Debugger**, dán *user token* rồi bấm **Extend Access Token**. Dán token mới vào Graph API Explorer, rồi chọn lại Trang để lấy Page token mới. **[CXM]**
   - Token giống mật khẩu: chỉ dán vào bảng điều khiển của app, không gửi cho ai.
3. **Khóa luồng:** mở **Live Producer** (facebook.com/live/producer), chọn đăng với tư cách **Trang**, chọn **Phần mềm phát trực tiếp (Streaming software)**, rồi chép **Khóa luồng**. Nên chọn khóa dùng lại được (persistent).

### A6. OBS Studio + nút "Khớp lại OBS"
App tự cài đặt OBS qua WebSocket nên bạn không phải chỉnh tay từng mục, và không cần plugin.
1. **Nhấp đúp `cai-obs.command`** trong thư mục `quan-nhau-cau-ca`. File này tự làm mọi việc sau:
   - cài **OBS Studio** và **ffmpeg** bằng Homebrew, nếu máy chưa có;
   - tắt OBS nếu đang mở, rồi **bật sẵn WebSocket** của OBS (cổng 4455, mật khẩu tự tạo);
   - mở lại OBS.

   App tự đọc mật khẩu WebSocket trong file cấu hình của OBS trên máy, nên bạn không cần chép hay dán mật khẩu.

   *Muốn làm tay:* cài OBS bản 30 trở lên và `brew install ffmpeg`. Trong OBS vào **Tools → WebSocket Server Settings**, tích **Enable WebSocket server**, bấm **Show Connect Info** để xem mật khẩu, rồi dán mật khẩu đó vào thẻ 🎬 OBS ở bước 2.
2. **Nhập khóa luồng vào app:** bảng điều khiển → thẻ **🎬 OBS – phát YouTube, Facebook, TikTok** → mở **Cài đặt OBS và khóa luồng**.
   - Tích **YouTube** và dán khóa luồng YouTube (A4).
   - Tích **Facebook** và dán khóa luồng Facebook (A5).
   - Nếu TikTok có khóa luồng (A3, cách 1): tích **TikTok**, dán **Server URL** và **khóa luồng**.
   - Bấm **💾 Lưu**.
   - Mật khẩu và khóa luồng được cất trong **Keychain** của Mac, không nằm trong `config.json`.
5. Lần đầu OBS chụp màn hình, macOS sẽ hỏi quyền. Vào **Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Ghi màn hình & âm thanh hệ thống**, bật cho **OBS**, rồi mở lại OBS.

**Nút 🔗 Khớp lại OBS làm những gì:**
- Khung dọc **720×1280**, 30 FPS (đổi được sang 1080×1920).
- Tạo cảnh **"Cậu Cả Live"** và chọn cảnh này.
- Thêm nguồn **macOS Screen Capture** ở chế độ cửa sổ, tự tìm cửa sổ tên *"Quán nhậu vỉa hè Cậu Cả"*, phủ kín khung và **cắt thanh tiêu đề** cửa sổ Chrome.
- Thêm nguồn **macOS Audio Capture → toàn bộ âm thanh máy**. Nguồn này thu cả nhạc game lẫn giọng Cậu Cả; chỉ thu tiếng Chrome thì sẽ mất giọng Cậu Cả.
- Đặt **đích phát** của OBS về bộ chuyển tiếp của app (`rtmp://127.0.0.1:19350/live`).
- Đặt bitrate **3500 Kbps** và bộ mã hoá phần cứng **Apple VT**. **[CXM]** Nếu OBS báo không đặt được, vào **Settings → Output** chỉnh tay.

**Bấm lại "Khớp lại OBS" mỗi khi:** mở lại cửa sổ game, khởi động lại máy, hoặc OBS mất hình game. macOS đổi mã cửa sổ mỗi lần mở, nên cần khớp lại.

**Nếu không muốn dùng bộ chuyển tiếp của app:** dùng plugin *Multiple RTMP outputs* (sorayuki/obs-multi-rtmp) hoặc dịch vụ Restream, rồi cài đặt tay. Nếu đi theo cách này thì đừng bật các nơi phát trong thẻ 🎬 OBS.

---

## Phần B. Mỗi buổi live (theo thứ tự)

**Lần đầu (một lần):** thẻ **⚡ Kết nối & phát** → dán từng link kênh rồi bấm **➕ Kết nối**: link TikTok (`tiktok.com/@ten`), link kênh YouTube (`youtube.com/@ten`), link Trang Facebook. App tự nhận ra nền tảng. Ô nào báo thiếu thì bấm nút trên ô đó (**🔑 Dán API key**, **🔑 Dán Page token**).

| # | Việc | Ở đâu |
|---|---|---|
| 1 | Mở **Cau Ca Live.app** và **OBS** (nếu phát YouTube/Facebook) | Mac |
| 2 | Bắt đầu buổi live trên YouTube Studio / Live Producer (để nơi nhận sẵn sàng). Nếu TikTok chưa có khóa luồng, mở **LIVE Studio** | Các nền tảng |
| 3 | Bấm **▶️ Bắt đầu buổi live**. App mở cửa sổ game, nối comment, khớp OBS và phát hình. Danh sách ✅/⚠️ hiện ngay bên dưới | Bảng điều khiển |
| 4 | TikTok bằng LIVE Studio: *Chụp cửa sổ* (cửa sổ game) → bật **âm thanh máy tính** → **Go LIVE** | LIVE Studio |
| 5 | Xem các ô nền tảng: ô xanh 🔴 kèm số người xem là xong. Ô cam/đỏ thì đọc dòng chữ trên ô hoặc bấm **🩺 Kiểm tra** | Bảng điều khiển |
| 6 | Dùng điện thoại comment thử "chào quán" trên từng nơi. Trong game phải thấy khách mới; người từ YouTube có nhãn **YT**, từ Facebook có nhãn **FB** | Điện thoại |

Nếu kênh YouTube không tự nhận ra buổi live: dán thẳng **link buổi live** vào ô Kết nối nhanh.

**Kết thúc buổi live:**
1. Bấm **⏹ Kết thúc phát** (dừng OBS). Dừng LIVE Studio nếu có dùng. Bấm kết thúc trong YouTube Studio và Live Producer.
2. Nhấn **Ctrl+C** trong cửa sổ Terminal của app.
3. Nếu chưa tắt app mà các nơi đều đã dừng, app tự ngưng gọi Claude và báo về điện thoại (README mục 4a).

---

## Phần C. Lưu ý theo từng nền tảng

**TikTok**
- Đừng kêu người xem TikTok chuyển sang YouTube hay Facebook. TikTok có thể không đề xuất phiên live chủ yếu kéo người xem sang nơi khác (xem `docs/tang-luot-xem-va-qua.md`).

**YouTube**
- **Hạn mức:** đọc chat 8 giây/lần tốn khoảng 2.300 đơn vị/giờ, nên hạn mức miễn phí 10.000/ngày đủ khoảng **4 giờ live**. Live lâu hơn thì tăng số giây đọc chat (12 giây ≈ 6 giờ) hoặc xin thêm hạn mức trên Google Cloud.
- **Super Chat** được đổi ra món theo số tiền (khoảng 270 đ = 1 xu). Món trong quán là đồ ảo, chỉ để cảm ơn.
- **Hình dọc:** khi đang live, YouTube có thể hiện khung dọc với hai dải đen hai bên; bản xem lại thì đúng khung dọc. **[CXM]**
- **Nhạc bản quyền:** karaoke và nhạc YouTube có thể bị Content ID tắt tiếng hoặc chặn bản xem lại. Dùng nhạc nền tự tạo của quán là an toàn nhất.

**Facebook**
- Chỉ đọc được comment trên **Trang**.
- **Sao (Stars)** chưa đọc được qua API nên chưa thành món.
- Lượt bày tỏ cảm xúc vào game thành tim chung, nếu Facebook cho app đọc. **[CXM]**
- **Hình dọc:** vài người dùng OBS báo Facebook kéo giãn hình dọc. Hãy đặt đúng 720×1280 cho cả Base và Output, và thử trước bằng một buổi live **Chỉ mình tôi**. **[CXM]**

**Cả ba nơi**
- Đồ uống trong quán là **ảo**. Không cổ vũ uống thật, không bắt tặng quà để được thứ gì có giá trị thật.
- Cậu Cả luôn nói rõ mình là MC ảo do AI dẫn.
- Nên có **người thật** xuất hiện thỉnh thoảng (mic, camera nhỏ). Cả ba nền tảng đều ưu tiên phiên live có người dẫn thật.

---

## Phần D. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| YouTube/Facebook có hình nhưng **không có tiếng** | OBS: kiểm tra nguồn *macOS Audio Capture → Desktop Audio*, quyền *Ghi màn hình & âm thanh hệ thống*. Nếu tiếng hay mất sau vài phút, để cửa sổ game cùng màn hình (Space) với OBS |
| Có tiếng game nhưng **mất giọng Cậu Cả** | Bạn đang thu tiếng riêng của Chrome. Đổi sang **Desktop Audio** |
| Dòng *YouTube Live* báo "Kênh chưa có buổi live đang phát" | Dán thẳng **link buổi live** thay cho link kênh |
| Dòng *YouTube Live* báo lỗi key | Bật YouTube Data API v3 cho đúng project của key. Kiểm tra giới hạn website của key có `http://127.0.0.1:8686/*` |
| *Hết hạn mức YouTube* | App tự thử lại sau 30 phút. Dùng key ở project khác hoặc tăng số giây đọc chat |
| Dòng *Facebook Live* báo token hết hạn hoặc thiếu quyền | Lấy lại Page token với đủ 3 quyền (A5), dán vào rồi bấm **Lưu & kết nối** |
| Facebook: không thấy buổi live | Kiểm tra bạn đang live với tư cách **Trang** (không phải trang cá nhân) và token là của **đúng Trang đó** |
| Máy nóng, hình giật | Giảm bitrate xuống 2500 Kbps, giữ 720p 30 FPS, tắt các ứng dụng khác. OBS chỉ mã hoá một lần; bộ chuyển tiếp chép nguyên luồng nên gần như không tốn thêm sức máy, chỉ tốn thêm mạng tải lên |
| **Khớp lại OBS** báo *"OBS không phản hồi"* / *"Sai mật khẩu"* | Mở OBS, bật **Tools → WebSocket Server Settings → Enable WebSocket server**, chép đúng mật khẩu (Show Connect Info) vào thẻ 🎬 OBS rồi bấm Lưu |
| *"Chưa thấy cửa sổ game"* | Bấm **🪟 Mở cửa sổ game** trước, cấp quyền **Ghi màn hình** cho OBS, rồi bấm **Khớp lại OBS** lần nữa |
| Bộ chuyển tiếp báo *"Chưa có ffmpeg"* | Chạy `brew install ffmpeg` rồi mở lại app |
| Dòng *OBS phát hình* có ❌ ở một nơi, app báo *"Mất luồng …"* | Khóa luồng nơi đó sai hoặc đã hết hạn, hoặc nơi đó chưa sẵn sàng nhận hình. Sửa khóa trong thẻ 🎬 OBS, rồi **Dừng phát** → **Bắt đầu phát**. Các nơi khác vẫn phát bình thường |
| Game tính đôi khách, quà | Đang mở hai cửa sổ game. Đóng bớt, chỉ giữ cửa sổ mở từ bảng điều khiển |

## Nguồn
- YouTube Live chat API: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list · hạn mức: https://developers.google.com/youtube/v3/determine_quota_cost
- Facebook Live comments (Graph API): https://developers.facebook.com/docs/graph-api/server-sent-events/endpoints/live-comments/
- OBS – thu tiếng hệ thống trên macOS: https://obsproject.com/kb/macos-desktop-audio-capture-guide
- obs-websocket (điều khiển OBS): https://github.com/obsproject/obs-websocket · ffmpeg tee, nhiều đầu ra: https://trac.ffmpeg.org/wiki/Creating%20multiple%20outputs
- (Cách khác) Plugin Multiple RTMP outputs: https://github.com/sorayuki/obs-multi-rtmp
- Hình dọc trên Facebook/YouTube với OBS (diễn đàn): https://obsproject.com/forum/threads/obs-facebook-live-forces-1920%C3%971080-instead-of-1080%C3%971920-vertical-stream-stretched.193930 · https://obsproject.com/forum/threads/bug-%E2%80%93-obs-vertical-video-setting-showing-on-horizontal-format-on-youtube.125306
