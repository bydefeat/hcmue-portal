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
| `(authentication)` | Đăng nhập, quên mật khẩu, xác minh (không có đăng ký: tài khoản do trường cấp) | `/authentication/...` |
| `(application)` | Sinh viên | `/application/...` |
| `(lecturer)` | Giảng viên và cố vấn học tập | `/lecturer/...` |
| `(administrator)` | Phòng Đào tạo, quản trị | `/administrator/...` |

## 2. Cây thư mục

```
src/
├── proxy.ts                         # entry Next bắt buộc: ghép các proxy trong src/proxies/
├── proxies/                         # từng proxy nhỏ theo mục đích
│   ├── authentication.proxy.ts      # chưa có cookie session → /authentication/sign-in
│   └── route-param.proxy.ts         # tham số đường dẫn phải là uuid mà sai định dạng → 404 thật
│
├── app/                             # CHỈ routing: page/layout mỏng, gọi xuống shared + modules
│   ├── layout.tsx                   # root layout DUY NHẤT: <html>, AntdRegistry, ConfigProvider (theme)
│   │
│   ├── (public)/
│   │   ├── layout.tsx               # → <PublicLayout>
│   │   ├── page.tsx                 # /                trang chủ
│   │   ├── announcements/           # /announcements   thông báo đào tạo
│   │   │   └── [slug]/              # chi tiết thông báo
│   │   └── about/                   # /about
│   │
│   ├── (authentication)/
│   │   └── authentication/
│   │       ├── layout.tsx           # → <AuthenticationLayout>
│   │       ├── sign-in/page.tsx     # /authentication/sign-in
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
│   │       ├── users/               # /users → /users/students
│   │       │   ├── students/        # quản lý SV
│   │       │   │   └── [studentId]/ # hồ sơ + bảng điểm
│   │       │   ├── lecturers/       # GV + phân quyền
│   │       │   └── advisors/        # phân công cố vấn theo lớp sinh hoạt
│   │       └── reports/             # thống kê, xếp loại học lực
│   │           └── academic-warnings/
│   │
│   └── api/auth/[...all]/route.ts   # handler của better-auth
│
├── modules/                         # NGHIỆP VỤ theo domain, dùng chung giữa các portal
│   ├── authentication/              # mỗi module, ví dụ grades/:
│   ├── announcements/               #   grades.type.ts      kiểu dữ liệu của domain
│   ├── course-registration/         #   grades.constant.ts  nhãn trạng thái, quy đổi điểm...
│   ├── schedule/                    #   grades.mock.ts      dữ liệu mẫu (thay bằng DB ở giai đoạn 2)
│   ├── grades/                      #   grades.query.ts     hàm đọc dữ liệu (server), hiện đọc từ mock
│   ├── curriculum/                  #   grades.schema.ts    bảng Drizzle (sau)
│   ├── study-plan/                  #   grades.action.ts    server action (sau)
│   └── users/                       #   components/         UI riêng của module
│
└── shared/                          # KHÔNG chứa nghiệp vụ; ai cũng import được
    ├── components/
    │   ├── layouts/                 # 5 layout độc lập, xem mục 3
    │   │   ├── public/
    │   │   ├── authentication/
    │   │   ├── application/
    │   │   ├── lecturer/
    │   │   └── administrator/
    │   └── ui/                      # component nhỏ không gắn portal: Logo, UserMenu, PageHeader, EmptyState,
    │                                #   ErrorState, PageSkeleton, StatusTag, StatTile, MeterBar
    ├── constants/
    │   ├── theme.constant.ts        # bảng màu thương hiệu + antd ThemeConfig (nguồn màu DUY NHẤT)
    │   ├── navigation.constant.ts   # menu của từng portal (label, href, icon, exact)
    │   ├── status.constant.ts       # 4 tông trạng thái dùng chung (xám, xanh lá, hổ phách, đỏ)
    │   ├── period.constant.ts       # giờ của 12 tiết học, nhãn thứ trong tuần
    │   └── role.constant.ts         # "student" | "lecturer" | "advisor" | "admin" + trang đích sau login
    ├── hooks/                       # hook client dùng chung
    │   └── media-query.hook.ts      # export useMediaQuery
    ├── libs/
    │   ├── date.lib.ts              # định dạng ngày giờ (dayjs, locale vi), số ngày/giờ còn lại
    │   ├── mock.lib.ts              # tiện ích dữ liệu mẫu: random có seed, tên người, mã SV/GV nhất quán giữa module
    │   ├── env.lib.ts               # parse các biến DEFEAT_* bằng zod
    │   ├── db.lib.ts                # drizzle client (postgres-js, casing snake_case)
    │   ├── db-column.lib.ts         # cột dùng chung: primaryId() mặc định uuidv7(), timestamps()
    │   ├── auth-client.lib.ts       # createAuthClient() (client), plugin username + emailOTP
    │   ├── student-code.lib.ts      # MSSV: chuẩn hoá về 10 chữ số, hiển thị "50.01.104.013", email @student.hcmue.edu.vn
    │   ├── search.lib.ts            # normalizeSearch(): lọc tại chỗ không dấu, bỏ dấu chấm
    │   ├── action.lib.ts            # ActionResult, parseInput, actionFailure cho server action
    │   └── form.lib.ts              # toFormFields(): lỗi theo ô từ action → form.setFields của antd
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
| Kiểu dữ liệu | `*.type.ts` | `grades.type.ts` | `GradeSheet`, `TranscriptTerm` |
| Kiểm dữ liệu vào | `*.rule.ts` | `facilities.rule.ts` | schema zod `ROOM_UPDATE_SCHEMA` dùng chung cho form và action, hàm thuần |
| Dữ liệu mẫu | `*.mock.ts` | `grades.mock.ts` | hằng số mock, chỉ `*.query.ts` cùng module được import |
| Drizzle schema | `*.schema.ts` | `grades.schema.ts` | các bảng `grades`, `gradeItems`... |
| Query (đọc) | `*.query.ts` | `grades.query.ts` | `getTranscript()` |
| Server action (ghi) | `*.action.ts` | `grades.action.ts` | `submitGrades()` |
| Component | `kebab-case.tsx`, **không** có đuôi loại | `sidebar.tsx`, `mobile-navigation.tsx` | `Sidebar`, `MobileNavigation` |

Ngoại lệ: file mà Next.js quy định tên (`proxy.ts`, `layout.tsx`, `page.tsx`, `route.ts`...) giữ nguyên tên gốc.

**Đường dẫn import:** luôn dùng alias `@/` (`@/modules/...`, `@/shared/...`), kể cả trong cùng folder; không dùng `./` hay `../`.

**Hướng import (một chiều):** `app` → `modules` → `shared`. `shared` không import `modules` hay `app`; module không import query, action, component của module khác (cần dữ liệu chéo thì `app` ghép lại).

**Ngoại lệ khi đọc DB thật:** query và action của một module được import `*.schema.ts` của module khác để join, và được gọi hai hàm kiểm quyền dùng chung: `requireSession()` / `requireRole()` (`@/modules/authentication/authentication.query`) và `requirePermission()` (`@/modules/access/access.query`).

**Ngoại lệ ghi kèm thao tác:** code server của một module (action, `*.lib.ts` server-only) được gọi hai hàm ghi dùng chung, luôn truyền transaction của thao tác để thao tác rollback thì dòng ghi kèm cũng mất:
- `recordAudit(tx, record)` (`@/modules/audit/audit.lib`): ghi nhật ký thao tác.
- `notifyStudents(tx, studentIds, message)`, `notifyLecturers(tx, lecturerIds, message)`, `notifyUsers(tx, userIds, audience, message)` (`@/modules/notifications/notifications.lib`): ghi thông báo vào chuông và trang Thông báo của cổng người nhận. Sinh viên, giảng viên chưa có tài khoản cổng (`userId` trống) bị bỏ qua; hàm trả về id đã nhận để nơi gọi đếm số chưa nhận. `href` phải là đường dẫn thật trong cổng của người nhận. Chưa có dịch vụ email: đây là kênh báo duy nhất, giao diện không được hứa "đã gửi email".

**Ngoại lệ duy nhất: `*.schema.ts`.** Khóa ngoại nối bảng giữa các module (đăng ký học phần trỏ tới sinh viên, lớp học phần trỏ tới học phần), nên file schema được import file schema của module khác, và chỉ file schema. Import qua alias `@/modules/users/users.schema` như mọi file khác (drizzle-kit đọc được `paths` của tsconfig). Thứ tự phụ thuộc: `authentication` → `curriculum` → `users`, `facilities` → `course-registration` → các module còn lại; không có vòng.

**Dữ liệu mẫu (trước khi có DB):** page gọi `*.query.ts` như sau này gọi DB; query đọc từ `*.mock.ts` của chính module. Module nào cần thông tin của domain khác (tên học phần trong lớp học phần, tên SV trong danh sách lớp) thì giữ bản sao đã "join" sẵn, hoặc dùng `shared/libs/mock.lib.ts` để sinh cùng một SV/GV từ cùng một chỉ số. Ví dụ CPA không nằm trong `users`: trang ghép `users.getStudents()` với `grades.getStudentStandings()`. Thời điểm mock (hạn chót, đợt đăng ký) tính tương đối so với hôm nay để trạng thái "sắp đóng", "quá hạn" luôn hiện.

Thêm vai trò mới (trưởng khoa, phòng khảo thí...) thì làm theo cùng mẫu: `(dean)/dean/...` + `shared/components/layouts/dean/`.

## 3. Layouts

### Nguyên tắc

> **Ghi chú bắt buộc:**
> - **KHÔNG có chế độ chuyển sáng/tối.** Chỉ một giao diện sáng; không viết `dark:`, không `prefers-color-scheme`, không nút đổi theme.
> - **Toàn bộ UI phải chống AI slop theo [UI-RULES.md](UI-RULES.md)** (luật của plugin `evon:ui-ux` áp cho antd + Tailwind).
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
| **Public** | Khách, phụ huynh; điện thoại và máy tính | Header ngang (logo + menu + nút "Đăng nhập" Cerulean) → nội dung rộng → footer xanh Cerulean (địa chỉ, liên hệ) | Dưới `md`: dock nổi + sidebar trượt (`shared/components/ui/mobile-navigation.tsx`) |
| **Authentication** | Mọi người, chưa đăng nhập | Chia đôi: trái là panel Cerulean có logo và tên trường; phải là form trên nền trắng | Trên điện thoại bỏ panel trái, chỉ còn logo phía trên form |
| **Application** (SV) | Sinh viên, **chủ yếu dùng điện thoại** | Máy tính: sidebar trái thu gọn được + topbar (học kỳ đang chọn, số tín chỉ đã đăng ký, avatar). Dưới `lg`: **dock nổi chỉ icon** (Tổng quan, Đăng ký, TKB, Kết quả, Menu) + sidebar trượt đủ mục, cùng component `mobile-navigation.tsx` với public; dock tự ẩn khi cuộn xuống và khi đang gõ | Ưu tiên chạm bằng một tay; trong đợt đăng ký, topbar hiện đồng hồ đếm ngược |
| **Lecturer** (GV + cố vấn) | Giảng viên, chủ yếu dùng máy tính | Menu ngang trên cùng (Lịch dạy, Lớp học phần, Cố vấn*) + thanh ngữ cảnh lớp (tên lớp, sĩ số, tab Điểm danh / Nhập điểm) | Tập trung vào **một lớp tại một thời điểm**; menu "Cố vấn" chỉ hiện khi có role `advisor` |
| **Administrator** | Phòng Đào tạo, máy tính màn lớn | Sidebar sáng (xem PLAN.md mục 2.3), menu chia nhóm (Đào tạo, Học vụ, Người dùng, Báo cáo) + header (tìm kiếm toàn cục, breadcrumb, avatar) | Mật độ thông tin cao: bảng antd `size="small"`, nội dung rộng hết màn hình |

### Cấu trúc một folder layout

```
shared/components/layouts/application/
├── index.tsx              # export ApplicationLayout (server component)
├── sidebar.tsx            # "use client" — thu gọn/mở, đọc từ stores
└── topbar.tsx
```

Menu tài khoản (`UserMenu`) dùng chung cho 3 portal nên nằm ở `shared/components/ui/user-menu.tsx`.

- **Administrator:** `sidebar.tsx` (sáng, chọn theo PLAN.md mục 2.3), `global-search.tsx` (AutoComplete, dữ liệu do `app/(administrator)/administrator/layout.tsx` ghép từ các module), breadcrumb sinh từ `ADMINISTRATOR_NAVIGATION`.
- **Lecturer:** `header.tsx` (menu ngang, mục "Cố vấn" chỉ khi `isAdvisor`), `class-context-bar.tsx` (export qua `LecturerClassLayout`, dùng trong `classes/[classId]/layout.tsx`).

Mỗi folder chỉ export `index.tsx`; các file con là chi tiết nội bộ của layout đó. Menu lấy từ `shared/constants/navigation.constant.ts`, nên muốn thêm trang chỉ cần sửa một chỗ.

## 4. Quyết định chính

| Vấn đề | Chọn | Lý do |
|---|---|---|
| Root layout | Chỉ 1 file `app/layout.tsx` | Nếu mỗi group có root layout riêng, chuyển giữa các portal sẽ phải tải lại toàn trang |
| Theme | 1 `ConfigProvider` ở root đọc `shared/constants/theme.constant.ts`; layout nào cần chỉnh (ví dụ sidebar đậm của admin) thì lồng `ConfigProvider` con, vẫn lấy màu từ cùng file | Màu chỉ khai báo một chỗ |
| Slug URL | Tiếng Anh (`/application/registration`) | Đồng bộ với tên code, không phải xử lý dấu |
| Phân quyền | 2 lớp: `src/proxies/authentication.proxy.ts` chỉ xem có cookie session hay không (thiếu thì về `/authentication/sign-in?next=…`); `layout.tsx` của mỗi portal gọi `requireRole()` để kiểm tra session thật trên server, sai vai trò thì `forbidden()`. Layout và page render song song nên **mỗi query/action đọc dữ liệu thật phải tự kiểm session**, không dựa vào layout | Proxy chỉ nên làm việc nhẹ như redirect |
| `proxy.ts` | Bắt buộc nằm ở `src/proxy.ts` (Next yêu cầu); file này chỉ ghép các proxy trong `src/proxies/` | Giữ được cách chia folder theo mục đích |
| Vai trò | Cột `user.role`, nhiều vai trò cách nhau bởi dấu phẩy (`student`, `lecturer`, `admin`), đọc bằng `parseRoles()`. Cố vấn không phải vai trò tài khoản mà suy ra từ lớp sinh hoạt được phân công | Cố vấn luôn là giảng viên, nên nằm trong `(lecturer)` dưới dạng mục `advising/` có kiểm tra riêng |
| Xác thực | `modules/authentication/authentication.lib.ts` (`betterAuth`, chỉ server), `authentication.query.ts` (`getSession()`, `requireRole()`). Nằm trong module chứ không ở `shared/libs` vì cần schema của module `authentication` | Sinh viên đăng nhập bằng MSSV qua plugin `username` (nhận cả `50.01.104.013` và `5001104013`); email sinh viên bị chặn ở `/sign-in/email`. Giảng viên, cán bộ tạm đăng nhập bằng email cho tới khi chốt. Không có đăng ký, không đăng nhập bằng OTP. Quên mật khẩu: plugin `emailOTP` (gửi mã → kiểm mã → đặt mật khẩu mới, thu hồi mọi phiên); chưa có dịch vụ email nên mã in ra log server. Rate limit lưu ở bảng `rate_limit`, đăng nhập 5 lần/phút/IP, theo IP từ `x-forwarded-for` nên khi triển khai phải đứng sau reverse proxy ghi đè header này |
| MSSV | Lưu 10 chữ số liền; dữ liệu đưa ra giao diện đã định dạng `NN.NN.NNN.NNN` như thẻ sinh viên (`formatStudentCode`); ô nhập nhận cả hai dạng. Email và nội dung chuyển khoản học phí dùng 10 chữ số | Tìm kiếm qua `normalizeSearch()` bỏ dấu chấm nên gõ dạng nào cũng ra |
| Sau đăng nhập | Chuyển hướng theo role (khai báo trong `shared/constants/role.constant.ts`): admin → `/administrator`, lecturer → `/lecturer`, student → `/application/dashboard` | |
| State | Dữ liệu từ server: server component + server action. `zustand` chỉ giữ state UI | Không phải đồng bộ dữ liệu server ở hai nơi |
| Logic nghiệp vụ | Đặt trong `src/modules/*`, page chỉ ghép UI | Ví dụ "bảng điểm" được dùng ở cả trang SV, GV và cố vấn, viết một lần |
| Biến môi trường | Tiền tố `DEFEAT_*`, xem `.env.example`, parse ở `shared/libs/env.lib.ts` | better-auth không tự đọc các tên này, phải truyền `secret` và `baseURL` khi khởi tạo |
| `cacheComponents` | **Tắt** (cùng `partialPrefetching`). Registry antd tự viết ở `shared/components/antd-registry.tsx` | `@ant-design/cssinjs` và `@rc-component/portal` gọi `Date.now()`/`Math.random()` ở cấp module; `cacheComponents` cấm việc đó khi prerender nên buộc bọc cả app trong `<Suspense>`, làm trang render phía client và nháy khi tải lại. Bật lại khi antd sửa hoặc khi Next bắt buộc |

## 5. Lộ trình triển khai

1. **Nền tảng:** `env.lib.ts`, `db.lib.ts`, `drizzle.config.ts`, `theme.constant.ts`, gắn `ConfigProvider` ở root layout.
2. **Auth:** `auth.lib.ts`, `auth-client.lib.ts`, `session.lib.ts`, route `api/auth`, `src/proxy.ts` + `src/proxies/authentication.proxy.ts`, `AuthenticationLayout` và 3 trang sign-in / forgot-password / verify (không có sign-up).
3. **Layouts:** dựng 4 layout còn lại cùng `navigation.constant.ts`, mỗi portal có một trang trống để xem layout.
4. **Public:** trang chủ, thông báo (module `announcements`).
5. **Dữ liệu danh mục (admin):** chương trình đào tạo, học phần, học kỳ, lớp học phần, người dùng. Phải có dữ liệu này thì sinh viên mới có lớp để đăng ký.
6. **Đăng ký học phần (SV):** kiểm tra môn tiên quyết, giới hạn tín chỉ, trùng lịch; dùng transaction và khóa chỗ để không vượt sĩ số.
7. **Giảng viên:** danh sách lớp, điểm danh, nhập điểm.
8. **SV xem kết quả:** bảng điểm, GPA/CPA, TKB và xuất .ics, lịch thi.
9. **Cố vấn học tập:** SV gửi kế hoạch học tập, cố vấn duyệt; xem cảnh báo học vụ.
10. **Báo cáo và cảnh báo tự động** cho admin.

## 6. Nền tảng enterprise

| Thành phần | Nơi đặt | Cách dùng |
|---|---|---|
| Phân quyền | `modules/access` | Mỗi vai trò là một tập quyền (`Permission`) và phạm vi `university` hoặc `faculty`. Trang admin gọi `requirePermission("...")` ở dòng đầu, thiếu quyền thì `forbidden()` hiện `app/forbidden.tsx` (cần `experimental.authInterrupts`). Dữ liệu có khoa thì lọc bằng `inScope(viewer, faculty)`. Menu admin lọc theo `permission` của từng mục trong `navigation.constant.ts` |
| Xem thử vai trò | `access.action.ts` (`switchDemoViewer`) | Cookie `hcmue-demo-admin-role` chọn một bản ghi phân quyền mẫu; đổi trong menu tài khoản. Bỏ khi có đăng nhập thật |
| Đơn từ, quy trình duyệt | `modules/requests` | Mỗi loại đơn khai báo chuỗi bước (`REQUEST_KINDS`) và hạn xử lý từng bước. `requestView()` suy ra trạng thái và quá hạn, `decideStep()` chuyển bước. `RequestInbox` dùng chung cho 3 cổng (`mode` = `process` hoặc `own`) |
| Thông báo | `modules/notifications` + `shared/components/ui/notification-bell.tsx` | Layout của mỗi portal nhận danh sách đã ghép nhãn, trang `/…/notifications` dùng `NotificationList` |
| Nhật ký thao tác | `modules/audit` | Mỗi thao tác ghi ai, lúc nào, đối tượng, giá trị trước và sau |
| Quy chế, lịch năm học | `modules/settings` | Thang điểm, hạn mức tín chỉ, ngưỡng cảnh báo, tỉ lệ vắng, hạn xử lý quy trình. Hiện các module khác vẫn dùng hằng số mặc định trùng với giá trị này; khi có DB sẽ đọc từ đây |
| Khảo thí, phòng học, khảo sát | `modules/exams`, `modules/facilities`, `modules/surveys` | Dữ liệu dùng chung cho cả 3 cổng |

## 7. Danh sách màn hình

Sinh tự động từ `src/app/**/page.tsx` (đường dẫn redirect như `/application`, `/administrator/users`, `/lecturer/advising` cũng nằm trong danh sách). Mỗi cổng có `loading.tsx`, `error.tsx`, `not-found.tsx`; trang 403 ở `app/forbidden.tsx`.

| Cổng | Số trang | Đường dẫn |
|---|---|---|
| Công khai | 4 | `/`, `/about`, `/announcements`, `/announcements/[slug]` |
| Xác thực | 4 | `/authentication`, `/authentication/forgot-password`, `/authentication/sign-in`, `/authentication/verify` |
| Sinh viên | 14 | `/application`, `/application/curriculum`, `/application/dashboard`, `/application/exams`, `/application/grades`, `/application/notifications`, `/application/profile`, `/application/registration`, `/application/registration/history`, `/application/requests`, `/application/schedule`, `/application/study-plan`, `/application/surveys`, `/application/tuition` |
| Giảng viên | 19 | `/lecturer`, `/lecturer/advising`, `/lecturer/advising/academic-warnings`, `/lecturer/advising/appointments`, `/lecturer/advising/students`, `/lecturer/advising/students/[studentId]`, `/lecturer/advising/study-plans`, `/lecturer/classes`, `/lecturer/classes/[classId]`, `/lecturer/classes/[classId]/announcements`, `/lecturer/classes/[classId]/attendance`, `/lecturer/classes/[classId]/grading`, `/lecturer/classes/[classId]/syllabus`, `/lecturer/exams`, `/lecturer/notifications`, `/lecturer/profile`, `/lecturer/requests`, `/lecturer/schedule`, `/lecturer/workload` |
| Phòng Đào tạo | 32 | `/administrator`, `/administrator/announcements`, `/administrator/class-sections`, `/administrator/courses`, `/administrator/decisions`, `/administrator/exams`, `/administrator/exams/eligibility`, `/administrator/grade-publishing`, `/administrator/graduation`, `/administrator/notifications`, `/administrator/profile`, `/administrator/programs`, `/administrator/programs/[programId]`, `/administrator/registration-holds`, `/administrator/registration-monitor`, `/administrator/reports`, `/administrator/reports/academic-warnings`, `/administrator/reports/exports`, `/administrator/reports/surveys`, `/administrator/requests`, `/administrator/rooms`, `/administrator/settings`, `/administrator/settings/access`, `/administrator/settings/audit-log`, `/administrator/settings/calendar`, `/administrator/teaching-assignments`, `/administrator/terms`, `/administrator/users`, `/administrator/users/advisors`, `/administrator/users/lecturers`, `/administrator/users/students`, `/administrator/users/students/[studentId]` |

## 8. Quy tắc đăng ký học phần

Hàm thuần trong `modules/course-registration/course-registration.rule.ts`, dùng chung cho trang sinh viên và đăng ký hộ của Phòng Đào tạo:

| Kiểm tra | Nguồn dữ liệu | Hành vi |
|---|---|---|
| Khóa đăng ký | `RegistrationHold` (học phí, kỷ luật, hồ sơ, tình trạng học tập, cố vấn) | `blocking` chặn nút Đăng ký, không chặn thì chỉ nhắc |
| Đối tượng lớp | `ClassSection.audience` (ngành, khóa) | Chặn nếu sinh viên không thuộc đối tượng |
| Chỗ dành riêng | `ClassSection.reservedSeats` | Chỗ còn trống trừ phần giữ cho nhóm khác, hết thì cho vào danh sách chờ |
| Tiên quyết, song hành, tương đương | `Course.prerequisiteCodes`, `corequisiteCodes`, `equivalentCodes` | Đạt học phần tương đương được tính là đạt; song hành phải nằm trong các lớp đã chọn hoặc đã đạt |
| Nhóm thực hành | `ClassSection.labGroups` | Bắt buộc chọn 1 nhóm, lịch nhóm tính vào kiểm tra trùng lịch |
| Hạn mức tín chỉ | Quy chế + mức cảnh báo học vụ (`creditCapOf`) | Bị cảnh báo thì dùng `maxWhenWarned` |
| Sĩ số tối thiểu | `ClassSection.minEnrollment` | Lớp dưới mức được đề xuất hủy, sinh viên nhận gợi ý lớp thay thế |

Giờ tiết học ở `shared/constants/period.constant.ts`: 12 tiết, mỗi tiết 50 phút, bắt đầu 06:30, giải lao sau tiết 3 và 9, nghỉ trưa 11:40 đến 12:30, kết thúc 17:40.

## 9. Hiệu năng khi phát triển

| Vấn đề | Cách xử lý |
| --- | --- |
| `antd/es/index.js` có code chạy khi import nên Next không tối ưu barrel, mỗi route kéo cả thư viện | `modularizeImports` trong `next.config.ts` đổi `import { Button } from "antd"` thành `antd/es/button` |
| ESLint chậm | Bỏ ESLint, chỉ dùng oxlint (khoảng 1 giây cho toàn repo), xem mục 11 |

## 10. Cơ sở dữ liệu

- **PostgreSQL 18** (đang chạy 18.4; Postgres 19 mới ở RC, dự kiến GA 19/11/2026, chưa dùng). Khóa chính `uuid` mặc định `uuidv7()` (hàm có sẵn từ Postgres 18): id tăng theo thời gian nên chỉ mục B-tree chèn tuần tự, không phân mảnh như UUID v4.
- **Id luôn là UUID v7:** khóa chính mặc định `uuidv7()` ở DB; cần id trước khi ghi (tên file lưu trữ, id gửi kèm job) thì dùng `newId()` trong `@/shared/libs/id.lib.ts`. oxlint cấm `crypto.randomUUID()` (v4 ngẫu nhiên làm chỉ mục B-tree chèn rải rác và tách trang). `npm run test:db` kiểm mọi khóa chính uuid một cột đều mặc định `uuidv7()`.
- **Drizzle** `0.45` (bản ổn định mới nhất; 1.0 còn beta), `casing: "snake_case"`: tên cột trong code là camelCase, trong DB là snake_case.
- **Đặt tên ràng buộc unique tường minh** (`.unique("bang_cot_unique")`, `unique("bang_a_b_unique").on(...)`). Drizzle 0.45 với `casing` vẫn sinh tên unique theo camelCase (`students_userId_unique`), phải tự đặt; kiểm tra bằng `SELECT conname FROM pg_constraint WHERE conname ~ '[A-Z]'` phải rỗng.
- **`drizzle.config.ts`:** gom `src/modules/*/*.schema.ts`, `strict`, `verbose`, `breakpoints`, chỉ quản lý schema `public`, bảng lịch sử migration ở `drizzle.__drizzle_migrations`. `npm run db:check` kiểm tra migration nhất quán.
- **`db.lib.ts`** (chỉ chạy phía server, có `import "server-only"`): pool `postgres-js` giữ một bản qua HMR của Next dev; mỗi kết nối đặt `application_name=hcmue-portal`, `TimeZone=UTC`, `statement_timeout` (mặc định 15 s), `idle_in_transaction_session_timeout` 30 s để giao dịch treo không giữ khóa dòng. Biến tùy chọn: `DEFEAT_POSTGRES_POOL_MAX`, `DEFEAT_POSTGRES_STATEMENT_TIMEOUT_MS`, `DEFEAT_DATABASE_LOG_QUERIES`. Script và test chạy với `tsx --conditions=react-server` để qua được `server-only`.
- **`pg-error.lib.ts`:** `PG_ERROR` (bảng mã SQLSTATE: `UNIQUE_VIOLATION` 23505, `FOREIGN_KEY_VIOLATION` 23503, `CHECK_VIOLATION` 23514, `SERIALIZATION_FAILURE` 40001, `DEADLOCK_DETECTED` 40P01…), `getPgError()` bóc lỗi gốc khỏi `DrizzleQueryError`, `isPgError()`, `isRetryablePgError()`, `withRetry()` thử lại có lùi thời gian cho xung đột đồng thời và mất kết nối, `pgErrorMessage(error, messages)` đổi lỗi thành câu tiếng Việt: tra theo tên ràng buộc trong bảng của module (`REGISTRATION_CONSTRAINT_MESSAGE`, `GRADES_CONSTRAINT_MESSAGE`), không có thì câu chung theo mã.
- **Migration** ở `drizzle/`: `0000_initial_schema.sql` do `npm run db:generate` sinh từ các `*.schema.ts`; `0001_integrity_triggers.sql` viết tay cho các ràng buộc nhiều dòng:

| Trigger | Việc |
|---|---|
| `enrollments_sync_counts` | Thêm, hủy, đổi nhóm đăng ký thì tự cộng trừ `enrolled_count` của lớp, nhóm thực hành và `taken_count` của chỗ dành riêng. Vượt sức chứa thì `CHECK` chặn và hủy cả giao dịch; hai người tranh chỗ cuối thì `UPDATE` khóa dòng lớp nên chỉ một người được |
| `grade_components_weights_total_100`, `syllabus_assessments_weights_total_100` | Tổng trọng số phải bằng 100, kiểm tra lúc commit (`DEFERRABLE INITIALLY DEFERRED`) để sửa nhiều thành phần trong một giao dịch |
| `enrollments_guard` (`0004`) | Không đăng ký vào lớp đã hủy; lớp có nhóm thực hành thì phải chọn nhóm |
| `grade_scores_same_section`, `attendance_records_same_section` | Điểm và điểm danh chỉ ghi cho sinh viên của chính lớp đó |
| `survey_submissions_enrolled` | Chỉ sinh viên đang học lớp mới nộp khảo sát lớp đó |
| `reserved_seats_within_capacity` | Tổng chỗ dành riêng không vượt sĩ số, kể cả khi giảm sĩ số lớp (kiểm tra lúc commit) |
| `terms_no_overlap` (`EXCLUDE USING gist`) | Hai học kỳ không chồng khoảng ngày |

Trigger báo lỗi bằng `RAISE ... USING CONSTRAINT = '<tên>'` nên `pgErrorMessage()` tra được câu tiếng Việt như ràng buộc thường.

- **Kiểu dữ liệu khớp frontend:** `tests/schema-types.check.ts` so từng `pgEnum` với kiểu union tương ứng trong `*.type.ts` (35 cặp); lệch một giá trị là `tsc` báo lỗi.
- **Lưu ý drizzle-kit:** khi thêm khóa ngoại kép cùng ràng buộc unique mà nó trỏ tới, drizzle-kit có thể sinh câu `ADD FOREIGN KEY` trước `ADD UNIQUE`; kiểm migration bằng cách chạy trên DB trắng trước khi commit.

- **Ràng buộc đặt ở DB**, không chỉ ở code: sĩ số trong sức chứa, một đăng ký hiệu lực mỗi lớp và một lớp mỗi học phần trong học kỳ (unique index có điều kiện), nhóm thực hành thuộc đúng lớp và học kỳ, học phần trên đăng ký khớp lớp (khóa ngoại kép), tiết 1..12, thứ 2..8, điểm 0..10, một học kỳ hiện tại, một kế hoạch học tập hiệu lực mỗi SV, đơn từ có đúng một người gửi.
- **Khảo sát ẩn danh:** `survey_submissions` ghi ai đã nộp (để nhắc), `survey_responses` + `survey_answers` giữ câu trả lời không có khóa tới sinh viên; ngày nộp chỉ lưu ngày, không lưu giờ.
- **Cấu hình quy chế** lưu `jsonb` có phiên bản (`regulations.rules`), validate bằng zod khi ghi.

Chạy cục bộ:

```bash
cp .env.example .env              # sửa DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL nếu cần
npm run db:migrate                # tạo bảng trên DB trắng
npm run db:seed                   # dữ liệu mẫu + 3 tài khoản (mật khẩu mặc định Hcmue@2026)
npm run test:db                   # 25 test: ràng buộc (tranh chỗ cuối, trùng đăng ký, trọng số 100) và pg-error.lib
npm run db:check                  # migration nhất quán
npm run db:studio                 # xem dữ liệu
```

### Đọc / ghi dữ liệu thật (mẫu: module `facilities`)

| Bước | Cách làm |
|---|---|
| Query (`*.query.ts`) | `import "server-only"`, dòng đầu gọi `requireSession()` (hoặc `requirePermission()` nếu dữ liệu chỉ cán bộ được xem), chọn đúng cột cần qua một object cột (`ROOM_COLUMNS`) để kiểu trả về khớp kiểu frontend, không trả cả dòng DB |
| Action (`*.action.ts`) | `"use server"`, thứ tự: kiểm quyền (`requirePermission`) → `parseInput(schema, input)` → `try { lệnh DB } catch { return actionFailure(error, MODULE_CONSTRAINT_MESSAGE) }` → `revalidatePath`. Trả `ActionResult<T>` (`shared/libs/action.lib.ts`), không throw lỗi nghiệp vụ ra client. Chỉ bọc lệnh DB trong `try`, kiểm quyền đặt trước để `forbidden()`/`redirect()` của Next đi tiếp |
| Lỗi ràng buộc | Mỗi module có `*_CONSTRAINT_MESSAGE` (tên ràng buộc → câu tiếng Việt) trong `*.constant.ts`. Form chặn trước, DB chặn lần cuối, cả hai cùng một câu |
| Drawer form | Prop `onSubmit` trả `Promise<fieldErrors | undefined>`: bảng cha gọi action, drawer tự bật loading và gắn lỗi vào ô bằng `toFormFields` (`course-form-drawer.tsx`, `program-form-drawer.tsx`) |
| Định danh trên URL | Trang chi tiết nhận uuid; thêm route vào `UUID_ROUTES` trong `route-param.proxy.ts` để sai định dạng trả 404 thật, query vẫn kiểm `isUuid()` trước khi gửi xuống Postgres |
| Component | Gọi action trong `useTransition`; `result.ok` thì cập nhật state từ `result.data` (dữ liệu DB trả về, không phải giá trị form), không thì `form.setFields` theo `fieldErrors` và hiện `result.message` |
| Test | Schema zod và câu báo lỗi ràng buộc test bằng `node:test` trên DB thật (`tests/facilities.test.ts`); action cần phiên đăng nhập nên kiểm tay trên trình duyệt |

### Chuyển một module từ mock sang DB

| Việc | Cách làm |
|---|---|
| Id dùng chung | `mockId(key)` trong `shared/libs/mock.lib.ts` băm khóa ổn định (`"student:12"`, `"term:hk1-2026"`, `"section:hk1-2026:COMP1020.01"`) ra uuid dạng v7. Mock dùng `mockId`, `mockTermId`, `mockSectionId`; seed ghi đúng id đó vào DB. Nhờ vậy module đã đọc DB và module còn đọc mock trỏ về cùng một bản ghi, chuyển được từng module mà app không vỡ |
| Seed | `scripts/db-seed.ts` gọi lần lượt `scripts/seed/*.seed.ts` (mỗi module một file, nhận `tx` và `SeedContext`). Seed lấy dữ liệu từ `*.mock.ts` của module, giữ nguyên id của mock, giữ ngày giờ tương đối (`mockDate`) để trạng thái "sắp hết hạn", "quá hạn" vẫn hiện |
| Query | Viết lại `*.query.ts` trả đúng kiểu cũ trong `*.type.ts` để component không phải sửa. MSSV trả ra bằng `formatStudentCode` |
| Sau khi chuyển | `*.mock.ts` chỉ còn seed dùng; không query nào import mock nữa. Test seed khớp mock trong `tests/seed.test.ts` |
| Tài khoản seed | Sinh viên `50.01.104.009`, giảng viên `hanhpt@hcmue.edu.vn` (kiêm cố vấn), Phòng Đào tạo `khoatm@hcmue.edu.vn`, mật khẩu `Hcmue@2026`. Đây chính là sinh viên và giảng viên "hiện tại" của dữ liệu mẫu (`CURRENT_STUDENT_ID`, `CURRENT_LECTURER_ID`) |

Phân quyền cổng quản trị đọc từ DB: `getViewer()` lấy các vai trò trong `role_assignments` của tài khoản đang đăng nhập; có nhiều vai trò thì đổi qua menu tài khoản (`switchActiveRole`, chỉ trong số vai trò của chính mình). Vai trò có sẵn mang `roles.key` cố định (`faculty-secretary`…) để code nhận ra, không so theo `id`.

### Lưu tệp tải lên

| Việc | Cách làm |
|---|---|
| Kho tệp | `shared/libs/storage.lib.ts` (server-only): `putFile`, `readFile`, `deleteFile`, `listFiles`, `withStoredFiles`. Hiện ghi đĩa cục bộ dưới `DEFEAT_STORAGE_DIRECTORY` (mặc định `./storage`, đã gitignore); nơi gọi chỉ biết khóa, không biết đường dẫn đĩa, nên đổi sang S3/R2 chỉ viết lại file này |
| Khóa | Luôn do server sinh: `requests/<uuid v7>`, `exams/<uuid v7>` (`newStorageKey`). Tên tệp người dùng chỉ lưu ở cột `file_name` để hiện và đặt tên khi tải; khóa sai mẫu (`../x`, đường dẫn tuyệt đối) bị từ chối |
| Kiểm tệp | `shared/libs/upload.lib.ts` (hàm thuần, dùng cả client lẫn server): đuôi thuộc danh sách cho phép **và** chữ ký đầu tệp khớp (PDF `%PDF-`, PNG, JPG, docx là zip), kích thước. Kiểu tệp lưu xuống lấy theo danh sách, không theo kiểu trình duyệt gửi. Minh chứng đơn từ: PDF, ảnh, docx, 10 MB/tệp, 25 MB/đơn, 5 tệp (DB chặn 10 MB). Đề thi, đáp án: PDF, 20 MB/tệp (DB chặn 20 MB) |
| Tải lên | Server action nhận `FormData` (dữ liệu form là JSON ở ô `input`, tệp ở ô riêng). `serverActions.bodySizeLimit` và `proxyClientMaxBodySize` đặt 41 MB trong `next.config.ts` (proxy đệm thân request của trang cổng, quá giới hạn thì thân bị cắt im lặng) |
| Giao dịch | `withStoredFiles(files, work)`: ghi tệp trước, chạy giao dịch; giao dịch hỏng thì xóa tệp vừa ghi. Nộp lại đề thì xóa tệp cũ sau commit. Tiến trình chết giữa chừng hoặc xóa không được thì tác vụ `POST /api/cron/orphan-files` xóa tệp không còn dòng DB nào trỏ tới (chỉ tệp cũ hơn 1 giờ) |
| Tải xuống | Route handler `/api/files/requests/[attachmentId]` (người xem được đơn: người gửi, cố vấn khi đơn có bước cố vấn, giảng viên được giao bước, cán bộ có bước thuộc vai trò mình trong phạm vi khoa) và `/api/files/exams/[sessionId]/[paper|answer-key]` (giảng viên dạy lớp, cán bộ có `exams.manage` trong phạm vi khoa). Không quyền trả 404. Header: `Content-Disposition` RFC 6266/5987 giữ tên tiếng Việt, `Content-Type` đã lưu, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` |
| Seed | Mỗi minh chứng, đề mẫu có một tệp PDF nhỏ "Tệp mẫu" (`scripts/seed/sample-file.ts`), khóa tất định theo id mock; seed xóa tệp cũ trong kho vì DB vừa bị xóa sạch |

## 11. Lint (oxlint)

Dự án chỉ dùng **oxlint**, không dùng ESLint. Cấu hình ở `.oxlintrc.json`.

```bash
npm run lint        # oxlint --deny-warnings: có cảnh báo cũng là hỏng
npm run lint:fix    # tự sửa những gì sửa được
```

Plugin bật: `typescript`, `react` (gồm react-hooks), `nextjs`, `jsx-a11y`, `import`, `unicorn`, `oxc`. Nhóm `correctness` là lỗi, nhóm `suspicious` là cảnh báo.

| Quy tắc | Mức | Vì sao |
|---|---|---|
| `no-restricted-imports` với mẫu `^\.\.?/` | lỗi | Luôn import qua alias `@/`, không dùng `./`, `../` |
| `no-restricted-properties` cấm `crypto.randomUUID` | lỗi | Id dùng `newId()` (UUID v7) để chỉ mục B-tree chèn tuần tự |
| `react/rules-of-hooks`, `react/jsx-key` | lỗi | Hook gọi đúng chỗ, phần tử trong danh sách có `key` |
| `react/exhaustive-deps` | cảnh báo | Thiếu phụ thuộc trong `useEffect`, `useMemo`... |
| 21 rule `nextjs/*` (`no-img-element`, `no-html-link-for-pages`, `no-async-client-component`...) | lỗi | Thay cho `eslint-config-next` |
| `jsx-a11y/alt-text`, `anchor-is-valid`, `aria-props`, `aria-role`... | lỗi | Truy cập được bằng trình đọc màn hình |
| `typescript/no-explicit-any`, `typescript/consistent-type-imports` | lỗi | Không dùng `any`; import kiểu bằng `import type` |
| `no-unused-vars` (cho phép tên bắt đầu `_`), `eqeqeq`, `import/no-cycle`, `import/no-duplicates` | lỗi | |
| `unicorn/no-array-sort`, `unicorn/no-array-reverse` | cảnh báo | Dùng `toSorted()`, `toReversed()`: không sửa mảng gốc (mảng mock, props, state) |
| `react/purity` | lỗi | Không gọi `new Date()`, `Math.random()` khi render; thời gian hiện tại lấy qua `@/shared/libs/date.lib` (`currentYear()`, `weekdayOf()`) |
| `no-console` | cảnh báo (tắt trong `scripts/`, `tests/`) | Chỉ cho `console.warn`, `console.error` |

Tắt có lý do:

| Quy tắc | Phạm vi | Lý do |
|---|---|---|
| `react/no-danger` | chỉ `antd-registry.tsx` | Chèn CSS của antd khi render phía server bắt buộc dùng `dangerouslySetInnerHTML` |
| `jsx-a11y/prefer-tag-over-role` | toàn repo | Sheet menu mobile (`role="dialog"`) và biểu đồ (`role="img"`) không có thẻ HTML thay thế tương đương |
| `jsx-a11y/no-autofocus` | toàn repo | Trang đăng nhập cố ý đặt con trỏ vào ô email |
| `react/no-unstable-nested-components` | cho phép trong props | `optionRender`, `expandedRowRender` của antd là hàm render, không phải component lồng |
| `import/no-unassigned-import` | cho phép CSS, `server-only`, `dayjs/locale/*` | Import để lấy tác dụng phụ |
