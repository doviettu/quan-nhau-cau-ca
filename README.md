# 🍻 Quán nhậu vỉa hè Cậu Cả

Game web 3D tương tác cho **TikTok Live**. Người xem comment, thả tim, tặng quà để vào quán, chọn bàn, gọi món, hát karaoke và chơi trò nhỏ. Cậu Cả (chủ quán) có thể do **Claude** điều khiển để tự dẫn live.

Repo gồm:

| Thành phần | Vai trò |
|---|---|
| `index.html` | Toàn bộ game (Three.js qua CDN, âm thanh tạo bằng Web Audio) |
| `Cau Ca Live.app`, `start.command` | App khởi động trên Mac |
| `app/` | Máy chủ cục bộ: chạy game, cầu nối Claude, bảng điều khiển, điều khiển OBS |
| `bridge/` | Cầu nối Claude dùng riêng, khi không chạy app |

---

## 1. Chạy bằng app trên Mac (khuyên dùng)

### Lần đầu
1. **Cài Node.js 18 trở lên**: `brew install node`, hoặc tải bản LTS tại https://nodejs.org
2. **Tải repo về máy**:
   ```bash
   cd ~
   git clone https://github.com/doviettu/quan-nhau-cau-ca.git
   ```
3. Mở Finder → thư mục `quan-nhau-cau-ca` → nhấp đúp **`Cau Ca Live.app`**.
   - Nếu macOS báo *"không thể mở vì không xác định được nhà phát triển"*: chuột phải vào app → **Open** → **Open**. Chỉ cần làm một lần.
   - Nếu bạn tải repo bằng file ZIP và app vẫn không mở được, chạy lệnh này trong Terminal:
     ```bash
     xattr -dr com.apple.quarantine ~/quan-nhau-cau-ca
     ```
4. Cửa sổ Terminal mở ra, tự cài thư viện, rồi hỏi **Claude API key** (tạo tại console.anthropic.com → API Keys).
   - Key được lưu vào **Keychain** của Mac nên chỉ phải nhập một lần.
   - Muốn chạy không có Claude thì nhấn Enter để bỏ qua; Cậu Cả sẽ nói theo kịch bản có sẵn.
5. **Bảng điều khiển** tự mở trong trình duyệt tại http://127.0.0.1:8686/panel

Có thể kéo `Cau Ca Live.app` vào thư mục Applications hoặc Dock; app tự nhớ vị trí thư mục repo.

### Mỗi buổi live
1. Mở **TikFinity**, kết nối với tài khoản TikTok đang live (để game nhận comment, tim, quà).
2. Mở **OBS** (bản 28 trở lên). Lần đầu: vào **Tools → WebSocket Server Settings**, bật **Enable WebSocket server**, ghi lại mật khẩu.
3. Mở **Cau Ca Live.app**. Trong bảng điều khiển:
   - Nhập mật khẩu OBS rồi bấm **🎬 Thiết lập cảnh OBS**. App tự chuyển khung hình OBS sang dọc 1080×1920, tạo cảnh *"Cậu Cả Live"* chạy game, và đưa âm thanh game vào OBS.
   - Lần đầu: trong OBS vào **Settings → Stream**, dán *Server URL* và *Stream Key* lấy từ TikTok LIVE.
   - Bấm **🔴 Bắt đầu phát**.
4. Trong lúc live, điều khiển từ bảng điều khiển:
   - Dzô, bốc thăm, pháo hoa, quẩy.
   - Mở trò chơi nhỏ, cho qua bài karaoke.
   - **Gõ câu cho Cậu Cả nói**, thêm bài hát, gửi comment thử.
   - Bật/tắt Claude MC, đổi model, chỉnh số khách quen…: bấm **Lưu & áp dụng**, game trong OBS cập nhật ngay.
5. Kết thúc: bấm **⏹ Dừng phát**, rồi nhấn **Ctrl+C** trong cửa sổ Terminal để tắt app.

> Dùng **TikTok LIVE Studio** thay OBS? Trong LIVE Studio thêm nguồn **Liên kết / Trang web** với địa chỉ game hiện trong bảng điều khiển (nút 📋 để chép). Các nút lệnh trên bảng điều khiển vẫn hoạt động như bình thường.

### Lệnh khởi động (Terminal, trong thư mục `quan-nhau-cau-ca`)

| Lệnh | Tác dụng |
|---|---|
| `./start.command` | Chạy app (giống nhấp đúp `Cau Ca Live.app`) |
| `./start.command --reset-key` | Xoá Claude API key trong Keychain rồi hỏi nhập lại |
| `./start.command --no-open` | Chạy app nhưng không tự mở trình duyệt |
| `npm run status` | Xem trạng thái Claude, TikFinity, OBS và game (khi app đang chạy) |
| `npm run obs:setup` | Tạo hoặc cập nhật cảnh OBS |
| `npm run obs:start` / `npm run obs:stop` | Bắt đầu / dừng phát trên OBS |
| `npm run bridge` | Chỉ chạy cầu nối Claude (cổng 8787), không chạy app |

Cấu hình (OBS, TikFinity, model Claude, khách quen, trò chơi…) được lưu trong file `config.json`. File này chỉ tài khoản của bạn đọc được và không được đưa lên git.

## 2. Chạy game không cần app

- **Chơi thử**: mở `index.html` bằng Chrome, bấm **"Vào quán chơi thử"**.
- **Mở qua web** (bắt buộc nếu muốn dùng karaoke YouTube mà không chạy app): bật GitHub Pages trong **Settings → Pages → Deploy from a branch → `main` / root**. Game sẽ ở địa chỉ https://doviettu.github.io/quan-nhau-cau-ca/
- **Tham số URL** cho OBS / LIVE Studio:

  | Tham số | Tác dụng |
  |---|---|
  | `auto=1` | Vào quán ngay, không hiện màn hình chào |
  | `ws=ws://localhost:21213/` | Tự kết nối TikFinity |
  | `clean=1` | Ẩn các nút điều khiển trên màn hình |
  | `preset=live` | Bật cấu hình Live |
  | `autopilot=1` | Chỉ bật tự động dẫn live |
  | `ai=1` | Bật Claude MC |

## 3. Cấu hình Live

Nút **"Áp dụng cấu hình Live"** trong ⚙️ của game, hoặc tham số `preset=live`. App luôn dùng sẵn cấu hình này. Cấu hình gồm:

- **Claude MC**: Haiku 5.5, nhịp 20 giây, chi phí khoảng $0,02–0,06 mỗi giờ.
- **Tự động dẫn live**: bốc thăm, dzô, pháo hoa, dọn bàn.
- **Khách quen 🏠**: giữ quán luôn có ít nhất 20 người. Đây là nhân vật máy của quán, được đánh dấu rõ; họ không thả tim, không tặng quà, không lên bảng xếp hạng và không thắng trò chơi.
- **Trò chơi nhỏ**: tự mở mỗi 3 phút. Karaoke chốt bài từ 1 xu.

## 4. Claude MC và chi phí

Claude đọc comment, quà, tim và người mới vào, rồi điều khiển Cậu Cả: chào khách, trả lời bình luận, mở sự kiện hoặc trò chơi, mời món nhỏ cho khách.

Key được giữ trên máy theo hai cách, không có cách nào để key nằm trong trang game:
- **Chạy app**: key lưu trong Keychain, game gọi Claude qua đường `/mc` của app.
- **Không chạy app**: dùng cầu nối riêng.
  ```bash
  npm install
  export ANTHROPIC_API_KEY='key-that-cua-ban'
  npm run bridge
  ```
  Trong ⚙️ của game, điền ô cầu nối là `http://127.0.0.1:8787/mc`. Nếu game mở qua GitHub Pages, chạy cầu nối kèm biến `ALLOW_ORIGINS=https://doviettu.github.io`.

| Model | Phòng vắng | Phòng đông |
|---|---|---|
| Claude Haiku 5.5 | ~$0,02/giờ | ~$0,06/giờ |
| Claude Sonnet 5.5 | ~$0,36/giờ | ~$1,14/giờ |
| Claude Opus 5.5 | ~$0,73/giờ | ~$2,30/giờ |

Đây là ước tính với nhịp 20 giây và tối đa 150 lượt/giờ. Chi phí thực tế của phiên hiện trên bảng điều khiển. Nên đặt giới hạn chi tiêu cho key tại console.anthropic.com.

## 5. Karaoke YouTube

- Người xem comment `hát <tên bài>` rồi tặng quà để chốt bài. Quà từ 30 xu được chen hàng.
- **Tự tìm bài**: nhập YouTube Data API key trong bảng điều khiển. Hạn mức miễn phí khoảng 100 lượt tìm mỗi ngày.
- **Không có key**: dùng 🔎 Tìm và 🔗 Dán link trong ⚙️ của game, hoặc ô **Thêm bài** trên bảng điều khiển.
- **Lên mic**: người xem comment `xin lên mic`, bạn mời họ làm **Khách mời** trên TikTok. Giọng hát đi thẳng vào phòng live.

## 6. Lệnh cho người xem

| Comment | Tác dụng |
|---|---|
| (bất kỳ) | Vào quán, kéo ghế ngồi; lời chat hiện trên đầu nhân vật |
| `bàn 5` | Ngồi bàn số 5 (dãy ngoài 1–4, dãy trong 5–9) |
| `bàn riêng` | Giữ một bàn cho hội bạn |
| `ghép Tên` / `ngồi với Tên` | Ngồi chung bàn với bạn |
| `mời Tên` | Rủ bạn qua bàn mình |
| `tên bàn Hội Bia` | Đặt tên bàn |
| `đổi bàn` | Chuyển sang bàn khác |
| `dzô`, `100%` | Cả bàn cụng ly |
| `cụng ly với Tên` | Mời riêng một người một ly |
| `nhảy` | Quẩy tại chỗ |
| `oẳn tù tì búa/bao/kéo` | Thách Cậu Cả |
| `xí ngầu` | Lắc xúc xắc |
| `trà đá` | Gọi trà đá cho tỉnh rượu |
| `hát <tên bài>` + tặng quà | Đăng ký hát karaoke |
| `hát` | Hát mộc với nhạc của quán |
| `xin lên mic` | Xin làm khách mời để hát |
| `đố vui`, `đoán số`, `nhanh tay`, `đua bàn` | Mở trò chơi nhỏ |
| `về nha`, `tính tiền` | Ra về |
| Thả tim | Đẩy thanh **Không khí**; đủ 100% thì cả quán quẩy |
| Tặng quà | Nhân viên bưng món ra bàn; quà từ 500 xu bắn pháo hoa |

## 7. Khắc phục sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| App báo chưa có Node.js | Chạy `brew install node`, hoặc cài bản LTS từ nodejs.org |
| *"Cổng 8686 đang bận"* | App đã chạy ở một cửa sổ Terminal khác; mở http://127.0.0.1:8686/panel hoặc đóng cửa sổ cũ |
| OBS báo sai mật khẩu hoặc không phản hồi | Bật WebSocket server trong OBS và nhập đúng mật khẩu trên bảng điều khiển |
| Không đổi được khung hình 1080×1920 | Dừng phát/ghi hình trong OBS rồi bấm **Thiết lập cảnh** lại |
| Không có tiếng game trên live | Trong mixer của OBS kiểm tra nguồn *"Cậu Cả – Game"* chưa bị tắt tiếng |
| Không nhận được comment | Mở TikFinity và kiểm tra địa chỉ WebSocket (thử `ws://127.0.0.1:21213/`) |
| YouTube báo lỗi 153 | Chạy game qua app hoặc GitHub Pages, không mở file trực tiếp |
| Claude MC tự tắt | Key sai hoặc hết hạn mức; chạy `./start.command --reset-key` để nhập key mới |

## 8. Quyền riêng tư và minh bạch

- App chỉ chạy trên máy bạn (`127.0.0.1`) và không có máy chủ trên mạng.
- Claude API key nằm trong Keychain; cấu hình nằm trong `config.json`.
- Nội dung chỉ được gửi ra ngoài khi bạn bật tính năng tương ứng:
  - **Claude MC**: tóm tắt diễn biến phòng live được gửi tới Anthropic.
  - **Karaoke YouTube**: tên bài được gửi tới Google để tìm, và video phát qua `youtube-nocookie.com`.
- Khách quen 🏠 là nhân vật máy, được đánh dấu rõ, và không tạo tim, quà hay thứ hạng giả.
- Đồ ăn, bia trong quán là **ảo**. Cậu Cả do AI dẫn được dặn không cổ vũ uống rượu bia thật và luôn nói thật mình là MC ảo khi được hỏi.
