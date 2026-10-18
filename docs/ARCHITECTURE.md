# Kiến trúc HCMUE Portal

## 1. Route groups và URL

Folder có ngoặc như `(administrator)` là **route group**: **không xuất hiện trên URL**, chỉ dùng để gom route và gắn `layout.tsx` riêng.

Hệ quả:
- Hai group khác nhau **không được** có cùng đường dẫn. Ví dụ `(application)/dashboard` và `(administrator)/dashboard` đều ra `/dashboard`, Next.js sẽ báo lỗi.
- **Quy ước:** mọi group (trừ `(public)`) có một **folder con thật cùng tên** để tạo tiền tố URL: `(<tên>)/<tên>/...` → `/<tên>/...`. Ví dụ `(administrator)/administrator/users` → `/administrator/users`.
- Riêng `(public)` không có tiền tố, giữ trang `/`.

Tham khảo tài liệu route groups trong `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`.

| Group | Đối tượng | URL |
|---|---|---|
| `(public)` | Khách, chưa cần đăng nhập | `/`, `/announcements`, `/about` |
| `(authentication)` | Đăng nhập, đăng ký, quên mật khẩu, xác minh | `/authentication/...` |
| `(application)` | Sinh viên | `/application/...` |
| `(lecturer)` | Giảng viên và cố vấn học tập | `/lecturer/...` |
| `(administrator)` | Phòng Đào tạo, quản trị | `/administrator/...` |

## 2. Cây thư mục

```
src/
├── proxy.ts                         # chặn sớm: chưa có session → /authentication/sign-in
├── app/
│   ├── layout.tsx                   # root layout DUY NHẤT: <html>, AntdRegistry, font
│   │
│   ├── (public)/                    # CÔNG KHAI
│   │   ├── layout.tsx               # header, footer, logo trường
│   │   ├── page.tsx                 # /                trang chủ
│   │   ├── announcements/           # /announcements   thông báo đào tạo
│   │   │   └── [slug]/
│   │   └── about/                   # /about
│   │
│   ├── (authentication)/            # XÁC THỰC
│   │   └── authentication/
│   │       ├── layout.tsx           # layout căn giữa, logo trường
│   │       ├── sign-in/page.tsx     # /authentication/sign-in
│   │       ├── sign-up/page.tsx     # /authentication/sign-up
│   │       ├── forgot-password/page.tsx  # /authentication/forgot-password
│   │       └── verify/page.tsx      # /authentication/verify   xác minh email / OTP
│   │
│   ├── (application)/               # SINH VIÊN
│   │   └── application/
│   │       ├── layout.tsx           # sidebar SV + requireRole("student")
│   │       ├── dashboard/           # /application/dashboard     tổng quan
│   │       ├── registration/        # /application/registration  đăng ký học phần
│   │       ├── schedule/            # /application/schedule      TKB (+ xuất .ics)
│   │       ├── grades/              # /application/grades        bảng điểm, GPA/CPA
│   │       ├── exams/               # /application/exams         lịch thi
│   │       ├── curriculum/          # /application/curriculum    tiến độ CTĐT
│   │       ├── study-plan/          # /application/study-plan    kế hoạch học tập (gửi cố vấn duyệt)
│   │       └── profile/
│   │
│   ├── (lecturer)/                  # GIẢNG VIÊN + CỐ VẤN HỌC TẬP
│   │   └── lecturer/
│   │       ├── layout.tsx           # requireRole("lecturer"); menu "Cố vấn" chỉ hiện khi có role advisor
│   │       ├── page.tsx             # /lecturer
│   │       ├── schedule/            # lịch dạy
│   │       ├── classes/             # /lecturer/classes
│   │       │   └── [classId]/
│   │       │       ├── attendance/  # điểm danh
│   │       │       └── grading/     # nhập điểm
│   │       └── advising/            # mục CỐ VẤN, cần thêm role "advisor"
│   │           ├── layout.tsx       # requireRole("advisor")
│   │           ├── students/        # SV được phân công
│   │           │   └── [studentId]/
│   │           ├── study-plans/     # duyệt kế hoạch học tập
│   │           └── academic-warnings/
│   │
│   ├── (administrator)/             # PHÒNG ĐÀO TẠO / ADMIN
│   │   └── administrator/
│   │       ├── layout.tsx           # requireRole("admin")
│   │       ├── page.tsx             # /administrator
│   │       ├── announcements/       # đăng thông báo cho (public)
│   │       ├── programs/            # chương trình đào tạo
│   │       ├── courses/             # danh mục học phần + môn tiên quyết
│   │       ├── terms/               # học kỳ, đợt đăng ký, hạn mức
│   │       ├── class-sections/      # mở lớp học phần
│   │       ├── users/               # SV / GV / phân quyền / phân công cố vấn
│   │       └── reports/             # thống kê, xếp loại học lực
│   │
│   └── api/auth/[...all]/route.ts   # handler của better-auth
│
├── modules/                         # nghiệp vụ, dùng chung giữa các portal
│   ├── announcements/               # mỗi module gồm:
│   ├── course-registration/         #   schema.ts   bảng Drizzle
│   ├── schedule/                    #   queries.ts  hàm đọc dữ liệu (server)
│   ├── grades/                      #   actions.ts  server action (zsa + zod)
│   ├── curriculum/                  #   components/ UI riêng của module
│   ├── study-plan/
│   └── users/
└── lib/
    ├── db/                          # drizzle client + gom schema từ modules
    └── auth/                        # betterAuth(), requireRole()
```

Thêm vai trò mới (trưởng khoa, phòng khảo thí...) thì làm theo cùng mẫu: `(dean)/dean/...`, `(examination)/examination/...`.

## 3. Quyết định chính

| Vấn đề | Chọn | Lý do |
|---|---|---|
| Root layout | Chỉ 1 file `app/layout.tsx` | Nếu mỗi group có root layout riêng, chuyển giữa các portal sẽ phải tải lại toàn trang |
| Slug URL | Tiếng Anh (`/application/registration`) | Đồng bộ với tên code, không phải xử lý dấu |
| Phân quyền | 2 lớp: `proxy.ts` chỉ xem có cookie session hay không; `layout.tsx` của mỗi portal gọi `requireRole()` để kiểm tra session thật trên server | Proxy chỉ nên làm việc nhẹ như redirect |
| Vai trò | Plugin `admin` của better-auth; một user có thể có nhiều role (`student`, `lecturer`, `advisor`, `admin`) | Cố vấn luôn là giảng viên, nên nằm trong `(lecturer)` dưới dạng mục `advising/` có kiểm tra role riêng |
| Sau đăng nhập | Chuyển hướng theo role: admin → `/administrator`, lecturer → `/lecturer`, student → `/application/dashboard` | |
| Logic nghiệp vụ | Đặt trong `src/modules/*`, page chỉ ghép UI | Ví dụ "bảng điểm" được dùng ở cả trang SV, GV và cố vấn, viết một lần |
| Biến môi trường | Tiền tố `DEFEAT_*`, xem `.env.example` | better-auth không tự đọc các tên này, phải truyền `secret` và `baseURL` khi khởi tạo |

## 4. Lộ trình triển khai

1. **Nền tảng:** drizzle client, kết nối Postgres, `betterAuth()`, route `api/auth`.
2. **Auth:** các trang trong `(authentication)/authentication/` (sign-in, sign-up, forgot-password, verify), `proxy.ts`, helper `requireRole()`, chuyển hướng theo role.
3. **Public:** trang chủ, thông báo (đọc từ module `announcements`).
4. **Dữ liệu danh mục (admin):** chương trình đào tạo, học phần, học kỳ, lớp học phần, người dùng. Phải có dữ liệu này thì sinh viên mới có lớp để đăng ký.
5. **Đăng ký học phần (SV):** kiểm tra môn tiên quyết, giới hạn tín chỉ, trùng lịch; dùng transaction và khóa chỗ để không vượt sĩ số.
6. **Giảng viên:** danh sách lớp, điểm danh, nhập điểm.
7. **SV xem kết quả:** bảng điểm, GPA/CPA, TKB và xuất .ics, lịch thi.
8. **Cố vấn học tập:** SV gửi kế hoạch học tập, cố vấn duyệt; xem cảnh báo học vụ.
9. **Báo cáo và cảnh báo tự động** cho admin.
