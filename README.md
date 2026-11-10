# 🍻 Quán nhậu vỉa hè Cậu Cả

Game web 3D tương tác cho **TikTok Live**. Người xem comment, thả tim, tặng quà để vào quán, chọn bàn, gọi món, hát karaoke và chơi trò nhỏ. Cậu Cả (chủ quán) có thể do **Claude** điều khiển để tự dẫn live.

Repo gồm:

| Thành phần | Vai trò |
|---|---|
| `index.html` | Toàn bộ game (Three.js qua CDN, âm thanh tạo bằng Web Audio) |
| `Cau Ca Live.app`, `start.command` | App khởi động trên Mac |
| `app/` | Máy chủ cục bộ: chạy game, cầu nối Claude, kết nối TikTok, bảng điều khiển, mở cửa sổ game cho LIVE Studio |
| `bridge/` | Cầu nối Claude dùng riêng, khi không chạy app |
| `docs/tang-luot-xem-va-qua.md` | Nghiên cứu cách tăng lượt xem, tương tác và quà trên TikTok LIVE, kèm các rủi ro vi phạm cần tránh |

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
- **Trò chơi nhỏ**: tự mở mỗi 3 phút (đố vui, đoán số, nhanh tay, đua bàn, bình chọn). Đố vui có hơn 130 câu: địa lý, lịch sử, ẩm thực, câu đố mẹo, thành ngữ, khoa học, tính nhanh. Karaoke: tặng quà từ 50 xu để đăng ký hát, từ 180 xu để chen hàng.
- **Xiếc đường phố**: khoảng 6 phút một lần có một tiết mục (đổi được trong bảng điều khiển).

## 4. Cậu Cả dẫn live bằng giọng nói

Cậu Cả nói thành tiếng mọi câu thoại: chào khách, gọi tên người tặng quà, trả lời comment, giới thiệu trò chơi. Tính năng này **bật sẵn** ở cấu hình Live.
- **Giọng đọc VieNeu-TTS (khuyên dùng):** giọng tiếng Việt tự nhiên, chạy ngay trên máy, có 25 giọng (mặc định *Trúc Ly*: giọng nữ miền Bắc, tự nhiên, hợp kiểu MC hào hứng). Máy đang để giọng mặc định cũ *Hải Đăng* sẽ tự chuyển sang *Trúc Ly* một lần; muốn giọng khác thì chọn lại. Âm thanh ra loa máy, nên trong LIVE Studio phải bật **âm thanh máy tính**.
  - **Cài một lần:** nhấp đúp file **`cai-giong-vieneu.command`** trong thư mục `quan-nhau-cau-ca`. File tự cài Python (nếu máy chưa có) và thư viện VieNeu, rồi tải mô hình giọng khoảng vài trăm MB. Toàn bộ nằm trong `~/Library/Application Support/CauCaLive/vieneu`.
  - Mở lại app: app tự chạy VieNeu nền ở cổng 8011, lần đầu mất khoảng một phút. Đổi giọng ở **⚙️ Cấu hình → Giọng Cậu Cả**.
  - Nếu VieNeu chưa cài, đang khởi động hoặc bị lỗi, app tạm dùng giọng **Linh** của macOS. Mac chưa có giọng Linh thì cài trong *Cài đặt hệ thống → Trợ năng → Nội dung được đọc → Giọng hệ thống → Quản lý giọng → Tiếng Việt*.
  - Bấm **Thử giọng** trên bảng điều khiển để nghe thử.
  - Thư viện VieNeu dùng giấy phép Apache 2.0. Riêng giấy phép mô hình giọng, hãy xem trang [VieNeu-TTS-v3-Turbo trên Hugging Face](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo) trước khi dùng cho mục đích thương mại.
- **Không để quán im lặng:** phòng im quá số giây đã đặt (mặc định 40 giây) thì Cậu Cả tự nói.
  - Nếu đang bật Claude MC, game nhờ Claude nói trước: gọi tên một khách đang ngồi, hỏi han hoặc gợi ý trò chơi.
  - Claude không trả lời thì Cậu Cả nói một câu theo tình huống thật của quán: tên khách, bàn đang ngồi, người dẫn đầu, trò đang mở.
- **MC dẫn sự kiện:** khi quán im, Cậu Cả xen kẽ lời dẫn theo tình huống với câu khuấy động (điểm danh vùng miền, đếm ngược thả tim, mời lên hát, mời bình chọn).
- **Hài độc thoại:** khoảng 4 phút một lần, khi sân khấu rảnh (không có người hát, trò chơi hay xiếc), Cậu Cả bước ra micro trên sân khấu karaoke và kể một chuyện cười ngắn (kho gần 20 chuyện, không lặp lại cho tới khi kể hết). Tới câu chốt, giọng VieNeu bật cười và khách trong quán cười theo. Người xem comment `kể chuyện` để nghe thêm (cách nhau ít nhất 1 phút). Bật/tắt và đổi số phút ở **⚙️ Cấu hình**; bảng điều khiển có nút **🎭 Kể chuyện cười**, **📣 Khuấy động**, **📊 Bình chọn 1/2**.
- **Bình chọn 1/2:** câu hỏi vui (phở hay bún bò, biển hay núi…), người xem comment `1` hoặc `2` trong 40 giây, mỗi người một phiếu. Khách quen 🏠 không bỏ phiếu. Bình chọn nằm chung vòng trò chơi nhỏ tự mở.
- Trong lúc Cậu Cả nói, nhạc nền tự nhỏ lại.
- Cậu Cả luôn tự giới thiệu là **MC ảo do AI dẫn**. Trên màn hình có nhãn **AI MC**.

> ⚠️ **Phiên live bị TikTok dừng vì "không có hoạt động gì":** TikTok có thể tự dừng phiên live khi cho rằng không có người dẫn. Giọng Cậu Cả và việc trả lời comment theo thời gian thực giúp phiên live có tương tác thật. Tuy vậy, mình **không xác minh được** TikTok dựa vào đâu để quyết định, và quy định của TikTok yêu cầu chủ kênh chịu trách nhiệm với nội dung do AI tạo ra. Cách chắc chắn nhất là **có bạn ở bên**: bật mic nói chuyện thỉnh thoảng, thêm khung camera nhỏ, và trả lời ngay khi LIVE Studio hỏi bạn còn ở đó không. App **không** giả thao tác của người dẫn để lách TikTok.

## 4a. Live dừng: báo về điện thoại và ngưng gọi Claude

- **App theo dõi phiên live.**
  - Kết nối bằng @tên: live coi là đang chạy khi TikTok báo phiên live còn mở.
  - Kết nối qua TikFinity: live coi là đang chạy khi TikFinity chạy và cửa sổ game vẫn nhận được sự kiện.
  - Ngoài ra, nếu không có sự kiện nào từ người xem thật trong 10 phút (chỉnh được), app cũng coi như live đã dừng.
- **Khi live dừng quá 30 giây:**
  - App **ngưng gọi Claude**. Game không gọi nữa, và máy chủ của app cũng chặn mọi lượt gọi.
  - App gửi thông báo về **điện thoại** qua app **ntfy** và hiện thông báo trên Mac.
  - Live chạy lại thì app tự gọi Claude tiếp và báo "Live chạy lại".
- **Cài đặt:** trên bảng điều khiển → **🔔 Báo về điện thoại**.
  1. Cài app ntfy trên điện thoại (miễn phí, không cần tài khoản).
  2. Trong ntfy, đăng ký đúng **mã kênh** mà app đã tạo sẵn. Mã kênh này giữ kín như mật khẩu.
  3. Bấm **Gửi thử** để kiểm tra điện thoại đã nhận được thông báo.
- **Tin gửi qua ntfy.sh** chỉ gồm trạng thái live, không có thông tin cá nhân.
- **Giới hạn:** app không nhìn thấy màn hình LIVE Studio, nên không phát hiện được captcha ngay lúc nó hiện ra. App chỉ báo khi phiên live có dấu hiệu dừng. Nhận được thông báo, bạn tự mở máy kiểm tra và giải captcha.

## 4b. Claude MC và chi phí

**Gọi Claude ít nhất có thể:**
- Lời chào khách mới (gộp nhiều tên vào một câu), cảm ơn tim, quà, theo dõi, chia sẻ, mốc tim và các câu khuấy động khi quán im đều là **lời soạn sẵn** trong game. Có hơn 60 câu, chia theo tình huống và giờ trong ngày, nên không tốn lượt gọi nào.
- Claude **chỉ được gọi** khi đang live và có **người xem thật** bình luận trò chuyện hoặc hỏi han, hoặc khi có quà từ 100 xu trở lên.
  - Các comment là lệnh (`bàn 5`, `dzô`, `hát …`, `xiếc`…) và câu trả lời trò chơi do game tự xử lý.
  - Khách quen 🏠 và khách ảo không bao giờ làm tốn lượt gọi.
- Cấu hình Live gọi Claude cách nhau ít nhất 30 giây, tối đa 90 lượt mỗi giờ.

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

- Người xem comment `hát <tên bài>` rồi tặng quà **từ 50 xu** để chốt bài. Quà **từ 180 xu** được chen hàng. Đổi hai mức này trên bảng điều khiển → ⚙️ Cấu hình.
- **Tự tìm bài**: nhập YouTube Data API key trong bảng điều khiển (hoặc ⚙️ của game – key được lưu lên app). Bấm **🔎 Kiểm tra key** để thử tìm một bài: nếu lỗi, bảng điều khiển nói rõ cách sửa (key sai, chưa bật YouTube Data API v3, key giới hạn trang web, hết hạn mức). Bấm **🎤 Phát thử** để thêm bài vào hàng chờ và nghe thử trong game. Hạn mức miễn phí khoảng 100 lượt tìm mỗi ngày.
- **Không có key**: dùng 🔎 Tìm và 🔗 Dán link trong ⚙️ của game, hoặc ô **Thêm bài** trên bảng điều khiển.
- **Sân khấu** nằm sát tường mặt tiền quán: TV treo tường, hai loa hai bên, micro đứng giữa. Người hát đi qua khe giữa bàn 1 và bàn 2 để lên sân khấu; nhân vật tự đi vòng phía trước sân khấu, không đi xuyên loa hay TV.
- **Lên mic**: người xem comment `xin lên mic`, bạn mời họ làm **Khách mời** trên TikTok. Giọng hát đi thẳng vào phòng live.

## 6. Xiếc đường phố và nhạc nền

**Xiếc đường phố**
- Một nghệ sĩ đi bộ vào giữa phố, diễn khoảng 20–25 giây. Xe cộ dừng lại xem, khách trong quán vỗ tay.
- Có 5 tiết mục: 🦁 múa lân (kèm trống), 🔥 phun lửa, 🤹 tung hứng, 🦯 đi cà kheo, 🍽️ xoay đĩa.
- Cách mời đoàn xiếc:
  - Người xem comment `xiếc`, hoặc gọi tên tiết mục như `múa lân`, `phun lửa`. Sau mỗi tiết mục, đoàn nghỉ khoảng 2 phút rưỡi.
  - Chế độ tự động dẫn live tự mời đoàn theo nhịp đã chỉnh.
  - Claude MC tự mời.
  - Bạn bấm nút trên bảng điều khiển.
- Ai tặng quà trong lúc đoàn đang diễn thì nghệ sĩ cảm ơn tên người đó và diễn thêm vài giây.

**Nhạc nền remix từ YouTube** (tuỳ chọn, mặc định tắt)
- Cách bật: trên bảng điều khiển → ⚙️ Cấu hình, tích **📻 Nhạc nền remix từ YouTube**, rồi chỉnh từ khoá (mặc định *nhạc remix vinahouse*) và âm lượng.
- Game dùng chung YouTube key với karaoke. Mỗi lần tìm 25 bài và nhớ danh sách trong 12 giờ, nên tốn rất ít hạn mức.
- Nhạc tự dừng khi có người hát karaoke hoặc lên mic, rồi phát tiếp sau đó. Khi đang phát nhạc YouTube, nhạc nền tự tạo của quán tạm tắt.
- Trình phát hiện ở góc trên bên trái, kích thước 200×200 theo quy định của YouTube.
- ⚠️ **Rủi ro bản quyền:** nhạc trên YouTube (nhất là remix) thường có bản quyền, TikTok có thể **tắt tiếng hoặc dừng** phiên live. An toàn nhất là dùng nhạc nền tự tạo sẵn của quán, hoặc nhạc miễn phí bản quyền có giấy phép phát trực tiếp.

## 7. Lệnh cho người xem

| Comment | Tác dụng |
|---|---|
| (bất kỳ) | Vào quán, kéo ghế ngồi, có ly bia trước mặt; lời chat hiện trên đầu nhân vật |
| `bàn 5` | Ngồi bàn số 5 (dãy sát đường 1–5, dãy sát quán 6–8) |
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
| `đố vui`, `đoán số`, `nhanh tay`, `đua bàn`, `bình chọn` | Mở trò chơi nhỏ |
| `1` / `2` | Bỏ phiếu khi đang bình chọn |
| `kể chuyện`, `chuyện cười` | Nghe Cậu Cả kể chuyện cười |
| `xiếc`, `múa lân`, `phun lửa`, `tung hứng`, `cà kheo`, `xoay đĩa` | Mời đoàn xiếc đường phố; tặng quà lúc đoàn đang diễn để thưởng nghệ sĩ |
| `về nha`, `tính tiền` | Ra về |
| Thả tim | Đẩy thanh **Không khí**; đủ 100% thì cả quán quẩy |
| Tặng quà | Nhân viên bưng món ra bàn; tên người tặng hiện trên đầu nhân vật vài giây (bình thường tên được ẩn cho gọn màn hình); quà từ 500 xu bắn pháo hoa |

## 8. Khắc phục sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| App báo chưa có Node.js | Chạy `brew install node`, hoặc cài bản LTS từ nodejs.org |
| *"Cổng 8686 đang bận"* | App đã chạy ở một cửa sổ Terminal khác; mở http://127.0.0.1:8686/panel hoặc đóng cửa sổ cũ |
| Khung hình dư một dải phía trên | Đó là thanh tiêu đề cửa sổ Chrome: cắt cạnh trên của nguồn *Chụp cửa sổ* trong LIVE Studio |
| Không có tiếng game trên live | Bật âm thanh máy tính trong LIVE Studio và cho phép quyền *Ghi màn hình & âm thanh* trong Cài đặt hệ thống của macOS |
| Bảng điều khiển báo *"Chưa thấy cửa sổ game"* | Bấm **🪟 Mở cửa sổ game**; nếu cửa sổ đã mở thì bấm **🔄 Tải lại game** |
| Không nhận được comment | Kết nối thẳng: kiểm tra đúng **@tên** và tài khoản đang live (dòng *TikTok Live* trong bảng điều khiển báo lỗi cụ thể). Dùng TikFinity: kiểm tra địa chỉ WebSocket (thử `ws://127.0.0.1:21213/`) |
| *"Dịch vụ ký kết nối đang giới hạn lượt"* | Gói miễn phí của Euler Stream bị giới hạn; app tự thử lại sau 60 giây. Live thường xuyên thì lấy API key tại eulerstream.com rồi chạy app với biến `EULER_API_KEY`, hoặc dùng TikFinity |
| Cài giọng VieNeu báo *"External data path escapes model directory"* | Lỗi của bản cũ khi chạy với ONNX Runtime mới. Cập nhật (`git pull`) rồi nhấp đúp lại `cai-giong-vieneu.command`: mô hình được tải lại vào thư mục thường |
| YouTube báo lỗi 153 | Chạy game qua app hoặc GitHub Pages, không mở file trực tiếp |
| Claude MC tự tắt | Key sai hoặc hết hạn mức; chạy `./start.command --reset-key` để nhập key mới |

## 9. Quyền riêng tư và minh bạch

- App chỉ chạy trên máy bạn (`127.0.0.1`) và không có máy chủ trên mạng.
- Claude API key nằm trong Keychain; cấu hình nằm trong `config.json`.
- Nội dung chỉ được gửi ra ngoài khi bạn bật tính năng tương ứng:
  - **Claude MC**: tóm tắt diễn biến phòng live được gửi tới Anthropic.
  - **Karaoke YouTube**: tên bài được gửi tới Google để tìm, và video phát qua `youtube-nocookie.com`.
  - **Kết nối thẳng TikTok**: app dùng thư viện mã nguồn mở `tiktok-live-connector` để đọc phiên live công khai, không đăng nhập TikTok. Thư viện gửi **tên tài khoản** của bạn tới dịch vụ Euler Stream để ký kết nối. Đây là cách đọc không chính thức, TikTok có thể thay đổi bất cứ lúc nào; khi đó hãy dùng TikFinity.
- Khách quen 🏠 là nhân vật máy, được đánh dấu rõ, và không tạo tim, quà hay thứ hạng giả.
- Đồ ăn, bia trong quán là **ảo**. Cậu Cả do AI dẫn được dặn không cổ vũ uống rượu bia thật và luôn nói thật mình là MC ảo khi được hỏi.
