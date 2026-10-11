# Công cụ sắp lịch Pickleball: bản phát trực tiếp

## Cấu trúc (phẳng, không có thư mục con)

```
index.html           Trang cho VĐV (chỉ xem, tự cập nhật)
admin.html           Trang cho BTC (đăng nhập, nhập tỉ số)
app.js  sync.js  style.css   dùng chung cho hai trang
firebase-config.js   <- DÁN THÔNG TIN FIREBASE VÀO ĐÂY
poster-bg.jpg        Hình nền poster Vinh danh
vercel.json          Cho phép vào trang BTC bằng đường dẫn /admin
```

Tất cả 8 file nằm cùng một cấp ở gốc repo, GitHub chỉ cần chọn file và upload.

## Bước 1. Điền firebase-config.js
Mở file, thay 3 chỗ `DÁN_..._VÀO_ĐÂY` (apiKey, messagingSenderId, appId) bằng giá trị trong
Firebase Console > Project settings > General > Your apps > Web app > Config.
Các dòng authDomain, databaseURL, projectId đã điền sẵn theo project `vcb-pickleball-20261107`.

## Bước 2. Rules của Realtime Database
Console > Realtime Database > Rules, dán (thay UID bằng UID của tài khoản BTC):

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "tournament": {
      ".read": true,
      ".write": "auth != null && auth.uid === 'UID_CỦA_BTC'"
    }
  }
}
```
Có nhiều người nhập tỉ số thì dùng: `auth.uid === 'UID1' || auth.uid === 'UID2'`.

## Bước 3. Đưa lên Vercel
1. Tạo repo GitHub, đẩy toàn bộ thư mục này lên (giữ nguyên cấu trúc ở trên).
2. vercel.com > Add New > Project > chọn repo > Deploy. Không cần cấu hình thêm
   (Framework: Other, không có build command).
3. Firebase Console > Authentication > Settings > Authorized domains: thêm tên miền Vercel
   (dạng `ten-du-an.vercel.app`).
4. Trang VĐV: `https://ten-du-an.vercel.app/`
   Trang BTC: `https://ten-du-an.vercel.app/admin`

## Bước 4. Lần đầu dùng
1. Mở trang `/admin`, đăng nhập bằng tài khoản BTC (đã tạo ở Authentication > Users).
2. Máy chủ đang trống nên chọn **Đẩy dữ liệu máy này lên máy chủ**.
3. Từ đó, mỗi lần nhập tỉ số hoặc đổi đội, dữ liệu tự gửi lên trong chưa đầy 1 giây.
4. Mở trang VĐV trên điện thoại khác để kiểm tra.

Mở lại trang BTC trên máy khác: nếu dữ liệu khác nhau, trang sẽ hỏi bạn muốn đẩy lên hay tải về.
Hãy chọn đúng chiều, vì "Đẩy lên" sẽ ghi đè dữ liệu trên máy chủ.

## Lưu ý vận hành
- Gói Spark giới hạn 100 kết nối đồng thời. Trang VĐV tự ngắt khi tab bị ẩn để giảm số kết nối.
  Nếu dự kiến đông hơn, nâng project lên Blaze và đặt cảnh báo ngân sách.
- Chỉ nên có một máy nhập tỉ số tại một thời điểm.
- Mất mạng tại sân: trang BTC vẫn chạy, dữ liệu gửi lên khi có mạng lại. Đừng tải lại trang khi chưa gửi xong.
- Nút "Xuất sao lưu (.json)" ở tab Thiết lập dùng để sao lưu sau mỗi buổi.
- Phiên bản Firebase SDK nằm ở hằng số `FB_VER` đầu file `sync.js`.
