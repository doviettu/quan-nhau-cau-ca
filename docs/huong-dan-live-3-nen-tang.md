# Hướng dẫn live cùng lúc TikTok, YouTube và Facebook

Dành cho máy Mac mini chạy app "Cậu Cả Live". Một cửa sổ game được phát lên ba nơi. Comment, quà và tim từ cả ba nơi đổ về chung một quán.

```
                ┌──────────────── Cửa sổ game (Chrome dọc 540×960) ────────────────┐
                │                                                                  │
   TikTok LIVE Studio ── chụp cửa sổ ──► TikTok           OBS ── chụp cửa sổ ──► YouTube + Facebook
                                                                 (plugin Multiple RTMP outputs)

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
- Tài khoản đủ điều kiện live và đã có **TikTok LIVE Studio**.
- Không cần làm gì thêm cho app: lúc live chỉ cần nhập **@tên**.

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

### A6. OBS Studio (phát lên YouTube + Facebook)
1. Tải **OBS Studio** bản 30 trở lên tại obsproject.com. Mac chip M thì chọn bản **Apple Silicon**.
2. Cài plugin **Multiple RTMP outputs** (sorayuki/obs-multi-rtmp trên GitHub):
   - Chọn bản cho đúng phiên bản OBS và bản **universal** hoặc arm64.
   - Kiến trúc của plugin phải khớp với OBS (cùng là Apple Silicon), nếu không plugin sẽ không chạy. **[CXM]**
   - Nếu không cài được plugin: dùng dịch vụ **Restream** (gói miễn phí phát được tới 2 nơi). OBS phát một luồng lên Restream, Restream phát lại lên YouTube và Facebook.
3. **Settings → Video:**
   - Base (Canvas) và Output: **720×1280** (dọc).
   - FPS: **30**.
   - Cửa sổ game có kích thước 540×960 nên 720×1280 là đủ nét. Muốn 1080×1920 thì phóng to cửa sổ game trước.
4. **Settings → Output** (chế độ Advanced):
   - Bộ mã hoá: **Apple VT H264 Hardware Encoder**.
   - Bitrate: **3500 Kbps**.
   - Keyframe interval: **2 giây**.
5. **Settings → Stream:** chọn **YouTube – RTMPS**, dán khóa luồng YouTube.
6. Mở thẻ **Multiple output** (của plugin) → **Add new target**:
   - Tên: Facebook.
   - Server: `rtmps://live-api-s.facebook.com:443/rtmp/`.
   - Key: khóa luồng Facebook.
   - Chọn "dùng chung bộ mã hoá với luồng chính" để máy không phải mã hoá thêm một lần. **[CXM]**
7. **Nguồn (Sources):**
   - **macOS Screen Capture** → Method: **Window Capture** → chọn cửa sổ game (Chrome) → kéo phủ kín khung.
   - **macOS Audio Capture** → chọn **Desktop Audio**. Cách này thu cả tiếng game, nhạc YouTube và giọng Cậu Cả, vì giọng Cậu Cả phát ra loa bằng chương trình riêng, không phải từ Chrome.
   - Không nên chọn "chỉ tiếng của một ứng dụng", vì sẽ mất giọng Cậu Cả.
   - Cấp quyền khi macOS hỏi: **Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Ghi màn hình & âm thanh hệ thống → OBS**.

---

## Phần B. Mỗi buổi live (theo thứ tự)

| # | Việc | Ở đâu |
|---|---|---|
| 1 | Mở **Cau Ca Live.app**. Bảng điều khiển tự mở | Mac |
| 2 | Bấm **🪟 Mở cửa sổ game**. Chỉ mở **một** cửa sổ. Để cửa sổ này cùng màn hình (Space) với OBS và LIVE Studio, không thu nhỏ xuống Dock | Bảng điều khiển |
| 3 | **TikTok LIVE Studio:** bố cục dọc → Thêm nguồn → *Chụp cửa sổ* (cửa sổ game) → bật **âm thanh máy tính** → **Go LIVE** | LIVE Studio |
| 4 | **OBS:** bấm **Start Streaming** (YouTube). Trong thẻ *Multiple output*, bấm **Start** cho Facebook | OBS |
| 5 | **YouTube Studio:** đợi hình hiện lên rồi bấm **Phát trực tiếp** (nếu không bật tự bắt đầu). Bấm *Chia sẻ* để chép **link buổi live** | YouTube Studio |
| 6 | **Live Producer:** bấm **Phát trực tiếp** khi hình đã lên | Facebook |
| 7 | Bảng điều khiển → ⚙️ Cấu hình phiên live, kết nối từng nơi (bảng ngay dưới) | Bảng điều khiển |
| 8 | Kiểm tra mục **📋 Trạng thái**: ba dòng TikTok / YouTube / Facebook đều 🔴 kèm số người xem. Dòng **Phiên live**: "đang live" | Bảng điều khiển |
| 9 | Dùng điện thoại comment thử "chào quán" trên cả ba nơi. Trong game phải thấy khách mới. Người từ YouTube có nhãn **YT**, từ Facebook có nhãn **FB** | Điện thoại |

**Bước 7, kết nối từng nơi:**

| Nơi | Nhập gì | Bấm |
|---|---|---|
| **TikTok** | `@tên` tài khoản đang live | Kết nối |
| **YouTube** | Link kênh (`https://youtube.com/@tenkenh`) hoặc **link buổi live** vừa chép (chắc ăn hơn). Lần đầu dán thêm *key riêng cho chat* | Kết nối |
| **Facebook** | Để trống ô Trang, lần đầu dán **Page access token** | Lưu & kết nối |

App nhớ các thông tin này. Lần sau chỉ cần bấm Kết nối, hoặc app tự kết nối khi mở.

**Kết thúc buổi live:**
1. Dừng live trong LIVE Studio, OBS (cả Facebook), YouTube Studio và Live Producer.
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
| Máy nóng, hình giật | Giảm bitrate xuống 2500 Kbps, giữ 720p 30 FPS, tắt các ứng dụng khác. Nếu vẫn nặng, dùng Restream thay plugin để OBS chỉ phát một luồng |
| Game tính đôi khách, quà | Đang mở hai cửa sổ game. Đóng bớt, chỉ giữ cửa sổ mở từ bảng điều khiển |

## Nguồn
- YouTube Live chat API: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list · hạn mức: https://developers.google.com/youtube/v3/determine_quota_cost
- Facebook Live comments (Graph API): https://developers.facebook.com/docs/graph-api/server-sent-events/endpoints/live-comments/
- OBS – thu tiếng hệ thống trên macOS: https://obsproject.com/kb/macos-desktop-audio-capture-guide
- Plugin Multiple RTMP outputs: https://github.com/sorayuki/obs-multi-rtmp · cài trên Mac chip M: https://obsproject.com/forum/threads/help-please-how-to-install-the-obs-multi-rtmp-extension-on-mac-os-m1.159574/latest
- Hình dọc trên Facebook/YouTube với OBS (diễn đàn): https://obsproject.com/forum/threads/obs-facebook-live-forces-1920%C3%971080-instead-of-1080%C3%971920-vertical-stream-stretched.193930 · https://obsproject.com/forum/threads/bug-%E2%80%93-obs-vertical-video-setting-showing-on-horizontal-format-on-youtube.125306
