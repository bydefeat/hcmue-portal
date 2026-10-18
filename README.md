# HCMUE Portal
> **Course Registration & Academic Performance Management Platform**  
> *Hệ thống Quản lý Đăng ký Học phần và Kết quả Học tập Sinh viên — Trường Đại học Sư phạm TP.HCM (HCMUE)*

---

## Giới thiệu dự án (Overview)
**HCMUE Portal** là hệ thống cổng thông tin đào tạo và học vụ trực tuyến, tối ưu hóa quy trình đăng ký tín chỉ, quản lý thời khóa biểu, theo dõi tiến độ đào tạo và tra cứu kết quả học tập cho sinh viên và giảng viên Trường Đại học Sư phạm TP.HCM.

### Phân hệ chức năng chính (Core Modules):
1. **Student Academic Portal (Cổng thông tin sinh viên)**:
   - Đăng ký học phần theo đợt / niên khóa / khung chương trình đào tạo.
   - Kiểm tra điều kiện tiên quyết (Prerequisites), giới hạn số tín chỉ, cảnh báo xung đột lịch học.
   - Xem thời khóa biểu tuần / học kỳ và xuất lịch cá nhân (.ics).
   - Tra cứu bảng điểm chi tiết (điểm chuyên cần, giữa kỳ, cuối kỳ, GPA/CPA) và lịch thi.
2. **Faculty & Advisor Portal (Cổng giảng viên & Cố vấn học tập)**:
   - Quản lý danh sách lớp học phần, điểm danh và nhập điểm trực tuyến.
   - Tư vấn học tập, phê duyệt kế hoạch học tập cá nhân của sinh viên.
3. **Department & Academic Affairs Administration (Phòng Đào tạo & Quản trị)**:
   - Thiết lập chương trình đào tạo, mở lớp học phần và cấu hình hạn mức đăng ký.
   - Thống kê, báo cáo học vụ, xếp loại học lực và cảnh báo học vụ tự động.

---

## Bộ nhận diện thương hiệu (Brand Identity)

<img src="public/hcmue-logo.png" alt="Logo Trường Đại học Sư phạm TP.HCM" width="320" />

| Màu | HEX | RGB | CMYK |
|---|---|---|---|
| Xanh Cerulean (chủ đạo) | `#124874` | 18, 72, 116 | 84, 38, 0, 55 |
| Đỏ Jasper | `#CF373D` | 207, 55, 61 | 0, 73, 71, 19 |

**Quy định sử dụng:**
- Tuân thủ mẫu logo, hệ màu, tỉ lệ kích thước, vị trí xuất hiện, phông chữ nhận diện và thông tin kèm theo theo tài liệu "Bộ nhận diện thương hiệu" của Trường.
- Đảm bảo chất lượng hình ảnh (không méo, vỡ, đổi màu logo).
- Nội dung, hình ảnh đi kèm và không gian xuất hiện phải phù hợp đặc tính ngành giáo dục, không vi phạm quy định về tư tưởng chính trị, thuần phong mỹ tục.

---

## Công nghệ sử dụng (Tech Stack)
- **Framework:** Next.js (App Router, React 19)
- **Language:** TypeScript
- **UI:** Ant Design, Tailwind CSS, Motion
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** better-auth
- **Validation & Server Actions:** Zod, ZSA
- **State:** Zustand (client), TanStack Query (server state)
- **Table:** TanStack Table
- **Drag & Drop:** dnd-kit
- **Platform:** Enterprise SIS / Academic Portal

---

## Hướng dẫn cài đặt (Getting Started)

1. Cài đặt các gói phụ thuộc:
```bash
npm install
```

2. Tạo file môi trường và điền giá trị (`DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL`, `DEFEAT_BETTER_AUTH_SESSION_SIGNING_SECRET_KEY`, ...):
```bash
cp .env.example .env
```

3. Chạy môi trường phát triển (Development):
```bash
npm run dev
```

4. Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).


