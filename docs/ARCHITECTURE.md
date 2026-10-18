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
├── proxy.ts                         # entry Next bắt buộc: ghép các proxy trong src/proxies/
├── proxies/                         # từng proxy nhỏ theo mục đích
│   └── authentication.proxy.ts      # chưa có cookie session → /authentication/sign-in
│
├── app/                             # CHỈ routing: page/layout mỏng, gọi xuống shared + modules
│   ├── layout.tsx                   # root layout DUY NHẤT: <html>, AntdRegistry, ConfigProvider (theme)
│   │
│   ├── (public)/
│   │   ├── layout.tsx               # → <PublicLayout>
│   │   ├── page.tsx                 # /                trang chủ
│   │   ├── announcements/           # /announcements   thông báo đào tạo
│   │   │   └── [slug]/
│   │   └── about/                   # /about
│   │
│   ├── (authentication)/
│   │   └── authentication/
│   │       ├── layout.tsx           # → <AuthenticationLayout>
│   │       ├── sign-in/page.tsx     # /authentication/sign-in
│   │       ├── sign-up/page.tsx     # /authentication/sign-up
│   │       ├── forgot-password/page.tsx
│   │       └── verify/page.tsx      # xác minh email / OTP
│   │
│   ├── (application)/               # SINH VIÊN
│   │   └── application/
│   │       ├── layout.tsx           # requireRole("student") → <ApplicationLayout>
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
│   │       ├── layout.tsx           # requireRole("lecturer") → <LecturerLayout>
│   │       ├── page.tsx             # /lecturer
│   │       ├── schedule/            # lịch dạy
│   │       ├── classes/             # /lecturer/classes
│   │       │   └── [classId]/
│   │       │       ├── attendance/  # điểm danh
│   │       │       └── grading/     # nhập điểm
│   │       └── advising/            # mục CỐ VẤN, cần thêm role "advisor"
│   │           ├── layout.tsx       # requireRole("advisor") (không đổi giao diện)
│   │           ├── students/
│   │           │   └── [studentId]/
│   │           ├── study-plans/     # duyệt kế hoạch học tập
│   │           └── academic-warnings/
│   │
│   ├── (administrator)/             # PHÒNG ĐÀO TẠO / ADMIN
│   │   └── administrator/
│   │       ├── layout.tsx           # requireRole("admin") → <AdministratorLayout>
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
├── modules/                         # NGHIỆP VỤ theo domain, dùng chung giữa các portal
│   ├── announcements/               # mỗi module, ví dụ grades/:
│   ├── course-registration/         #   grades.schema.ts  bảng Drizzle
│   ├── schedule/                    #   grades.query.ts   hàm đọc dữ liệu (server)
│   ├── grades/                      #   grades.action.ts  server action, validate bằng zod
│   ├── curriculum/                  #   components/       UI riêng của module
│   ├── study-plan/
│   └── users/
│
└── shared/                          # KHÔNG chứa nghiệp vụ; ai cũng import được
    ├── components/
    │   ├── layouts/                 # 5 layout độc lập, xem mục 3
    │   │   ├── public/
    │   │   ├── authentication/
    │   │   ├── application/
    │   │   ├── lecturer/
    │   │   └── administrator/
    │   └── ui/                      # component nhỏ không gắn portal: Logo, PageHeader, EmptyState...
    ├── constants/
    │   ├── theme.constant.ts        # bảng màu thương hiệu + antd ThemeConfig (nguồn màu DUY NHẤT)
    │   ├── navigation.constant.ts   # menu của từng portal (label, href, icon, role)
    │   └── role.constant.ts         # "student" | "lecturer" | "advisor" | "admin" + trang đích sau login
    ├── hooks/                       # hook client dùng chung
    │   └── media-query.hook.ts      # export useMediaQuery
    ├── libs/
    │   ├── env.lib.ts               # parse các biến DEFEAT_* bằng zod
    │   ├── db.lib.ts                # drizzle client + gom schema từ modules
    │   ├── auth.lib.ts              # betterAuth() (server)
    │   ├── auth-client.lib.ts       # createAuthClient() (client)
    │   └── session.lib.ts           # getSession(), requireRole()
    └── stores/                      # zustand store CHỈ cho state UI
        └── sidebar.store.ts         # export useSidebarStore
```

### Quy ước đặt tên file

Tên file dạng `<tên>.<loại>.ts`, phần `<tên>` viết kebab-case. Trong `shared/` dùng số ít (`role.constant.ts`); trong `modules/` dùng đúng tên folder module (`grades.query.ts`). Nhìn đuôi file là biết loại, không phụ thuộc file nằm ở folder nào.

| Loại | Đuôi | Ví dụ | Export |
|---|---|---|---|
| Proxy | `*.proxy.ts` | `authentication.proxy.ts` | `authenticationProxy` |
| Lib | `*.lib.ts` | `env.lib.ts`, `db.lib.ts` | `env`, `db` |
| Hook | `*.hook.ts` | `media-query.hook.ts` | `useMediaQuery` |
| Constant | `*.constant.ts` | `theme.constant.ts` | `THEME`, `BRAND_COLORS` |
| Store | `*.store.ts` | `sidebar.store.ts` | `useSidebarStore` |
| Drizzle schema | `*.schema.ts` | `grades.schema.ts` | các bảng `grades`, `gradeItems`... |
| Query (đọc) | `*.query.ts` | `grades.query.ts` | `getTranscript()` |
| Server action (ghi) | `*.action.ts` | `grades.action.ts` | `submitGrades()` |
| Component | `kebab-case.tsx`, **không** có đuôi loại | `sidebar.tsx`, `bottom-tabs.tsx` | `Sidebar`, `BottomTabs` |

Ngoại lệ: file mà Next.js quy định tên (`proxy.ts`, `layout.tsx`, `page.tsx`, `route.ts`...) giữ nguyên tên gốc.

**Hướng import (một chiều):** `app` → `modules` → `shared`. `shared` không import `modules` hay `app`; module không import module khác (cần dữ liệu chéo thì `app` ghép lại).

Thêm vai trò mới (trưởng khoa, phòng khảo thí...) thì làm theo cùng mẫu: `(dean)/dean/...` + `shared/components/layouts/dean/`.

## 3. Layouts

### Nguyên tắc

> **Ghi chú bắt buộc:**
> - **KHÔNG có chế độ chuyển sáng/tối.** Chỉ một giao diện sáng; không viết `dark:`, không `prefers-color-scheme`, không nút đổi theme.
> - **Toàn bộ UI tận dụng Tailwind và component antd.** Control (nút, ô nhập, select, bảng, modal, menu...) dùng component antd; bố cục, khoảng cách, phần không có trong antd dùng class Tailwind. Không tự viết lại component antd đã có, không viết CSS riêng (CSS Module, styled-components, `style={{}}` trang trí).

- **5 layout độc lập**, mỗi layout một folder, **không import lẫn nhau** và không có "BaseLayout" chung. Mỗi portal phục vụ một kiểu công việc khác nhau, nên khung trang khác nhau.
- **Thứ duy nhất dùng chung là màu sắc:** tất cả đọc từ `shared/constants/theme.constant.ts`. Không hardcode mã màu trong layout.
- Phần dùng chung thật sự nhỏ (Logo, avatar menu) đặt ở `shared/components/ui/`, layout chỉ ghép vào.
- `app/.../layout.tsx` chỉ làm 2 việc: kiểm tra quyền và render layout tương ứng. Toàn bộ giao diện nằm trong `shared/components/layouts/`.

### Bảng màu (từ bộ nhận diện thương hiệu)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `primary` | Xanh Cerulean `#124874` | Header, sidebar, nút chính, link |
| `accent` | Đỏ Jasper `#CF373D` | Điểm nhấn: CTA trang public, badge cảnh báo, hạn chót. Dùng **ít** |
| `primary-50…900` | Thang sáng/tối sinh từ `#124874` | Nền nhạt, hover, trạng thái active |
| Neutral | Xám của antd | Nền nội dung, viền, chữ phụ |

Đỏ Jasper gần với màu `error` của antd. Vì vậy `colorError` giữ màu đỏ mặc định của antd để người dùng không nhầm "điểm nhấn thương hiệu" với "lỗi".

### Thiết kế từng layout

| Layout | Người dùng & thiết bị | Khung trang | Điểm riêng |
|---|---|---|---|
| **Public** | Khách, phụ huynh; điện thoại và máy tính | Header ngang (logo + menu + nút "Đăng nhập" đỏ Jasper) → nội dung rộng → footer xanh Cerulean (địa chỉ, liên hệ) | Kiểu trang giới thiệu; menu thành drawer trên điện thoại |
| **Authentication** | Mọi người, chưa đăng nhập | Chia đôi: trái là panel Cerulean có logo và tên trường; phải là form trên nền trắng | Trên điện thoại bỏ panel trái, chỉ còn logo phía trên form |
| **Application** (SV) | Sinh viên, **chủ yếu dùng điện thoại** | Máy tính: sidebar trái thu gọn được + topbar (học kỳ đang chọn, số tín chỉ đã đăng ký, avatar). Điện thoại: **thanh tab dưới đáy** (Tổng quan, Đăng ký, TKB, Điểm, Thêm) | Ưu tiên chạm bằng một tay; trong đợt đăng ký, topbar hiện đồng hồ đếm ngược |
| **Lecturer** (GV + cố vấn) | Giảng viên, chủ yếu dùng máy tính | Menu ngang trên cùng (Lịch dạy, Lớp học phần, Cố vấn*) + thanh ngữ cảnh lớp (tên lớp, sĩ số, tab Điểm danh / Nhập điểm) | Tập trung vào **một lớp tại một thời điểm**; menu "Cố vấn" chỉ hiện khi có role `advisor` |
| **Administrator** | Phòng Đào tạo, máy tính màn lớn | Sidebar Cerulean đậm, menu chia nhóm (Đào tạo, Học vụ, Người dùng, Báo cáo) + header (tìm kiếm toàn cục, breadcrumb, avatar) | Mật độ thông tin cao: bảng antd `size="small"`, nội dung rộng hết màn hình |

### Cấu trúc một folder layout

```
shared/components/layouts/application/
├── index.tsx              # export ApplicationLayout (server component)
├── sidebar.tsx            # "use client" — thu gọn/mở, đọc từ stores
├── topbar.tsx
└── bottom-tabs.tsx        # chỉ application có
```

Mỗi folder chỉ export `index.tsx`; các file con là chi tiết nội bộ của layout đó. Menu lấy từ `shared/constants/navigation.constant.ts`, nên muốn thêm trang chỉ cần sửa một chỗ.

## 4. Quyết định chính

| Vấn đề | Chọn | Lý do |
|---|---|---|
| Root layout | Chỉ 1 file `app/layout.tsx` | Nếu mỗi group có root layout riêng, chuyển giữa các portal sẽ phải tải lại toàn trang |
| Theme | 1 `ConfigProvider` ở root đọc `shared/constants/theme.constant.ts`; layout nào cần chỉnh (ví dụ sidebar đậm của admin) thì lồng `ConfigProvider` con, vẫn lấy màu từ cùng file | Màu chỉ khai báo một chỗ |
| Slug URL | Tiếng Anh (`/application/registration`) | Đồng bộ với tên code, không phải xử lý dấu |
| Phân quyền | 2 lớp: `src/proxies/authentication.proxy.ts` chỉ xem có cookie session hay không; `layout.tsx` của mỗi portal gọi `requireRole()` để kiểm tra session thật trên server | Proxy chỉ nên làm việc nhẹ như redirect |
| `proxy.ts` | Bắt buộc nằm ở `src/proxy.ts` (Next yêu cầu); file này chỉ ghép các proxy trong `src/proxies/` | Giữ được cách chia folder theo mục đích |
| Vai trò | Plugin `admin` của better-auth; một user có thể có nhiều role (`student`, `lecturer`, `advisor`, `admin`) | Cố vấn luôn là giảng viên, nên nằm trong `(lecturer)` dưới dạng mục `advising/` có kiểm tra role riêng |
| Sau đăng nhập | Chuyển hướng theo role (khai báo trong `shared/constants/role.constant.ts`): admin → `/administrator`, lecturer → `/lecturer`, student → `/application/dashboard` | |
| State | Dữ liệu từ server: server component + server action. `zustand` chỉ giữ state UI | Không phải đồng bộ dữ liệu server ở hai nơi |
| Logic nghiệp vụ | Đặt trong `src/modules/*`, page chỉ ghép UI | Ví dụ "bảng điểm" được dùng ở cả trang SV, GV và cố vấn, viết một lần |
| Biến môi trường | Tiền tố `DEFEAT_*`, xem `.env.example`, parse ở `shared/libs/env.lib.ts` | better-auth không tự đọc các tên này, phải truyền `secret` và `baseURL` khi khởi tạo |
| `cacheComponents` | Đang bật: code đọc `cookies()`/`headers()` (kiểm tra session) phải nằm trong `<Suspense>` | Nếu không, build sẽ lỗi |

## 5. Lộ trình triển khai

1. **Nền tảng:** `env.lib.ts`, `db.lib.ts`, `drizzle.config.ts`, `theme.constant.ts`, gắn `ConfigProvider` ở root layout.
2. **Auth:** `auth.lib.ts`, `auth-client.lib.ts`, `session.lib.ts`, route `api/auth`, `src/proxy.ts` + `src/proxies/authentication.proxy.ts`, `AuthenticationLayout` và 4 trang sign-in / sign-up / forgot-password / verify.
3. **Layouts:** dựng 4 layout còn lại cùng `navigation.constant.ts`, mỗi portal có một trang trống để xem layout.
4. **Public:** trang chủ, thông báo (module `announcements`).
5. **Dữ liệu danh mục (admin):** chương trình đào tạo, học phần, học kỳ, lớp học phần, người dùng. Phải có dữ liệu này thì sinh viên mới có lớp để đăng ký.
6. **Đăng ký học phần (SV):** kiểm tra môn tiên quyết, giới hạn tín chỉ, trùng lịch; dùng transaction và khóa chỗ để không vượt sĩ số.
7. **Giảng viên:** danh sách lớp, điểm danh, nhập điểm.
8. **SV xem kết quả:** bảng điểm, GPA/CPA, TKB và xuất .ics, lịch thi.
9. **Cố vấn học tập:** SV gửi kế hoạch học tập, cố vấn duyệt; xem cảnh báo học vụ.
10. **Báo cáo và cảnh báo tự động** cho admin.
