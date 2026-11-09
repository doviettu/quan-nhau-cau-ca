# 🍻 Quán nhậu vỉa hè Cậu Cả

Game web 3D tương tác cho **TikTok Live**. Người xem comment, thả tim, tặng quà để vào quán, chọn bàn, gọi món, hát karaoke và chơi trò nhỏ. Cậu Cả (chủ quán) có thể do **Claude** điều khiển để tự dẫn live.

Repo gồm:

| Thành phần | Vai trò |
|---|---|
| `index.html` | Toàn bộ game (Three.js qua CDN, âm thanh tạo bằng Web Audio) |
| `Cau Ca Live.app`, `start.command` | App khởi động trên Mac |
| `app/` | Máy chủ cục bộ: chạy game, cầu nối Claude, kết nối TikTok, bảng điều khiển, mở cửa sổ game cho LIVE Studio |
| `bridge/` | Cầu nối Claude dùng riêng, khi không chạy app |

---

## 1. Chạy bằng app trên Mac (khuyên dùng)

### Lần đầu
1. **Cài Node.js 20 trở lên**: `brew install node`, hoặc tải bản LTS tại https://nodejs.org
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
1. Kết nối TikTok để game nhận comment, tim, quà. Chọn một trong hai cách:
   - **Kết nối thẳng (không cần TikFinity):** bắt đầu live trên TikTok, rồi trong bảng điều khiển → **⚙️ Cấu hình phiên live** nhập **@tên tài khoản** và bấm **Kết nối**. Dòng *TikTok Live* ở phần Trạng thái hiện 🔴 và số người xem là xong. Nếu bạn bấm trước khi live, app tự thử lại mỗi 30 giây. App nhớ tên, các lần sau tự kết nối.
   - **Qua TikFinity:** mở TikFinity, kết nối với tài khoản đang live. Nếu đang kết nối thẳng thì bấm **Ngắt** để game quay về dùng TikFinity.
2. Mở **Cau Ca Live.app**, rồi trong bảng điều khiển bấm **🪟 Mở cửa sổ game**. Game mở trong cửa sổ Chrome dọc 540×960, tự phát tiếng. Chỉ mở **một** cửa sổ game, vì hai bản cùng chạy sẽ tính đôi khách, quà và lượt gọi Claude.
3. Trong **TikTok LIVE Studio**:
   - Chọn bố cục **dọc**, rồi **Thêm nguồn → Chụp cửa sổ**, chọn cửa sổ game và kéo phủ kín khung. LIVE Studio không nhận địa chỉ trên máy (`localhost`, `127.0.0.1`) ở nguồn *Liên kết*, nên phải dùng *Chụp cửa sổ*.
   - Cắt bỏ thanh tiêu đề cửa sổ ở cạnh trên: giữ **⌥ Option** rồi kéo cạnh trên xuống, nếu LIVE Studio hỗ trợ.
   - Bật **âm thanh máy tính** để người xem nghe nhạc và karaoke.
   - Bấm **Go LIVE**. Đừng thu nhỏ cửa sổ game xuống Dock; để cửa sổ khác che lên thì được.
4. Trong lúc live, điều khiển từ bảng điều khiển:
   - Dzô, bốc thăm, pháo hoa, quẩy.
   - Mở trò chơi nhỏ, cho qua bài karaoke.
   - **Gõ câu cho Cậu Cả nói**, thêm bài hát, gửi comment thử.
   - Bật/tắt Claude MC, đổi model, chỉnh số khách quen…: bấm **Lưu & áp dụng**, cửa sổ game cập nhật ngay.
5. Kết thúc: dừng live trong LIVE Studio, rồi nhấn **Ctrl+C** trong cửa sổ Terminal để tắt app.

> Không có Chrome? Cài bằng `brew install --cask google-chrome`. Nếu chưa cài, nút **Mở cửa sổ game** mở game trong trình duyệt mặc định, và cửa sổ đó có thêm thanh địa chỉ.

### Lệnh khởi động (Terminal, trong thư mục `quan-nhau-cau-ca`)

| Lệnh | Tác dụng |
|---|---|
| `./start.command` | Chạy app (giống nhấp đúp `Cau Ca Live.app`) |
| `./start.command --reset-key` | Xoá Claude API key trong Keychain rồi hỏi nhập lại |
| `./start.command --no-open` | Chạy app nhưng không tự mở trình duyệt |
| `npm run status` | Xem trạng thái Claude, TikTok và cửa sổ game (khi app đang chạy) |
| `npm run window` | Mở cửa sổ game (giống nút **🪟 Mở cửa sổ game**) |
| `npm run bridge` | Chỉ chạy cầu nối Claude (cổng 8787), không chạy app |

Cấu hình (tài khoản TikTok, TikFinity, model Claude, khách quen, trò chơi…) được lưu trong file `config.json`. File này chỉ tài khoản của bạn đọc được và không được đưa lên git.

## 2. Chạy game không cần app

- **Chơi thử**: mở `index.html` bằng Chrome, bấm **"Vào quán chơi thử"**.
- **Mở qua web** (bắt buộc nếu muốn dùng karaoke YouTube mà không chạy app): bật GitHub Pages trong **Settings → Pages → Deploy from a branch → `main` / root**. Game sẽ ở địa chỉ https://doviettu.github.io/quan-nhau-cau-ca/
- **Tham số URL** khi đưa game lên live:

  | Tham số | Tác dụng |
  |---|---|
  | `auto=1` | Vào quán ngay, không hiện màn hình chào |
  | `ws=ws://localhost:21213/` | Tự kết nối TikFinity |
  | `clean=1` | Ẩn các nút điều khiển trên màn hình |
  | `preset=live` | Bật cấu hình Live |
  | `safe=0` | Bỏ lề chừa cho giao diện TikTok (mặc định khi `preset=live` và khung dọc, bảng thông tin được đẩy xuống/lên để tên kênh và ô bình luận của TikTok không che) |
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
- **Tự tìm bài**: nhập YouTube Data API key trong bảng điều khiển (hoặc ⚙️ của game – key được lưu lên app). Bấm **🔎 Kiểm tra key** để thử tìm một bài: nếu lỗi, bảng điều khiển nói rõ cách sửa (key sai, chưa bật YouTube Data API v3, key giới hạn trang web, hết hạn mức). Bấm **🎤 Phát thử** để thêm bài vào hàng chờ và nghe thử trong game. Hạn mức miễn phí khoảng 100 lượt tìm mỗi ngày.
- **Không có key**: dùng 🔎 Tìm và 🔗 Dán link trong ⚙️ của game, hoặc ô **Thêm bài** trên bảng điều khiển.
- **Lên mic**: người xem comment `xin lên mic`, bạn mời họ làm **Khách mời** trên TikTok. Giọng hát đi thẳng vào phòng live.

## 6. Lệnh cho người xem

| Comment | Tác dụng |
|---|---|
| (bất kỳ) | Vào quán, kéo ghế ngồi, có ly bia trước mặt; lời chat hiện trên đầu nhân vật |
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
| Tặng quà | Nhân viên bưng món ra bàn; tên người tặng hiện trên đầu nhân vật vài giây (bình thường tên được ẩn cho gọn màn hình); quà từ 500 xu bắn pháo hoa |

## 7. Khắc phục sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| App báo chưa có Node.js | Chạy `brew install node`, hoặc cài bản LTS từ nodejs.org |
| *"Cổng 8686 đang bận"* | App đã chạy ở một cửa sổ Terminal khác; mở http://127.0.0.1:8686/panel hoặc đóng cửa sổ cũ |
| Khung hình dư một dải phía trên | Đó là thanh tiêu đề cửa sổ Chrome: cắt cạnh trên của nguồn *Chụp cửa sổ* trong LIVE Studio |
| Không có tiếng game trên live | Bật âm thanh máy tính trong LIVE Studio và cho phép quyền *Ghi màn hình & âm thanh* trong Cài đặt hệ thống của macOS |
| Bảng điều khiển báo *"Chưa thấy cửa sổ game"* | Bấm **🪟 Mở cửa sổ game**; nếu cửa sổ đã mở thì bấm **🔄 Tải lại game** |
| Không nhận được comment | Kết nối thẳng: kiểm tra đúng **@tên** và tài khoản đang live (dòng *TikTok Live* trong bảng điều khiển báo lỗi cụ thể). Dùng TikFinity: kiểm tra địa chỉ WebSocket (thử `ws://127.0.0.1:21213/`) |
| *"Dịch vụ ký kết nối đang giới hạn lượt"* | Gói miễn phí của Euler Stream bị giới hạn; app tự thử lại sau 60 giây. Live thường xuyên thì lấy API key tại eulerstream.com rồi chạy app với biến `EULER_API_KEY`, hoặc dùng TikFinity |
| YouTube báo lỗi 153 | Chạy game qua app hoặc GitHub Pages, không mở file trực tiếp |
| Claude MC tự tắt | Key sai hoặc hết hạn mức; chạy `./start.command --reset-key` để nhập key mới |

## 8. Quyền riêng tư và minh bạch

- App chỉ chạy trên máy bạn (`127.0.0.1`) và không có máy chủ trên mạng.
- Claude API key nằm trong Keychain; cấu hình nằm trong `config.json`.
- Nội dung chỉ được gửi ra ngoài khi bạn bật tính năng tương ứng:
  - **Claude MC**: tóm tắt diễn biến phòng live được gửi tới Anthropic.
  - **Karaoke YouTube**: tên bài được gửi tới Google để tìm, và video phát qua `youtube-nocookie.com`.
  - **Kết nối thẳng TikTok**: app dùng thư viện mã nguồn mở `tiktok-live-connector` để đọc phiên live công khai, không đăng nhập TikTok. Thư viện gửi **tên tài khoản** của bạn tới dịch vụ Euler Stream để ký kết nối. Đây là cách đọc không chính thức, TikTok có thể thay đổi bất cứ lúc nào; khi đó hãy dùng TikFinity.
- Khách quen 🏠 là nhân vật máy, được đánh dấu rõ, và không tạo tim, quà hay thứ hạng giả.
- Đồ ăn, bia trong quán là **ảo**. Cậu Cả do AI dẫn được dặn không cổ vũ uống rượu bia thật và luôn nói thật mình là MC ảo khi được hỏi.
