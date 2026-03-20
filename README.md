# 🎯 Hứng Điểm 10

Đây là trò chơi "Hứng Điểm 10" trên nền tảng web sử dụng nhận diện khuôn mặt AI (MediaPipe Face Detection) để chơi. 
Người chơi cử động đầu để hứng các điểm rơi xuống từ trên cao, đồng thời tránh các điểm số 0 (trừ mạng).

## 🚀 Tính năng nổi bật
- **Nhận diện khuôn mặt thời gian thực:** Trò chơi có thể tự động nhận diện nhiều khuôn mặt trong camera. Người chơi chọn khuôn mặt của mình để điều khiển giỏ hứng đồ.
- **Thử thách vô hạn:** Các cấp độ khó tăng dần mỗi 15 giây (tốc độ rơi và tần suất rơi vật phẩm 0 điểm tăng).
- **Điểm số đa dạng:**
  - 🟢 **10** (+10 điểm)
  - 🔵 **5** (+5 điểm)
  - 🟣 **+20** (+20 điểm, hiếm)
  - 🔴 **0** (-1 mạng)

## 📁 Cấu trúc thư mục
Dự án đã được chia nhỏ để tiện lợi cho việc phát triển và bảo trì:
- `hung-diem-10.html`: Chứa cấu trúc HTML giao diện game, import thẻ `<canvas>`, video overlay và link tới CSS/JS.
- `hung-diem-10.css`: Chứa toàn bộ hiệu ứng CSS và bố cục HUD, các nút bấm của game.
- `hung-diem-10.js`: Mã nguồn logic của game. Xử lý nhận diện AI bằng MediaPipe, xử lý vòng lặp Game Loop, tính điểm và va chạm vật lý trên Canvas.

## 🛠 Cách chạy ứng dụng
1. Mở file `hung-diem-10.html` bằng trình duyệt web thông qua một local server (ví dụ: Live Server plugin trên VSCode). Trình duyệt yêu cầu môi trường local server hoặc HTTPS để cấp quyền mở Camera.
2. Cho phép quyền truy cập Camera trên trình duyệt.
3. Đứng trong khung hình camera, nhấn nút **"📸 Chọn người chơi"** và nhấp chọn khuôn mặt của bạn trên màn hình.
4. Nhấn **"▶ Bắt Đầu"** và di chuyển đầu để hứng điểm!

## 📌 Công nghệ sử dụng
- **HTML5 Canvas:** Dùng để render toàn bộ đồ họa 2D nhẹ và mượt mà.
- **Vanilla JavaScript & CSS:** Không sử dụng Framework phức tạp ngoài để tối ưu hiệu suất.
- **Google MediaPipe Face Detection:** Mô hình AI nhẹ để nhận diện bộ phận khuôn mặt ngay tại trình duyệt client.
