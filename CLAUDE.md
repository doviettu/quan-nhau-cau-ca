# CLAUDE.md – Quán nhậu vỉa hè Cậu Cả

Ghi chú cho Claude Code khi làm việc trong repo này (máy Mac mini của chủ quán, hoặc phiên cloud). Trả lời người dùng bằng **tiếng Việt**.

## Dự án là gì
Game 3D tương tác cho live **TikTok**, đọc thêm comment **YouTube Live** và **Facebook Live**. Người xem comment, thả tim, tặng quà để vào quán, gọi món, hát karaoke, chơi trò nhỏ. "Cậu Cả" (chủ quán, MC) do Claude điều khiển. Máy phát live: Mac mini, OBS phát một luồng về bộ chuyển tiếp ffmpeg trên máy, rồi đẩy lên cả 3 nền tảng.

## Cấu trúc
| Đường dẫn | Vai trò |
|---|---|
| `index.html` (~4.300 dòng) | Toàn bộ game: Three.js r0.160 qua CDN, Web Audio. Nhân vật chibi (`Actor`, `buildAvatar`, `lookFor`, mặt biểu cảm vẽ canvas), karaoke, sân khấu (`StageFX`), máy quay xoay 360° (`CamTour`), nhạc nền (`BGM`), xiếc, đố vui, bộ lọc từ tục. `window.__cc` lộ các đối tượng chính để thử nghiệm |
| `app/server.mjs` | Máy chủ cục bộ cổng **8686**: phục vụ game và `/panel`, SSE `/api/control`, WebSocket `/live-events` (gộp sự kiện TikTok/YouTube/Facebook), giọng MC (VieNeu hoặc `say` của macOS), Keychain, OBS, bộ chuyển tiếp, nhạc nền từ thư mục |
| `app/panel.html` | Bảng điều khiển: ⚡ Kết nối & phát, 🎙️ Giọng MC, 📻 Nhạc nền, 🎬 OBS, cấu hình game |
| `app/tiktok.mjs`, `app/youtube.mjs`, `app/facebook.mjs` | Nguồn sự kiện, đổi về dạng TikFinity `{ event, data }` |
| `app/obs.mjs` | obs-websocket v5: nút "Khớp lại OBS" (cảnh dọc 720×1280, chụp cửa sổ game, thu tiếng máy, đích phát, bitrate) |
| `app/relay.mjs` | ffmpeg `-listen 1` nhận ở `rtmp://127.0.0.1:19350/live/<khóa>`, `-c copy -f tee` lên nhiều nơi |
| `app/obs-setup.mjs`, `cai-obs.command` | Cài OBS + ffmpeg, bật WebSocket, app tự đọc mật khẩu từ cấu hình OBS |
| `app/locfilter.cjs` | Bộ lọc từ tục; **bản sao y hệt nằm trong `index.html`** |
| `bridge/claude-bridge.mjs` | Cầu nối Claude dùng riêng khi không chạy app |
| `start.command`, `Cau Ca Live.app` | Khởi động app trên Mac |
| `docs/` | Hướng dẫn live 3 nền tảng, nghiên cứu chibi, cách tăng lượt xem và quà |

## Chạy và kiểm tra
- Chạy app: `./start.command` (hoặc `npm start`), rồi mở http://127.0.0.1:8686/panel. Cần Node 20+.
- Đổi cổng khi thử song song: `PORT=8689 node app/server.mjs`.
- Sau khi sửa `app/locfilter.cjs`: chép lại vào `index.html` rồi chạy `npm run check:filter`.
- Kiểm tra cú pháp: `node --check app/server.mjs` (và các file `.mjs` đã sửa).
- Thử game: mở trình duyệt không giao diện (Playwright/Chromium), gọi qua `window.__cc`, ví dụ `__cc.handle('join', { uid: 'demo:An', name: 'An' })`, `__cc.StageFX.demo()`, `__cc.CamTour.start()`. Chụp màn hình khung dọc 540×960.
- Không đưa ảnh chụp hay script thử vào repo.

## Lưu ý kỹ thuật
- Khi máy quay chạy theo kịch bản (`StageFX`, `CamTour`): tắt `controls.enabled` và không gọi `controls.update()`, vì giới hạn góc của OrbitControls sẽ kéo máy quay về. Xong thì gọi `fitCamera()` để trả máy quay về.
- Khung dọc dùng `camera.setViewOffset`; phải xoá khi chạy máy quay kịch bản.
- Vòng lặp chính: `StageFX.camOn()` được ưu tiên hơn `CamTour.on`, rồi mới đến `controls.update()`.
- Viền nhân vật: `outlined(mesh)` gắn một lưới con dùng chung `outlineMat` (inverted hull). Lưới con tự ẩn hoặc hiện theo lưới cha, nên nếu thêm mảnh nhân vật mới thì bọc mảnh đó bằng `outlined()`.
- Đo FPS phải dùng cửa sổ đang hiện trên màn hình. Khung trình duyệt của app Claude bị bóp còn 1 FPS khi cửa sổ không hiện, dù `document.hidden` vẫn là `false`. Cách chắc ăn: Playwright headless với `--use-angle=metal` (vẫn dùng GPU M4 thật) và `deviceScaleFactor: 2`.
- Cấu hình game nằm ở `DEFAULTS.game` trong `server.mjs`, và phải thêm tên khóa vào danh sách của `applyAppConfig` trong `index.html` thì game mới nhận.
- `config.json` và `.secrets.json` nằm trong `.gitignore`. Không commit chúng.

## Quy tắc bắt buộc
- **Không bao giờ** yêu cầu người dùng dán API key, token, khóa luồng hay mật khẩu vào chat. Họ dán vào bảng điều khiển, và app lưu vào Keychain của macOS (Claude API key: service `cau-ca-live`; các bí mật khác: `CauCaLive-<tên>`). Không in bí mật ra log hay màn hình.
- Claude API key chỉ nằm trong Keychain, không đưa xuống trình duyệt.
- Không làm tính năng giả người thật/webcam giả, không vượt CAPTCHA, không che hay cắt khung trình phát YouTube.
- Không sao chép nhân vật, tên hay kiểu dáng của game có thật; chỉ dùng phong cách chibi chung.
- Git: làm trên nhánh riêng, mở PR (bản nháp), không push thẳng lên `main`, không force-push hay viết lại lịch sử. Chỉ gộp PR khi người dùng bảo.
- Không ghi email hay thông tin cá nhân của người dùng vào code, commit hay dịch vụ bên ngoài.

## Tình trạng (11/2026)
Đã gộp vào `main`: nhân vật chibi + mặt biểu cảm + toon shading, YouTube/Facebook Live, kết nối thông minh, danh sách giọng MC, bộ lọc từ tục, nhạc nền từ link YouTube hoặc thư mục trên máy, máy quay xoay 360° định kỳ, hiệu ứng sân khấu karaoke, OBS + bộ chuyển tiếp 3 nền tảng, `cai-obs.command`.

Việc còn mở (xem `docs/nghien-cuu-nang-cap-chibi.md` mục D):
- Thu gọn bảng quà thành nút.
- Chạy A/B 2 tuần.
- Chạy thử `cai-obs.command` trên Mac thật. Chưa chạy lần nào vì môi trường cloud không phải macOS.
