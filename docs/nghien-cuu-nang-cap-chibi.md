# Nghiên cứu: nâng cấp giao diện, hình ảnh và nhân vật theo phong cách 3D chibi

Tài liệu cho game "Quán nhậu vỉa hè Cậu Cả" (tháng 11/2026). Gồm: hiện trạng đo được, chuẩn chibi 3D tổng hợp từ nguồn, kế hoạch nghiên cứu với người xem thật, và danh sách hạng mục nên làm.

> Lưu ý: chưa có người xem nào được hỏi. Phần A và B dựa trên đo đạc trong game và tài liệu công khai. Phần C là kế hoạch để kiểm chứng với người xem thật trước và sau khi nâng cấp.

## A. Hiện trạng (đo trong game, khung 1080×1920)

| Hạng mục | Hiện tại | Vấn đề |
|---|---|---|
| Kích thước nhân vật trên khung hình | Cao 103–173 px | Trên điện thoại (khung live thu nhỏ còn khoảng 1/3) chỉ còn khoảng **37–62 điểm** |
| Tỉ lệ đầu so với chiều cao | Đầu chiếm khoảng 35% chiều cao | Khuôn mặt chỉ còn khoảng **13–22 điểm** trên điện thoại, khó thấy biểu cảm |
| Khuôn mặt | 2 ô mắt vuông, 1 vạch miệng, có thể thêm má hồng, kính, ria | Không có biểu cảm: cười, say, hát đều cùng một mặt |
| Hình khối | Hộp vuông kiểu voxel (đầu là khối lập phương) | Cứng, chưa ra chất "dễ thương" |
| Vật liệu | Lambert, không viền | Nhân vật lẫn vào nền gạch đỏ, nhất là áo đỏ |
| Chi phí vẽ | 107 lệnh vẽ, khoảng 19,7 nghìn tam giác khi có 8 khách | Cần đo lại với đủ 48 khách trước khi thêm viền (viền có thể làm số lệnh vẽ tăng gấp đôi) |
| Giao diện | Bảng "Quà → gọi món" chiếm khoảng 1/3 phía trên bên phải của khung dọc | Che chỗ đứng của Cậu Cả nên **bong bóng lời thoại của Cậu Cả bị che**. Khi kể chuyện, Cậu Cả phải ra sân khấu mới thấy |

## B. Chuẩn 3D chibi (tổng hợp)

Các nguồn tìm được chủ yếu là hướng dẫn vẽ chibi 2D. Phần áp dụng cho 3D là suy luận từ đó, kết hợp với tài liệu three.js.

**Tỉ lệ**
- Đầu so với thân từ 1:1 đến 1:3; "super chibi" khoảng 1:2.
- Đề xuất cho game: đầu chiếm **45–50% chiều cao**, tức gấp khoảng 1,4 lần đầu hiện tại. Khuôn mặt trên điện thoại sẽ to khoảng 20–30 điểm.

**Khuôn mặt**
- Đặt mắt, mũi, miệng **thấp** trên đầu. Đặt cao thì trông như đầu người thật gắn lên thân tí hon.
- Mắt to, có chấm sáng; má hồng; miệng nhỏ.
- Mặt nên là **texture vẽ trên canvas**, đổi được theo trạng thái: bình thường, cười, say (mắt xoáy, má đỏ), hát (miệng tròn), thắng (mắt sao). Cách này rẻ hơn dựng hình.

**Hình khối**
- Đầu tròn (cầu dẹt hoặc hộp bo tròn).
- Thân ngắn hình giọt nước; tay chân ngắn, tròn; bàn tay và bàn chân tròn.
- Tóc làm thành các mảng lớn, ít chi tiết nhỏ.

**Đổ bóng**
- Toon/cel shading 2–3 bậc (`MeshToonMaterial` với dải màu `gradientMap`).
- Viền đen mỏng. Cách rẻ nhất là **inverted hull**: vẽ lớp vỏ lật mặt hơi phình ra. Cách này chỉ tốn chi phí cho vật cần viền, còn hậu kỳ dò cạnh thì xử lý mọi điểm ảnh.
- Thêm ánh sáng viền (rim light) trên đỉnh đầu và vai để nhân vật tách khỏi nền.

**Chuyển động**
- Nảy và co giãn (squash & stretch) khi đi, khi nhảy, khi cụng ly.
- Đầu lắc lư nhẹ khi đứng yên.

**Giới hạn**
- Không sao chép nhân vật, kiểu dáng hay tên của một game cụ thể nào. Chỉ dùng phong cách chibi chung.
- Giữ nhãn 🏠 cho khách quen và nhãn AI MC.

## C. Kế hoạch nghiên cứu với người xem

**Câu hỏi cần trả lời**
1. Nhân vật chibi có giúp người xem **nhận ra mình** nhanh hơn sau khi comment không? Đây là lý do chính người xem "thuê" game: thấy mình xuất hiện và được gọi tên.
2. Người xem có ở lại lâu hơn, comment nhiều hơn không?
3. Trên điện thoại, người xem có đọc được biểu cảm, tên và món ăn không?

| Phương pháp | Cách làm | Cỡ mẫu | Thời gian |
|---|---|---|---|
| **So sánh theo phiên live (A/B)** | Xen kẽ ngày dùng nhân vật cũ (A) và chibi (B), cùng khung 20:00–22:30. So trong LIVE Analytics: thời gian xem trung bình, tỉ lệ người xem có comment, số người vào quán (comment đầu), quà mỗi giờ | Mỗi bên ít nhất 6 phiên | 2 tuần |
| **Thử 5 giây trên điện thoại** | Cho xem ảnh chụp khung live ở cỡ điện thoại 5 giây, rồi hỏi: nhớ gì, ai là chủ quán, có thấy ai đang hát không | 5–8 người | 2–3 ngày |
| **Thử tìm nhân vật của mình** | Người xem comment vào quán; đo thời gian từ lúc comment đến lúc họ nói "thấy rồi", và hỏi họ nhận ra nhờ đâu | 5–8 người | Trong 1–2 phiên live |
| **Phỏng vấn ngắn** | 15 phút qua tin nhắn hoặc mời làm khách mời: khởi động (2 phút), thói quen xem live game (3), cảm nhận về quán (5), xem ảnh cũ và mới (3), kết thúc (2) | 5–8 khách quen | 1 tuần |
| **Bình chọn ngay trên live** | Dùng trò "bình chọn 1/2": "Kiểu nhân vật nào dễ thương hơn?". Chỉ để tham khảo vì dễ bị thiên lệch | Tất cả người xem | 1 phiên |

**Gợi ý câu hỏi phỏng vấn**
- "Lần gần nhất bạn vào một live game tương tác, điều gì làm bạn ở lại hoặc thoát ra?"
- "Lúc vừa comment, bạn tìm nhân vật của mình thế nào? Mất bao lâu?"
- Cho xem hai ảnh: "Ảnh nào làm bạn muốn comment hơn? Vì sao?"
- "Có chi tiết nào trên màn hình bạn không hiểu hoặc không đọc được không?"

**Lưu ý khi đọc kết quả**
- Kênh mới ít người xem nên A/B chỉ là tín hiệu định hướng, không kết luận thống kê.
- Giờ, ngày trong tuần và nội dung khác (xiếc, kể chuyện) cũng ảnh hưởng. Hãy giữ các yếu tố này giống nhau giữa hai bên.

## D. Hạng mục đề xuất (tác động / công sức)

| # | Hạng mục | Tác động | Công sức | Ghi chú |
|---|---|---|---|---|
| 1 | **Nhân vật chibi**: đầu tròn to 45–50%, thân và tay chân tròn, tóc mảng lớn | Cao | Trung bình | Giữ hệ thống ngoại hình theo người xem (`lookFor`) để mỗi người vẫn có một dáng riêng |
| 2 | **Mặt biểu cảm** bằng texture: bình thường, cười, say, hát, thắng | Cao | Thấp–trung bình | Nối với sự kiện có sẵn: câu chốt chuyện cười, uống tới say, hát karaoke, thắng trò chơi |
| 3 | **Toon shading + viền** cho nhân vật | Cao | Trung bình | Đo lệnh vẽ với 48 khách; có thể chỉ thêm viền cho nhân vật, không thêm cho cảnh |
| 4 | **Hiệu ứng "đây là bạn"** khi người xem vừa vào: vòng sáng dưới chân, nảy lên, tên hiện 6 giây | Cao | Thấp | Phục vụ trực tiếp câu hỏi số 1 |
| 5 | **Giao diện**: thu gọn bảng quà mặc định thành nút, mở ra khi có quà; thống nhất bo góc, viền dày, chữ tròn | Trung bình–cao | Trung bình | Bỏ chỗ che Cậu Cả và sân khấu |
| 6 | **Đồ vật kiểu chibi**: bàn ghế, ly, món ăn to và tròn hơn, đổ bóng toon | Trung bình | Trung bình | Món ăn to hơn giúp người tặng quà thấy món của mình |
| 7 | Hậu kỳ (bloom, chỉnh màu) | Thấp | Cao về hiệu năng | Để sau cùng, chỉ làm nếu máy Mac mini còn dư sức |

**Tiến độ**
- Đã làm hạng mục 1, 2, 3, 4. Hạng mục 3: đổ bóng toon và viền inverted hull cho nhân vật (không thêm viền cho cảnh). Viền dày gần như cố định khoảng 1,5 px ở khung 960, màu nâu đậm như nét vẽ mặt. Người lái xe máy cũng đã đổi sang chibi.
- Đo khi quán có 52 nhân vật (khung 540×960, trình duyệt không có GPU): số lệnh vẽ tăng từ 297 lên 395, số tam giác từ khoảng 39 nghìn lên khoảng 122 nghìn. Card đồ hoạ của Mac mini dư sức vẽ chừng này, nhưng hãy xem số khung hình mỗi giây trên máy thật trước khi thêm viền.
- Đo trên Mac mini M4 thật (11/2026, khung 540×960, GPU Apple M4 qua ANGLE Metal, 52 nhân vật): 60 FPS ở độ nét 2, khoảng 315 lệnh vẽ, khoảng 118 nghìn tam giác. Mỗi khung chỉ tốn khoảng 1,5 ms (JS + vẽ, p95 khoảng 3,5 ms), tức dưới 25% ngân sách 16,7 ms, kể cả khi chạy hiệu ứng sân khấu và máy quay xoay. Còn dư nhiều để thêm viền.
- Hạng mục 5, phần bảng quà: mặc định thu thành nút "QUÀ → GỌI MÓN". Khi có quà hoặc gọi món, bảng mở ra khoảng 8 giây và dòng món sáng lên; quà mới kéo dài thêm. Bấm mở tay thì giữ mở, bấm lại thì thu về. Chưa làm phần thống nhất bo góc, viền dày, chữ tròn.
- Sau khi thêm viền (cùng máy, 48 khách, độ nét 2): số lệnh vẽ tăng từ 319 lên 436, số tam giác từ khoảng 122 nghìn lên khoảng 197 nghìn. Vẫn 60 FPS, thời gian vẽ mỗi khung vẫn khoảng 2,5 ms (p95 3,5 ms).
- Lúc đo phát hiện bộ tự giảm độ nét chỉ giảm, không tăng lại: một lần khựng khi 48 khách vào dồn dập, hoặc cửa sổ game bị che làm trình duyệt bóp khung hình, là hình bị mờ cả buổi live. Đã sửa: đo bằng giờ thật, chậm 2 nhịp 3 giây liền mới giảm, bỏ qua lúc dưới 10 FPS (cửa sổ bị che), mượt khoảng 30 giây thì tăng lại 0,25.

**Thứ tự đề xuất**
1. Hạng mục 1, 2, 4.
2. Đo hiệu năng.
3. Hạng mục 3.
4. Hạng mục 5.
5. Chạy A/B 2 tuần.
6. Hạng mục 6 và 7 tuỳ kết quả.

## Nguồn

- Tỉ lệ và cách vẽ chibi: [Clip Studio – How to draw chibis](https://tips.clip-studio.com/en-us/articles/3448), [Clip Studio – Chibi body ratio](https://tips.clip-studio.com/es-es/articles/4806?org=1), [Clip Studio – Pose chibi](https://tips.clip-studio.com/de-de/articles/4856?org=1), [Clip Studio – Easy steps to creating chibi characters](https://clipstudio.net/how-to-draw/archives/155423)
- Toon shading và viền trong three.js: [three.js OutlineEffect](https://threejs.org/docs/pages/OutlineEffect.html), [three.js forum – OutlinePass và OutlineEffect](https://discourse.threejs.org/t/outlinepass-with-effectcomposer-or-outlineeffect/19790), [three.js forum – smooth cartoon style with outlines](https://discourse.threejs.org/t/how-to-create-this-smooth-cartoon-style-with-outlines-in-three-js/60862.md), [three.js forum – outline với MeshToonMaterial](https://discourse.threejs.org/t/outline-effect-not-work-use-with-meshtoonmaterial/40961), [sbcode – MeshToonMaterial](https://sbcode.net/threejs/meshtoonmaterial/)
- Bối cảnh TikTok LIVE: [Stream Hatchet Q1 2026](https://investgame.net/wp-content/uploads/2026/05/2026-05-03-stream_hatchet_q1_2026_report_wp.pdf), [Streams Charts – TikTok Live Q3 2025](https://streamscharts.com/news/tiktok-live-q3-2025-livestreaming-viewership-insights). Không tìm được nghiên cứu nào cho thấy hình nhân vật làm tăng thời gian xem, nên cần tự kiểm chứng bằng mục C.
