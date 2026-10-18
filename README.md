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

2. Tạo file môi trường và điền giá trị (`DATABASE_URL`, `BETTER_AUTH_SECRET`, ...):
```bash
cp .env.example .env
```

3. Chạy môi trường phát triển (Development):
```bash
npm run dev
```

4. Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).


