# 🍻 Quán nhậu vỉa hè Cậu Cả

Game web 3D tương tác cho **TikTok Live**. Người xem comment, thả tim, tặng quà để vào quán, chọn bàn, gọi món, hát karaoke và chơi trò nhỏ. Cậu Cả (chủ quán) có thể do **Claude** điều khiển để tự dẫn live.

Toàn bộ game nằm trong **một file `index.html`**: không cần cài đặt hay đăng nhập, không có quảng cáo hay thanh toán.

---

## 0. Tải về máy

```bash
git clone https://github.com/doviettu/quan-nhau-cau-ca.git
cd quan-nhau-cau-ca
```

Hoặc trên GitHub bấm **Code → Download ZIP** rồi giải nén.

## 1. Chạy thử nhanh

Mở `index.html` bằng Chrome và bấm **"Vào quán chơi thử"**. Khách ảo sẽ tự vào quán, comment và tặng quà để bạn xem game hoạt động.

> Lần đầu mở cần có Internet để tải thư viện 3D (Three.js).

## 2. Mở game qua web (bắt buộc nếu dùng karaoke YouTube)

YouTube chặn video nhúng khi mở game bằng file trực tiếp (lỗi 153), nên hãy mở game qua `http/https`:

- **GitHub Pages (khuyên dùng):**
  1. Vào repo → **Settings → Pages**.
  2. Mục **Source** chọn *Deploy from a branch*.
  3. Chọn nhánh chứa `index.html`, thư mục `/ (root)`, rồi **Save**.
  4. Vài phút sau game chạy ở địa chỉ dạng `https://<tên-bạn>.github.io/<repo>/`.

  *Repo riêng tư cần gói GitHub trả phí mới bật được Pages.*
- **Chạy trên máy:** trong thư mục chứa `index.html`, chạy `npx serve` hoặc `python -m http.server 8000`, rồi mở `http://localhost:...`.

## 3. Kết nối TikTok Live

Game không đăng nhập TikTok mà nhận sự kiện qua **TikFinity** (hoặc công cụ tương thích phát sự kiện qua WebSocket):

1. Cài và chạy TikFinity trên máy tính, kết nối với tài khoản TikTok đang live.
2. Trong game, bấm **⚙️ → Kết nối** (mặc định `ws://localhost:21213/`).
3. Góc trái trên màn hình hiện **● LIVE** là đã kết nối. Nếu mất kết nối, game tự kết nối lại.

## 4. Đưa game lên Live

- **TikTok LIVE Studio hoặc OBS:** thêm nguồn *Browser / Trang web* với URL:

  ```
  https://<tên-bạn>.github.io/<repo>/?auto=1&ws=ws://localhost:21213/&clean=1&preset=live
  ```

  | Tham số | Tác dụng |
  |---|---|
  | `auto=1` | Vào quán ngay, không hiện màn hình chào |
  | `ws=...` | Tự kết nối TikFinity |
  | `clean=1` | Ẩn các nút điều khiển trên màn hình |
  | `preset=live` | Bật cấu hình Live (xem mục 5) |
  | `autopilot=1` | Chỉ bật tự động dẫn live |
  | `ai=1` | Bật Claude MC (dùng key hoặc cầu nối đã lưu trong trình duyệt) |

- **Kích thước khung:** 1080×1920 (dọc) cho TikTok, hoặc khung ngang tùy ý. Game tự căn khung hình theo tỉ lệ màn hình.

## 5. Cấu hình Live một chạm

Bấm **⚙️ → "Áp dụng cấu hình Live (Haiku 5.5)"**. Nút này bật cùng lúc:

- **Claude MC** dùng Claude Haiku 5.5: nhịp 20 giây, tối đa 180 lượt/giờ, chi phí khoảng $0,02–0,06 mỗi giờ.
- **Tự động dẫn live:** bốc thăm, dzô, pháo hoa, dọn bàn, giữ màn hình sáng.
- **Khách quen 🏠** giữ quán luôn có ít nhất 20 người. Đây là nhân vật máy của quán: họ không thả tim, không tặng quà, không lên bảng xếp hạng và không thắng trò chơi.
- **Trò chơi nhỏ** mỗi 3 phút; karaoke chốt bài từ 1 xu.

## 6. Claude MC (Cậu Cả do AI dẫn)

Claude đọc comment, quà, tim và người mới vào, rồi điều khiển Cậu Cả: chào khách, trả lời bình luận, mở sự kiện hoặc trò chơi nhỏ, mời món nhỏ cho khách.

Có hai cách cấp quyền gọi Claude:

1. **Dán API key vào ⚙️**: nhanh, nhưng key nằm trong trình duyệt. Dùng key riêng có đặt giới hạn chi tiêu tại console.anthropic.com, và đừng bật trên máy dùng chung.
2. **Cầu nối trên máy (an toàn hơn)**: key chỉ nằm trên máy bạn, trang game không cần key.
   ```bash
   cd quan-nhau-cau-ca/bridge      # thư mục bridge nằm trong repo vừa tải về
   npm install
   export ANTHROPIC_API_KEY='key-that-cua-ban'   # lấy ở console.anthropic.com → API Keys
   npm start                                     # hoặc đăng nhập bằng `ant auth login` rồi `npm start`
   ```
   Thấy dòng *"Cầu nối Claude đang chạy: http://127.0.0.1:8787/mc"* là xong; để cửa sổ Terminal mở suốt buổi live.
   Trong game, điền ô cầu nối là `http://127.0.0.1:8787/mc`.
   - Nếu game chạy trên GitHub Pages, thêm biến `ALLOW_ORIGINS=https://<tên-bạn>.github.io` khi chạy cầu nối.
   - Cầu nối chỉ nhận yêu cầu từ trang game của bạn, chỉ cho dùng 3 model, và mặc định tối đa 300 lượt/giờ (đổi bằng biến `MAX_CALLS_PER_HOUR`).

**Chi phí ước tính mỗi giờ** (nhịp 20 giây, tối đa 150 lượt/giờ):

| Model | Phòng vắng | Phòng đông |
|---|---|---|
| Claude Haiku 5.5 | ~$0,02 | ~$0,06 |
| Claude Sonnet 5.5 | ~$0,36 | ~$1,14 |
| Claude Opus 5.5 | ~$0,73 | ~$2,30 |

Chi phí thực tế của phiên hiện trong **⚙️ → 🤖**.

## 7. Karaoke YouTube

- Người xem comment `hát <tên bài>` rồi tặng quà (mặc định từ 1 xu) để chốt bài. Quà từ 30 xu được chen hàng.
- **Tự tìm bài:** nhập **YouTube Data API key** vào ⚙️. Hạn mức miễn phí khoảng 100 lượt tìm mỗi ngày.
- **Không có key:** bấm 🔎 để mở trang tìm trên YouTube, rồi 🔗 để dán link vào bài trong hàng chờ.
- **Lên mic:** người xem comment `xin lên mic`, bạn mời họ làm **Khách mời** trên TikTok, rồi bấm *"Đánh dấu đang lên mic"* trong game.
- Mic của máy bạn dùng để chấm điểm, có thể phát ra loa kèm tiếng vang (nhớ đeo tai nghe).

## 8. Lệnh cho người xem

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
| `oẳn tù tì búa/bao/kéo` | Thách Cậu Cả: thắng được đĩa đậu phộng, thua thì uống phạt |
| `xí ngầu` | Lắc xúc xắc, ra 6 thì cả bàn uống |
| `trà đá` | Gọi trà đá cho tỉnh rượu |
| `hát <tên bài>` + tặng quà | Đăng ký hát karaoke |
| `hát` | Hát mộc với nhạc của quán |
| `xin lên mic` | Xin làm khách mời TikTok để hát |
| `đố vui`, `đoán số`, `nhanh tay`, `đua bàn` | Mở trò chơi nhỏ |
| `về nha`, `tính tiền` | Ra về |
| Thả tim | Đẩy thanh **Không khí**; đủ 100% thì cả quán quẩy; mỗi 300 tim cả quán dzô |
| Tặng quà | Nhân viên bưng món ra bàn (tặng x2 là món lớn); quà từ 500 xu bắn pháo hoa |

## 9. Phím tắt (máy tính)

`D` dzô · `L` bốc thăm · `F` pháo hoa · `P` quẩy · `M` tắt/bật tiếng · `H` ẩn/hiện nút · `Esc` đóng bảng

## 10. Khắc phục sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Màn hình đen, báo không tải được Three.js | Kiểm tra mạng Internet rồi tải lại trang |
| Không có tiếng | Chạm vào màn hình một lần (trình duyệt chặn tự phát âm thanh) và kiểm tra nút 🔊 |
| YouTube báo lỗi 153 | Mở game qua `http/https` (mục 2) |
| Không nhận được comment | Kiểm tra TikFinity đang chạy và đúng địa chỉ WebSocket; thử `ws://127.0.0.1:21213/` |
| Claude MC tự tắt | Key sai hoặc hết hạn mức; xem dòng ⚠️ trong ⚙️ → 🤖 |
| Máy yếu bị giật | Game tự giảm độ phân giải; có thể hạ số khách quen tối thiểu |

## 11. Quyền riêng tư và minh bạch

- Game không có máy chủ riêng. Settings và key được lưu trong trình duyệt của bạn (`localStorage`).
- Nội dung chỉ được gửi ra ngoài khi bạn bật tính năng tương ứng:
  - **Claude MC**: tóm tắt diễn biến phòng live được gửi tới Anthropic (trực tiếp hoặc qua cầu nối).
  - **Karaoke YouTube**: tên bài được gửi tới Google để tìm, và video phát qua `youtube-nocookie.com`.
- Khách quen 🏠 là nhân vật máy, được đánh dấu rõ, và không tạo tim, quà hay thứ hạng giả.
- Đồ ăn, bia trong quán là **ảo**. Cậu Cả do AI dẫn được dặn không cổ vũ uống rượu bia thật và luôn nói thật mình là MC ảo khi được hỏi.
