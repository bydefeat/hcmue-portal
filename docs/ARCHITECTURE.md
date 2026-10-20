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
│   │       └── forgot-password/page.tsx  # quên mật khẩu, kích hoạt tài khoản (OTP)
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
│   │       │   │   └── [studentCode]/ # hồ sơ + bảng điểm (mã SV trên URL)
│   │       │   ├── lecturers/       # GV + phân quyền
│   │       │   └── advisors/        # phân công cố vấn theo lớp sinh hoạt
│   │       └── reports/             # thống kê, xếp loại học lực
│   │           └── academic-warnings/
│   │
│   └── api/
│       ├── auth/[...all]/route.ts   # handler của better-auth
│       ├── cron/[job]/route.ts      # tác vụ định kỳ (GET, POST), xem mục "Tác vụ định kỳ"
│       └── files/                   # tải minh chứng đơn từ, đề thi (kiểm quyền, luồng từ kho tệp)
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
    │   ├── login-name.lib.ts        # tên đăng nhập = MSSV hoặc mã cán bộ, giảng viên ("GV104011" lưu "gv104011")
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

**Ngoại lệ đọc dữ liệu nghiệp vụ dùng chung** (một nguồn cho mọi module, không tự viết lại):
- Đơn từ (`requests.action.ts`) đọc CPA qua `getStudentStandings()` của `grades.query` để kiểm điều kiện học vượt: nguồn CPA duy nhất (lần học cuối), không tự tính lại trong module đơn từ.
- Quy chế: `getRegulation()` / `getRegulationAt(date)` (`@/modules/settings/settings.query`, cache theo request, cần phiên đăng nhập) và `regulationAt(executor, date?)` (`@/modules/settings/settings.lib`, dùng trong transaction, cron, không kiểm quyền). Không đọc bảng `regulations` trực tiếp.
- Kết quả học tập: `loadTranscripts(executor, studentIds, options)`, `cumulativeResults(executor, options)`, `currentWarnings(executor, studentIds?)`, `currentWarningLevel(executor, studentId)` (`@/modules/grades/grades.lib`); hàm thuần `latestGrades`, `latestAttempts`, `computeStanding`, `letterOf`, `weightedScore` (`@/modules/grades/grades.rule`).
- Chương trình đào tạo của sinh viên: `programsOf(executor, students)` + `programFor(map, student)`, `requiredCoursesOf(executor, programIds)` (`@/modules/curriculum/curriculum.lib`); trang dùng `getProgramOf(majorCode, cohort)` (`curriculum.query`).
- Xét tốt nghiệp: `loadGraduationCandidates(viewer, executor?)`, `openGraduationRound()` (`@/modules/graduation/graduation.lib`).
- Học phí còn nợ: `INVOICE_TOTAL_SQL`, `INVOICE_PAID_SQL` (`@/modules/tuition/tuition.lib`).

**Ngoại lệ ghi kèm thao tác:** code server của một module (action, `*.lib.ts` server-only) được gọi hai hàm ghi dùng chung, luôn truyền transaction của thao tác để thao tác rollback thì dòng ghi kèm cũng mất:
- `recordAudit(tx, record)` (`@/modules/audit/audit.lib`): ghi nhật ký thao tác.
- `notifyStudents(tx, studentIds, message)`, `notifyLecturers(tx, lecturerIds, message)`, `notifyUsers(tx, userIds, audience, message)` (`@/modules/notifications/notifications.lib`): ghi thông báo vào chuông và trang Thông báo của cổng người nhận. Sinh viên, giảng viên chưa có tài khoản cổng (`userId` trống) bị bỏ qua; hàm trả về id đã nhận để nơi gọi đếm số chưa nhận. `href` phải là đường dẫn thật trong cổng của người nhận. Email không đi kèm tự động: cần email thì xếp thư bằng `enqueueMail` (dưới đây).
- `enqueueMail(tx, messages)` (`@/modules/mail/mail.lib`): xếp thư vào hàng đợi `mail_outbox` (mỗi người nhận một dòng), trả id thư; sau khi commit gọi `deliverMailSoon(ids)` để gửi ngay sau khi trả phản hồi (`after()`), hoặc `await deliverQueuedMail(ids)` trong tác vụ nền. Không gọi thẳng `sendMail` cho thư nghiệp vụ (xem mục "Hàng đợi thư").

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
| Xác thực | `modules/authentication/authentication.lib.ts` (`betterAuth`, chỉ server), `authentication.query.ts` (`getSession()`, `requireRole()`). Nằm trong module chứ không ở `shared/libs` vì cần schema của module `authentication` | Mọi tài khoản đăng nhập bằng mã số qua plugin `username` (`login-name.lib.ts`): sinh viên dùng MSSV (nhận cả `50.01.104.013` và `5001104013`, lưu 10 chữ số), giảng viên và cán bộ dùng `lecturers.code` / `staff_members.code` (không phân biệt hoa thường, lưu `username` chữ thường `gv104011`, `displayUsername` chữ hoa). Mã giảng viên, cán bộ không đổi sau khi tạo (ô mã khóa khi sửa) nên username không cần đồng bộ. Đăng nhập bằng email bị chặn cho mọi tài khoản (`USE_LOGIN_CODE`, cùng một câu, không lộ email nào có tài khoản); email trường chỉ để nhận mã kích hoạt và đặt lại mật khẩu. Không có đăng ký, không đăng nhập bằng OTP. Quên mật khẩu: plugin `emailOTP` (gửi mã → kiểm mã → đặt mật khẩu mới, thu hồi mọi phiên). Rate limit lưu ở bảng `rate_limit`, đăng nhập 5 lần/phút/IP, theo IP từ `x-forwarded-for` nên khi triển khai phải đứng sau reverse proxy ghi đè header này. Thêm giới hạn theo tên đăng nhập (`authentication.lockout.ts`, bảng `sign_in_failures`): hook `before` của `/sign-in/username` tính lần thử vào bộ đếm trước khi so mật khẩu (một câu `INSERT ... ON CONFLICT`, request song song không lọt quá), sai 10 lần trong 15 phút thì khóa tạm 15 phút (`SIGN_IN_LOCKED`, 429, áp cả với tên không tồn tại), đăng nhập đúng, đặt lại mật khẩu hoặc admin mở khóa thì xóa bộ đếm; lúc khóa ghi log `[auth] Tạm khóa đăng nhập`. Tác vụ cron `sign-in-failures` dọn dòng hết hạn. Phiên đọc từ cookie cache 60 giây (`session.cookieCache`, JWE) nên khóa tài khoản, thu hồi phiên có hiệu lực trong tối đa 60 giây với request chỉ đọc cookie |
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
| Đổi vai trò đang dùng | `access.action.ts` (`switchActiveRole`) | Tài khoản có nhiều vai trò trong `role_assignments` chọn vai trò đang dùng ở menu tài khoản; lưu ở cookie `hcmue-active-role`, chỉ nhận vai trò của chính tài khoản đó |
| Đơn từ, quy trình duyệt | `modules/requests` | Xem mục "Đơn từ" bên dưới |
| Thông báo cá nhân | `modules/notifications` + `shared/components/ui/notification-bell.tsx` | Layout của mỗi cổng nhận 20 thông báo mới nhất cho chuông và số chưa đọc đếm bằng SQL (`getUnreadNotificationCount`); trang `/…/notifications` (`NotificationList`) tải từng trang theo con trỏ ("Xem thêm"), lọc loại, chưa đọc, xóa, đánh dấu đọc hết. Tác vụ `notifications-cleanup` xóa thông báo đã đọc quá 180 ngày, chưa đọc quá 365 ngày |
| Thông báo chung | `modules/announcements` | Đối tượng có cấu trúc (`audience` jsonb: sinh viên theo khóa, ngành, khoa; giảng viên theo khoa). Trang công khai chỉ hiện thông báo có gửi sinh viên; cổng sinh viên, giảng viên (`/application/announcements`, `/lecturer/announcements`) hiện theo đúng đối tượng; quá hạn chót tự rời danh sách; lượt xem tăng sau khi trả trang chi tiết (`after()`). Đăng ngay có thể gửi kèm thông báo cá nhân, email (một lần, `notified_at`); bài hẹn giờ gửi bằng tác vụ `announcement-notifications`. Đã đăng thì không lưu nháp lại được, chỉ gỡ |
| Nhật ký thao tác | `modules/audit` | Mỗi thao tác ghi ai, lúc nào, đối tượng, giá trị trước và sau |
| Quy chế, lịch năm học | `modules/settings` | Nguồn duy nhất của mọi tham số quy chế (xem mục "Quy chế đào tạo" bên dưới); hằng số trong code chỉ là giá trị mặc định khi seed |
| Khảo thí, phòng học, khảo sát | `modules/exams`, `modules/facilities`, `modules/surveys` | Dữ liệu dùng chung cho cả 3 cổng |

## 7. Danh sách màn hình

Sinh tự động từ `src/app/**/page.tsx` (đường dẫn redirect như `/application`, `/administrator/users`, `/lecturer/advising` cũng nằm trong danh sách). Mỗi cổng có `loading.tsx`, `error.tsx`, `not-found.tsx`; trang 403 ở `app/forbidden.tsx`.

| Cổng | Số trang | Đường dẫn |
|---|---|---|
| Công khai | 4 | `/`, `/about`, `/announcements`, `/announcements/[slug]` |
| Xác thực | 3 | `/authentication`, `/authentication/forgot-password`, `/authentication/sign-in` |
| Sinh viên | 19 | `/application`, `/application/advising`, `/application/announcements`, `/application/announcements/[slug]`, `/application/classes`, `/application/classes/[classId]`, `/application/curriculum`, `/application/dashboard`, `/application/exams`, `/application/grades`, `/application/notifications`, `/application/profile`, `/application/registration`, `/application/registration/history`, `/application/requests`, `/application/schedule`, `/application/study-plan`, `/application/surveys`, `/application/tuition` |
| Giảng viên | 21 | `/lecturer`, `/lecturer/advising`, `/lecturer/advising/academic-warnings`, `/lecturer/advising/appointments`, `/lecturer/advising/students`, `/lecturer/advising/students/[studentId]`, `/lecturer/advising/study-plans`, `/lecturer/announcements`, `/lecturer/announcements/[slug]`, `/lecturer/classes`, `/lecturer/classes/[classId]`, `/lecturer/classes/[classId]/announcements`, `/lecturer/classes/[classId]/attendance`, `/lecturer/classes/[classId]/grading`, `/lecturer/classes/[classId]/syllabus`, `/lecturer/exams`, `/lecturer/notifications`, `/lecturer/profile`, `/lecturer/requests`, `/lecturer/schedule`, `/lecturer/workload` |
| Phòng Đào tạo | 35 | `/administrator`, `/administrator/announcements`, `/administrator/class-sections`, `/administrator/courses`, `/administrator/decisions`, `/administrator/exams`, `/administrator/exams/eligibility`, `/administrator/grade-publishing`, `/administrator/graduation`, `/administrator/notifications`, `/administrator/profile`, `/administrator/programs`, `/administrator/programs/[programId]`, `/administrator/registration-holds`, `/administrator/registration-monitor`, `/administrator/reports`, `/administrator/reports/academic-warnings`, `/administrator/reports/exports`, `/administrator/reports/surveys`, `/administrator/requests`, `/administrator/rooms`, `/administrator/settings`, `/administrator/settings/access`, `/administrator/settings/audit-log`, `/administrator/settings/calendar`, `/administrator/teaching-assignments`, `/administrator/terms`, `/administrator/users`, `/administrator/users/advisors`, `/administrator/users/lecturers`, `/administrator/users/students`, `/administrator/users/students/[studentCode]`, `/administrator/settings/mail`, `/administrator/tuition` (danh sách này lập trước đợt 2; các trang thêm sau như quyết định, xét tốt nghiệp xem thẳng trong `src/app`) |

## 8. Quy tắc đăng ký học phần

Hàm thuần trong `modules/course-registration/course-registration.rule.ts`, dùng chung cho trang sinh viên và đăng ký hộ của Phòng Đào tạo:

| Kiểm tra | Nguồn dữ liệu | Hành vi |
|---|---|---|
| Khóa đăng ký | `RegistrationHold` (học phí, kỷ luật, hồ sơ, tình trạng học tập, cố vấn) | `blocking` chặn nút Đăng ký, không chặn thì chỉ nhắc |
| Đối tượng lớp | `ClassSection.audience` (ngành, khóa) | Chặn nếu sinh viên không thuộc đối tượng |
| Chỗ dành riêng | `ClassSection.reservedSeats` | Chỗ còn trống trừ phần giữ cho nhóm khác, hết thì cho vào danh sách chờ |
| Tiên quyết, song hành, tương đương | `Course.prerequisiteCodes`, `corequisiteCodes`, `equivalentCodes` | Đạt học phần tương đương được tính là đạt; song hành phải nằm trong các lớp đã chọn hoặc đã đạt |
| Nhóm thực hành | `ClassSection.labGroups` | Bắt buộc chọn 1 nhóm, lịch nhóm tính vào kiểm tra trùng lịch |
| Hạn mức tín chỉ | Quy chế + cảnh báo học vụ chính thức (`creditCapOf`, `currentWarningLevel`) | Bị cảnh báo thì dùng `maxWhenWarned` |
| Sĩ số tối thiểu | `ClassSection.minEnrollment` | Lớp dưới mức được đề xuất hủy, sinh viên nhận gợi ý lớp thay thế |

Giờ tiết học ở `shared/constants/period.constant.ts`: 12 tiết, mỗi tiết 50 phút, bắt đầu 06:30, giải lao sau tiết 3 và 9, nghỉ trưa 11:40 đến 12:30, kết thúc 17:40.

### Lõi ghi đăng ký (`course-registration.lib.ts`)

Mọi thao tác đổi đăng ký của sinh viên, của Phòng Đào tạo và của hệ thống đi qua cùng một lõi, trong transaction; server kiểm lại bằng chính các hàm thuần mà giao diện dùng:

| Việc | Cách làm |
|---|---|
| Khóa theo sinh viên + học kỳ | `lockRegistration`: `pg_advisory_xact_lock(hashtextextended('registration:<sinh viên>:<học kỳ>', 0))` trước khi đọc trạng thái, nên hai yêu cầu song song của cùng sinh viên (hai tab, bấm hai lần) chạy nối tiếp, không cùng lọt phép kiểm hạn mức, trùng lịch, song hành. Xếp từ danh sách chờ dùng `pg_try_advisory_xact_lock`: sinh viên đang có thao tác khác thì bỏ qua lượt, giữ vị trí chờ |
| Giữ chỗ | `claimSeat` khóa dòng lớp (`FOR UPDATE`), trừ chỗ dành riêng cho đối tượng khác, dùng chỗ dành riêng của đối tượng mình nếu còn; trigger `enrollments_sync_counts` cộng sĩ số, `CHECK` chặn vượt sức chứa |
| Sinh viên tự thao tác | `registerForStudent`, `dropForStudent` (kiểm `dropProblem`: song hành bắt buộc, tối thiểu tín chỉ), `swapForStudent` (đổi lớp hoặc đổi nhóm thực hành một bước: không được chỗ mới thì rollback, giữ chỗ cũ), `joinWaitlistForStudent`. Điều kiện chung (`selfServiceState`): đang học, đợt của khóa đang mở (`periodOf` / `applicablePeriod`: đang mở > sắp mở gần nhất > vừa đóng), không bị khóa (`registrationBlockOf`: khóa do cán bộ đặt, hoặc học phí học kỳ hiện tại đã chốt, quá hạn, còn nợ) |
| Điều kiện học vụ | `eligibilityOf`: điểm lần học cuối (`gradeFactsOf`), quan hệ tiên quyết, song hành, tương đương của đúng các học phần liên quan, học phần đang học, hạn mức tín chỉ (quy chế đang áp dụng, hạn mức riêng của đợt, cảnh báo chính thức, số tín chỉ còn lại của chương trình) |
| Phòng Đào tạo | `adminRegisterStudent` (bỏ qua được điều kiện học vụ và khóa đăng ký khi chọn "Bỏ qua" và ghi lý do; sĩ số, nhóm thực hành, trùng lịch luôn chặn), `adminDropStudent`, `cancelSection` (một đường duy nhất cho mọi nơi hủy lớp: rút sinh viên, hủy danh sách chờ, bỏ buổi học tương lai, cập nhật học phí, báo sinh viên), `moveStudents` (chuyển sinh viên của lớp đã hủy sang lớp mở cùng học phần; ai không đủ điều kiện thì trả lý do) |
| Nhật ký | Mỗi lượt ghi `registration_events` (đăng ký, hủy, đổi, vào chờ, được xếp, lượt chờ hết hạn, Phòng Đào tạo đăng ký/hủy hộ, lớp bị hủy) với người thao tác và kênh; lịch sử đăng ký của sinh viên và nhịp đăng ký (`registrationActivityOf`) đọc từ đây |
| Học phí đi kèm | Mọi thao tác trên gọi `syncTermInvoice` trong cùng transaction (mục "Học phí theo đăng ký") |

**Danh sách chờ** (`waitlist_entries`, trạng thái `waiting` / `promoted` / `cancelled` / `expired`, unique index một lượt chờ mỗi sinh viên mỗi lớp): chỉ vào được khi lớp không còn chỗ cho sinh viên (đầy, phần còn lại là chỗ dành riêng, hoặc mọi nhóm thực hành đều đầy) và sinh viên đủ mọi điều kiện khác. `promoteWaitlist` chạy trong transaction của thao tác làm trống chỗ (sinh viên hủy, đổi lớp, Phòng Đào tạo hủy hộ, tăng sĩ số lớp, tăng sĩ số hoặc thêm nhóm thực hành: `addsSeats`; nút "Xếp lại" ở trang danh sách chờ): xếp lần lượt người đầu danh sách còn đủ điều kiện và đang trong đợt đăng ký mở của khóa, chọn nhóm thực hành còn chỗ không trùng lịch; người không đủ thì bỏ qua lượt này, giữ vị trí; người được xếp nhận thông báo. `expireWaitlists`: lượt chờ của sinh viên mà khóa không còn đợt nào của học kỳ chưa đóng (kể cả đợt điều chỉnh sắp mở) chuyển `expired`, ghi sự kiện `waitlist-expired`, báo sinh viên một lần. Chạy khi Phòng Đào tạo đóng sớm hoặc sửa đợt và bằng tác vụ `waitlist-expiry`; chỉ lấy lượt đang chờ (`FOR UPDATE SKIP LOCKED`) nên chạy lại không trùng.

**Lớp học phần:** phòng chọn theo id (mã phòng chỉ unique trong một cơ sở: `rooms_campus_id_code_unique`); ô chọn hiện mã, cơ sở, sức chứa; phòng bảo trì nằm cuối danh sách, không chọn được. `scheduleProblemOf` chặn phòng bảo trì, phòng thiếu chỗ (phòng lý thuyết theo sĩ số lớp, phòng thực hành theo sĩ số nhóm), trùng phòng, trùng giờ giảng viên với mọi lớp trong học kỳ (`conflictsOf`, so phòng theo id). Học kỳ hiện tại, học kỳ nhận đăng ký đặt bằng `switchTermFlag` (mỗi loại một học kỳ, unique index).

### Học phí theo đăng ký (`tuition.lib.ts`)

| Việc | Cách làm |
|---|---|
| Hóa đơn tạm tính | `syncTermInvoice` lập hoặc tính lại cả hóa đơn theo tín chỉ đang đăng ký × đơn giá của ngành, năm học (`tuition_rates`), cộng khoản thu bắt buộc (`tuition_fees`, chỉ học kỳ 1). Hủy hết lớp: chưa nộp thì bỏ hóa đơn, đã nộp thì giữ để còn số cần hoàn. Ngành chưa có đơn giá thì chưa lập (lúc chốt sẽ báo) |
| Chốt | `finalizeTermTuition` (`tuition.manage`, toàn trường): tính lại mọi hóa đơn tạm tính, lập cho sinh viên chưa có, đặt hạn nộp chính thức, ghi `finalized_at`, báo sinh viên, ghi nhật ký. Còn ngành thiếu đơn giá thì không chốt |
| Sau chốt | Không tính lại các dòng đã chốt; đổi đăng ký thì thêm một dòng `adjustment` bằng phần chênh tín chỉ (`billedCredits`, `adjustmentLine`) theo **đơn giá đã chốt trên hóa đơn** (`finalizedPricePerCredit`: dòng học phí), không theo bảng đơn giá hiện hành; hóa đơn đã có đơn giá thì ngành mất đơn giá năm học vẫn điều chỉnh được |
| Miễn giảm, hoàn | Miễn giảm trừ vào tổng (bắt buộc lý do, check `tuition_invoices_discount_reason`). Nộp thừa (hủy lớp, giảm tín chỉ sau khi nộp) thì ghi nhận hoàn (`tuition_refunds`, không chuyển tiền tự động); trigger `tuition_refunds_within_overpaid` chặn hoàn vượt số nộp thừa, `payments_within_invoice_total` chặn nộp vượt số phải nộp (số đã nộp tính trừ phần đã hoàn) |
| Khóa đăng ký | Hóa đơn học kỳ hiện tại đã chốt, quá hạn, còn nợ thì chặn đăng ký (`tuitionBlockOf`), nộp đủ là hết chặn. Phòng Kế hoạch - Tài chính (`tuition.manage`) đặt, gỡ khóa loại học phí ở trang Khóa đăng ký (menu hiện cho `registration.manage` hoặc `tuition.manage`); khóa đặt tay tự gỡ khi hết nợ quá hạn (`releaseClearedTuitionHolds`) |

### Buổi học, ngày nghỉ (`schedule.lib.ts`)

Buổi học (`class_sessions`) sinh từ lịch tuần của lớp (lý thuyết cho cả lớp, thực hành theo nhóm) trong khoảng ngày học, bỏ ngày nghỉ lễ của lịch năm học (`holidaysBetween`). `syncClassSessions` chạy trong transaction của mọi thao tác sửa, hủy lớp: buổi đã qua, buổi đã điểm danh giữ nguyên; buổi tương lai không còn trong lịch thì bỏ, buổi mới thì thêm (`diffClassSessions`); lịch tuần thật sự đổi thì báo sinh viên và giảng viên. Buổi theo lịch rơi vào ngày nghỉ lễ hiện ở sổ điểm danh là "cần xếp dạy bù" (`holidaySessions`). Đổi ngày nghỉ ở lịch năm học không đi qua lớp học phần nên tác vụ `class-sessions` (`resyncOpenClassSessions`) sinh lại buổi học của mọi lớp đang mở.

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
| `enrollments_sync_counts` | Thêm, hủy, đổi nhóm đăng ký thì tự cộng trừ `enrolled_count` của lớp, nhóm thực hành và `taken_count` của chỗ dành riêng. Vượt sức chứa thì `CHECK` chặn và hủy cả giao dịch. Giữ chỗ: action đăng ký khóa dòng lớp bằng `SELECT ... FOR UPDATE` rồi mới ghi đăng ký, trigger cộng số đã đăng ký trong cùng giao dịch, nên hai người tranh chỗ cuối thì người sau chờ và thấy lớp đã đầy |
| `grade_components_weights_total_100`, `syllabus_assessments_weights_total_100` | Tổng trọng số phải bằng 100, kiểm tra lúc commit (`DEFERRABLE INITIALLY DEFERRED`) để sửa nhiều thành phần trong một giao dịch |
| `enrollments_guard` (`0004`) | Không đăng ký vào lớp đã hủy; lớp có nhóm thực hành thì phải chọn nhóm |
| `grade_scores_same_section`, `attendance_records_same_section` | Điểm và điểm danh chỉ ghi cho sinh viên của chính lớp đó |
| `survey_submissions_enrolled` | Chỉ sinh viên đang học lớp mới nộp khảo sát lớp đó |
| `reserved_seats_within_capacity` | Tổng chỗ dành riêng không vượt sĩ số, kể cả khi giảm sĩ số lớp (kiểm tra lúc commit) |
| `terms_no_overlap` (`EXCLUDE USING gist`) | Hai học kỳ không chồng khoảng ngày |
| `exam_proctor_swap_requests` (bảng) | Đề nghị đổi ca coi thi giữa hai giảng viên, chờ Phòng Khảo thí duyệt |
| `payments_within_invoice_total`, `tuition_refunds_within_overpaid` | Không nộp vượt số phải nộp, không hoàn vượt số nộp thừa (số đã nộp tính trừ phần đã hoàn) |
| `syllabus_assessments_weights_versioned` | Đề cương đã công bố: cách tính điểm (khóa, tên, trọng số theo thứ tự) chỉ đổi khi cùng giao dịch lưu bản cũ vào `syllabus_revisions` và tăng `syllabi.version` (như `writeSyllabus`). Lần đầu sửa, xóa dòng đánh giá trong giao dịch, trigger `syllabus_assessments_remember_grading` nhớ cách tính điểm lúc đó (biến cấu hình cục bộ của giao dịch); lúc commit (`DEFERRABLE INITIALLY DEFERRED`) so với cách tính điểm cuối cùng. `syllabi_published_final`: đề cương đã công bố không về nháp, phiên bản không giảm |

Trigger báo lỗi bằng `RAISE ... USING CONSTRAINT = '<tên>'` nên `pgErrorMessage()` tra được câu tiếng Việt như ràng buộc thường.

- **Kiểu dữ liệu khớp frontend:** `tests/schema-types.check.ts` so từng `pgEnum` với kiểu union tương ứng trong `*.type.ts` (38 cặp); lệch một giá trị là `tsc` báo lỗi.
- **Lưu ý drizzle-kit:** khi thêm khóa ngoại kép cùng ràng buộc unique mà nó trỏ tới, drizzle-kit có thể sinh câu `ADD FOREIGN KEY` trước `ADD UNIQUE`; kiểm migration bằng cách chạy trên DB trắng trước khi commit.

- **Ràng buộc đặt ở DB**, không chỉ ở code: sĩ số trong sức chứa, một đăng ký hiệu lực mỗi lớp và một lớp mỗi học phần trong học kỳ (unique index có điều kiện), nhóm thực hành thuộc đúng lớp và học kỳ, học phần trên đăng ký khớp lớp (khóa ngoại kép), tiết 1..12, thứ 2..8, điểm 0..10, một học kỳ hiện tại, một kế hoạch học tập hiệu lực mỗi SV, đơn từ có đúng một người gửi.
- **Khảo sát ẩn danh:** `survey_submissions` ghi ai đã nộp (để nhắc), `survey_responses` + `survey_answers` giữ câu trả lời không có khóa tới sinh viên; ngày nộp chỉ lưu ngày, không lưu giờ.
- **Cấu hình quy chế** lưu `jsonb` có phiên bản (`regulations.rules`), validate bằng zod khi ghi (`REGULATION_RULES_SCHEMA`).

### Quy chế đào tạo (nguồn duy nhất)

Mỗi lần lưu ở trang Quy chế tạo một phiên bản có ngày áp dụng (không trước hôm nay). Bản áp dụng tại một ngày là bản có `effective_from` gần nhất không sau ngày đó, theo ngày của trường (giờ Việt Nam, `schoolToday()`); chưa tới bản nào thì lấy bản sớm nhất. Mọi nơi đọc qua `getRegulation()` / `regulationAt()`; không có ngưỡng nào hard-code.

| Nhóm | Tham số | Dùng ở |
|---|---|---|
| `grading` | `scale` (điểm chữ, ngưỡng thang 10, điểm thang 4; mức cuối là F từ 0), `roundingStep` (0,1 / 0,5 / 1), `standing` (ngưỡng CPA Xuất sắc, Giỏi, Khá, Trung bình, Yếu) | Tổng điểm và điểm chữ trên bảng nhập điểm, duyệt điểm, Excel (công thức `ROUND` theo bước), PDF; công bố điểm lưu `letter`/`point4` theo bản áp dụng ngày công bố (đổi quy chế sau không đổi điểm đã công bố); xếp loại học lực; hạng tốt nghiệp (từ mức Trung bình mới tốt nghiệp) |
| `credits` | `minPerTerm`, `maxPerTerm`, `maxSummer`, `maxWhenWarned`, `overloadMinCpa` | Hạn mức kế hoạch học tập (học kỳ hè tối đa `maxSummer`, không bắt tối thiểu; đang bị cảnh báo chính thức thì `maxWhenWarned`), màn duyệt của cố vấn, đăng ký học phần (`creditCapOf`), đơn học vượt |
| `warning` | `level1TermGpa`, `level1FailedCredits`, `level2Cpa`, `level2FailedCredits`, `level3Cpa`, `expelAfterWarnings` | Sinh cảnh báo sau học kỳ chính (lý do ghi theo ngưỡng của bản đã dùng); danh sách đề xuất xét buộc thôi học (cảnh báo đủ số học kỳ chính liên tiếp hoặc mức 3; quyết định lập ở module users) |
| `attendance` | `absenceLimitPercent` | Điểm danh, điều kiện dự thi |
| `workflow` | `gradeEntryDays` (hạn nhập điểm tính từ ngày thi cuối kỳ của lớp, chưa có lịch thi thì từ ngày kết thúc học kỳ), `gradeDueSoonDays` (nhãn "Sắp hết hạn"), `studyPlanReviewDays` (kế hoạch chờ duyệt quá hạn), `regradeWindowDays`, `registrationClosingSoonHours` | Bảng điểm, kế hoạch học tập, phúc khảo, đợt đăng ký |
| `graduation` | `retakeLimitPercent`, `downgradeDisciplineLevel`, `downgradeStandings`, `languageMinLevel` (bậc CEFR), `requireItCertificate` | Xét tốt nghiệp: giảm một hạng khi khối lượng học lại (tổng tín chỉ các lần F) vượt tỉ lệ trên tổng tín chỉ chương trình hoặc bị kỷ luật từ mức đã chọn, chỉ với các hạng đã chọn |

**Điểm theo lần học cuối:** CPA, tín chỉ tích lũy (mỗi học phần một lần, lần cuối đạt), tín chỉ nợ (lần cuối F), xếp loại, cảnh báo, xét tốt nghiệp, tiên quyết ("đã học đạt"), báo cáo, PDF/Excel đều lấy lần học cuối có điểm của mỗi học phần (`buildTranscript` đánh dấu `replaced`, `latestGrades`, `cumulativeResults` trong SQL). GPA học kỳ vẫn tính mọi học phần học trong kỳ. Chưa có điểm thì "Chưa xếp loại", không vào thống kê xếp loại.

**Cảnh báo chính thức:** cảnh báo đã gửi thông báo (hoặc đã gặp sinh viên) của học kỳ gần nhất có cảnh báo đã ban hành (`currentWarnings`). Hạn mức tín chỉ và mọi chỗ "đang bị cảnh báo" dùng nguồn này; `StudentStanding.warningLevel` chỉ là mức dự báo theo điểm hiện có.

**Xét tốt nghiệp:** đợt xét đang mở (`graduation_rounds`, mỗi lúc một đợt, Phòng Đào tạo cấu hình tên đợt và các khóa); chương trình của sinh viên chọn theo ngành + `program_cohorts`, chỉ chương trình đang áp dụng (trigger `programs_single_active_cohort`: mỗi ngành, khóa một chương trình; `programs_archived_final`: ngừng áp dụng không mở lại); tín chỉ yêu cầu là tổng tín chỉ chương trình, học phần bắt buộc của khung phải học đạt (kể cả qua học phần tương đương); học phí suy ra từ hóa đơn còn nợ; kỷ luật từ quyết định `discipline` đã ký (đình chỉ trở lên chặn tốt nghiệp, mức thấp hơn chỉ xét giảm hạng); chứng chỉ ngoại ngữ (kèm bậc) và tin học do Phòng Đào tạo xác nhận vào `graduation_records`.

Chạy cục bộ:

```bash
cp .env.example .env              # sửa DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL nếu cần
npm run db:migrate                # tạo bảng trên DB trắng
npm run db:seed                   # dữ liệu mẫu + 3 tài khoản (mật khẩu mặc định Hcmue@2026)
npm run test:db                   # test trên DB thật: ràng buộc, quy tắc nghiệp vụ, action gọi trong kho request của Next
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
| Tài khoản seed | Sinh viên `50.01.104.009`, giảng viên `GV104011` (ThS. Phạm Thùy Hạnh, kiêm cố vấn, email `hanhpt@hcmue.edu.vn`), Phòng Đào tạo `CB0021` (Trần Minh Khoa, email `khoatm@hcmue.edu.vn`, hai vai trò Trưởng phòng Đào tạo và Quản trị hệ thống), Phòng Kế hoạch - Tài chính `CB0034` (Nguyễn Thị Thu Hà, chỉ vai trò `finance-office`: Học phí, Khóa đăng ký loại học phí), mật khẩu `Hcmue@2026`. Đây chính là sinh viên và giảng viên "hiện tại" của dữ liệu mẫu (`CURRENT_STUDENT_ID`, `CURRENT_LECTURER_ID`) |

Phân quyền cổng quản trị đọc từ DB: `getViewer()` lấy các vai trò trong `role_assignments` của tài khoản đang đăng nhập; có nhiều vai trò thì đổi qua menu tài khoản (`switchActiveRole`, chỉ trong số vai trò của chính mình). Vai trò có sẵn mang `roles.key` cố định (`faculty-secretary`…) để code nhận ra, không so theo `id`.

### Lưu tệp tải lên

| Việc | Cách làm |
|---|---|
| Kho tệp | `shared/libs/storage.lib.ts` (server-only): `putFile`, `openFile` (luồng + kích thước), `readFile`, `deleteFile`, `deleteFiles`, `listFiles`, `withStoredFiles`, `sweepOrphanFiles`. Nơi gọi chỉ biết khóa. `DEFEAT_STORAGE_DRIVER=local` (mặc định) ghi đĩa dưới `DEFEAT_STORAGE_DIRECTORY` (mặc định `./storage`, đã gitignore); `=s3` ghi vào bucket S3-compatible (AWS S3, Cloudflare R2, MinIO), khóa đối tượng trùng khóa lưu trữ, cấu hình `DEFEAT_S3_*` (env.lib bắt buộc đủ khi chọn s3) |
| Client S3 | `shared/libs/s3.lib.ts`: PutObject, GetObject (trả luồng, hết giờ chỉ tính tới lúc có header), DeleteObject, ListObjectsV2 (đi hết trang bằng continuation-token), ký AWS SigV4 bằng `node:crypto`. Không dùng `@aws-sdk/client-s3` (chỉ cần 4 lệnh, SDK kéo vài chục gói). Kiểm bằng 3 chữ ký mẫu của tài liệu AWS và S3 giả lập tự kiểm chữ ký trong `tests/storage-s3.test.ts`. Path-style (`DEFEAT_S3_FORCE_PATH_STYLE=true`) cho MinIO; virtual-hosted cho AWS, R2 |
| Quét virus | `shared/libs/virus-scan.lib.ts`: clamd qua TCP (`DEFEAT_CLAMAV_HOST`, `DEFEAT_CLAMAV_PORT`, lệnh `zINSTREAM`, khúc 64 KB). `withStoredFiles` quét mọi tệp trước khi ghi kho; có mã độc hoặc clamd không trả lời (đã cấu hình) thì ném `UploadRejectedError`, `actionFailure` trả nguyên câu báo tiếng Việt, không tệp nào được ghi. Bỏ trống host thì không quét (máy phát triển); production nên bật. `putFile` không quét (dùng cho seed) |
| Khóa | Luôn do server sinh: `requests/<uuid v7>` (minh chứng đơn từ), `exams/<uuid v7>` (đề thi, đáp án), `reports/<uuid v7>` (tệp báo cáo đã xuất) (`newStorageKey`; regex khóa trong `storage.lib.ts` chỉ nhận ba thư mục này). Tên tệp người dùng chỉ lưu ở cột `file_name` để hiện và đặt tên khi tải; khóa sai mẫu (`../x`, đường dẫn tuyệt đối) bị từ chối |
| Kiểm tệp | `shared/libs/upload.lib.ts` (hàm thuần, dùng cả client lẫn server): đuôi thuộc danh sách cho phép **và** chữ ký đầu tệp khớp (PDF `%PDF-`, PNG, JPG, docx là zip), kích thước. Kiểu tệp lưu xuống lấy theo danh sách, không theo kiểu trình duyệt gửi. Minh chứng đơn từ: PDF, ảnh, docx, 10 MB/tệp, 25 MB/đơn, 5 tệp (DB chặn 10 MB). Đề thi, đáp án: PDF, 20 MB/tệp (DB chặn 20 MB) |
| Tải lên | Server action nhận `FormData` (dữ liệu form là JSON ở ô `input`, tệp ở ô riêng). `serverActions.bodySizeLimit` và `proxyClientMaxBodySize` đặt 41 MB trong `next.config.ts` (proxy đệm thân request của trang cổng, quá giới hạn thì thân bị cắt im lặng) |
| Duyệt đề | Phòng Khảo thí (`exams.manage`, đúng phạm vi khoa) **Duyệt** (`approved`, khóa đề) hoặc **Trả lại** kèm lý do (`returned`, giảng viên thấy lý do và nộp lại, nộp lại thì về `submitted`). Cột `paper_reviewed_by_user_id`, `paper_reviewed_at`, `paper_return_reason`; check `exam_sessions_paper_review_fields`, `exam_sessions_paper_return_reason` (so `paper_status::text` vì giá trị enum mới chưa dùng được trong cùng giao dịch migration); trigger `exam_sessions_paper_locked` chặn đổi tệp, trạng thái đề đã duyệt. Logic trong `exams.lib.ts` (`recordPaperSubmission`, `decidePaperReview`: ghi nhật ký, báo giảng viên) để test được không cần request |
| Giao dịch | `withStoredFiles(files, work)`: quét virus, ghi tệp trước, chạy giao dịch; giao dịch hỏng thì xóa tệp vừa ghi. Nộp lại đề thì xóa tệp cũ sau commit. Tiến trình chết giữa chừng hoặc xóa không được thì tác vụ `POST /api/cron/orphan-files` xóa tệp không còn dòng DB nào trỏ tới (chỉ tệp cũ hơn 1 giờ) |
| Tải xuống | Route handler `/api/files/requests/[attachmentId]` (cùng hàm quyền xem đơn với danh sách, chi tiết: người gửi, giảng viên có bước cố vấn, giảng viên đang giao cho mình, cán bộ có quyền bước `requests.step.*` trong phạm vi khoa, Phòng Đào tạo có `requests.supervise`, người đã xử lý một bước của đơn) và `/api/files/exams/[sessionId]/[paper|answer-key]` (giảng viên dạy lớp, cán bộ có `exams.manage` trong phạm vi khoa). Không quyền trả 404. Nội dung đi thành luồng từ `openFile` (cả với S3: app đọc bucket rồi chuyển cho trình duyệt, không lộ URL hay URL ký sẵn của bucket). Header: `Content-Disposition` RFC 6266/5987 giữ tên tiếng Việt, `Content-Type` đã lưu, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` |
| Seed | Mỗi minh chứng, đề mẫu có một tệp PDF nhỏ "Tệp mẫu" (`scripts/seed/sample-file.ts`), khóa tất định theo id mock; seed xóa tệp cũ trong kho vì DB vừa bị xóa sạch |

### Đơn từ

| Việc | Cách làm |
|---|---|
| Quy trình | Mỗi loại đơn khai báo chuỗi bước (`REQUEST_KINDS`: vai trò bước, nhãn, số ngày làm việc). `initialSteps`, `planDecision` (rule) tính bước đến lượt và hạn: cộng ngày làm việc, bỏ thứ 7, chủ nhật và ngày nghỉ lễ (mốc "Nghỉ lễ" của lịch năm học). `requestView()` suy ra trạng thái (chờ tiếp nhận, đang xử lý, cần bổ sung, đã duyệt, từ chối, đã hủy) |
| Ai xử lý bước nào | Bước cố vấn, giảng viên: người chịu trách nhiệm tính lúc đọc (`effectiveAssignee`): bước đã xử lý hoặc đã được chuyển giữ người đã lưu; còn lại đi theo cố vấn hiện tại của lớp sinh hoạt, giảng viên hiện tại của lớp học phần (`academic_requests.class_section_id`), nên đổi cố vấn, đổi giảng viên lớp thì bước đang chờ tự sang người mới. Bước của khoa, Phòng Đào tạo, Phòng Khảo thí: theo quyền `requests.step.faculty`, `requests.step.academic-office`, `requests.step.exam-office` của vai trò đang dùng (cùng `requests.process`), trong phạm vi khoa của vai trò; không theo khóa vai trò, vai trò tự tạo được cấp quyền bước thì xử lý được |
| Một hàm quyền | `requestRows` + `visibleTo` (`requests.lib.ts`) dùng cho danh sách ở 3 cổng, chi tiết, tải minh chứng: người gửi; giảng viên có bước giao cho mình; cán bộ có quyền bước và đơn có bước đó trong phạm vi khoa; `requests.supervise` thấy mọi đơn trong phạm vi; ai đã xử lý một bước vẫn xem lại được. Cờ `request.can` (xử lý, yêu cầu bổ sung, xử lý thay, chuyển người, hủy, bổ sung, gửi lại) tính bằng cùng `stepDeniedReason`, `superviseDeniedReason` với action |
| Bước kẹt | Phòng Đào tạo (`requests.supervise`) chuyển bước cố vấn, giảng viên chưa xử lý cho giảng viên khác (`reassigned_at`, người chuyển, lý do) hoặc xử lý thay bất kỳ bước đang chờ: đồng ý, không đồng ý, bỏ qua (`skipped`), luôn ghi lý do (`on_behalf`). Khóa ngoại `request_steps.assignee_lecturer_id` giữ `ON DELETE restrict`: bước đã xử lý là dấu vết; muốn xóa giảng viên thì chuyển các bước đang chờ trước |
| Thông báo | Gửi đơn, chuyển bước, bổ sung: báo người có bước kế tiếp (giảng viên qua `notifyLecturers`, cán bộ có quyền bước trong phạm vi khoa qua `notifyUsers(..., "administrator", ...)`, đường dẫn `?open=<id>` mở sẵn đơn) và báo người gửi. Tác vụ `request-sla` nhắc bước còn dưới 24 giờ và bước quá hạn, mỗi loại một lần cho mỗi lượt (`due_soon_notified_at`, `overdue_notified_at`) |
| Bổ sung, gửi lại | Người xử lý yêu cầu bổ sung (`request_supplements`, mỗi đơn tối đa một yêu cầu mở): đơn "cần bổ sung", bước dừng tính hạn; người gửi thêm tệp, ghi chú thì bước tính hạn lại từ lúc bổ sung. Đơn bị từ chối gửi lại được một lần (`resubmitted_from_id` unique): đơn mới cùng loại, nội dung, lớp, chép minh chứng đã chọn sang khóa mới, kiểm lại điều kiện |
| Điều kiện gửi | Kiểm ở server theo quy chế đang áp dụng: phúc khảo khi bảng điểm lớp đã công bố và trong `workflow.regradeWindowDays` ngày; sửa điểm khi bảng điểm đã chốt, duyệt hoặc công bố; học vượt khi CPA từ `credits.overloadMinCpa`, số tín chỉ trên `credits.maxPerTerm` (tối đa thêm `OVERLOAD_EXTRA_CREDITS`); hoãn thi, bảo lưu, công nhận điểm, sửa điểm bắt buộc có minh chứng. Cột điểm cuối kỳ cho đơn phúc khảo tìm theo khóa `final` hoặc nhãn "cuối kỳ" (`pickFinalComponent`), không phân định được thì ghi "không xác định" |
| Kết quả đơn | `onRequestApproved(kind, request, tx)` chạy khi đơn duyệt xong bước cuối, trong cùng transaction (`REQUEST_APPROVED_HANDLERS`, hiện chưa có handler: kết quả đơn chưa tự đổi điểm, hạn mức, W, quyết định) |
| Nhật ký | Gửi, đồng ý, từ chối, xử lý thay, chuyển người, yêu cầu bổ sung, bổ sung, hủy đơn đều ghi `recordAudit` (đối tượng `request`) |

### Lịch thi (`exams.lib.ts`)

| Việc | Cách làm |
|---|---|
| Nhiều phòng | Một ca thi chia nhiều phòng (`exam_session_rooms`, theo sức chứa thi `rooms.exam_capacity`); mỗi phòng ít nhất 2 cán bộ coi thi (`exam_proctors`, khóa ngoại kép để phòng thuộc đúng ca), một cán bộ chỉ coi một phòng của ca |
| Thí sinh, số báo danh | `exam_candidates`: ca giữa kỳ, cuối kỳ là sinh viên đang học lớp trừ người được hoãn kỳ thi đó (`exam_deferrals`); ca thi bù là danh sách chọn từ ca gốc. `syncCandidates` xếp thí sinh theo tên lần lượt vào các phòng (`assignCandidates`), số báo danh liên tục từ 1 (unique theo ca); thiếu chỗ thì không lưu. Công bố (`publishDrafts`) xếp lại theo danh sách lớp mới nhất rồi báo sinh viên kèm phòng và số báo danh |
| Xung đột | `assertNoConflicts` so với cả học kỳ (`termSchedule`, theo khoảng giờ chồng nhau, không chỉ cùng giờ bắt đầu): trùng phòng, trùng cán bộ coi thi chặn hẳn; trùng lịch thi của sinh viên (`sharedCandidateCounts`) và cán bộ coi thi trùng giờ dạy (`teachingClashes`) là cảnh báo mềm, lưu được khi ghi lý do (vào nhật ký). Mọi thao tác ghi lịch thi của một học kỳ chạy nối tiếp nhờ `pg_advisory_xact_lock('exam-term:<học kỳ>')` (`lockExamTerm`) |
| Sinh hàng loạt | `generateFinals`: ca cuối kỳ dự kiến cho lớp mở chưa có ca, lớp đông xếp trước vào giờ thi sớm nhất đủ phòng, đủ cán bộ cùng khoa không dạy lớp đó, không trùng lịch thi của sinh viên; hình thức thi theo bài cuối kỳ trong đề cương đã công bố của lớp (`finalExamFormatOf`), không có thì theo hình thức mặc định người dùng chọn |
| Đề thi | Giảng viên nộp đề; Phòng Khảo thí (quyền `exams.review`, tách khỏi `exams.manage` là quyền xếp lịch) duyệt, trả lại, mở khóa đề đã duyệt; trigger `exam_sessions_paper_locked`, `exam_sessions_paper_after_start` (tới giờ thi không nộp, thay đề được) |
| Đổi ca coi thi | `exam_proctor_swap_requests`: Phòng Khảo thí chấp nhận (người thay vào đúng phòng của người gửi) hoặc từ chối; trigger `exam_proctor_swap_requests_proctor` (lúc gửi phải đang coi ca đó) |
| Trạng thái | Ca đã công bố mà quá giờ kết thúc chuyển "Đã thi" bằng tác vụ `exam-sessions` (`refreshExamStatuses`); các chốt chặn tự kiểm theo giờ thi nên tác vụ chạy chậm không mở lỗ hổng |

### Khảo sát giảng dạy, cố vấn

- **Niêm phong phiếu:** `survey_submissions` ghi ai đã nộp lớp nào (để nhắc, chặn nộp lại); phiếu (`survey_responses`, id `gen_random_uuid()` không mang thời điểm) và câu trả lời không trỏ tới sinh viên. Đợt đóng thì `sealSurvey` chép mọi phiếu sang id mới theo thứ tự ngẫu nhiên rồi xóa bản cũ (ghi `sealed_at`) để phiếu không ghép được với thứ tự nộp; tác vụ `surveys` (`sealClosedSurveys`) làm việc này. Giảng viên chỉ xem kết quả đợt đã đóng **và** đã niêm phong, chỉ lớp có từ `MIN_RESPONSES_FOR_LECTURER` (5) phiếu; chọn được mọi đợt như vậy có lớp mình dạy trong học kỳ của đợt (`sealedSurveyIdsForLecturer`, `?survey=` trên trang Khối lượng giảng dạy, mặc định đợt mới nhất). Phòng Đào tạo, khoa xem kết quả (`surveys.view`); tạo, mở, đóng đợt, nhắc sinh viên chưa làm cần `surveys.manage`; trigger `survey_questions_locked` (câu hỏi đã có câu trả lời không sửa, xóa được; đợt đã có phiếu không thêm câu hỏi).
- **Cố vấn** (`advising.lib.ts`): buổi hẹn nhóm ghi có mặt, vắng theo từng sinh viên (ghi chú chỉ vào hồ sơ người có mặt, chỉ sau giờ hẹn); dời, hủy buổi hẹn có báo sinh viên; server chặn hai buổi "đã hẹn" chồng giờ của cùng cố vấn (khóa theo cố vấn); ghi chú cố vấn độc lập trong hồ sơ sinh viên.

### Quyết định sinh viên

Quyết định đã ký có ngày hiệu lực về sau: tới ngày thì tác vụ `decision-effects` (`runDecisionEffectsJob`, `users.decision.ts`) áp dụng tác dụng (đổi tình trạng, lớp của sinh viên), mỗi quyết định một transaction, đánh dấu `applied_at` nên chạy lại không áp dụng hai lần; điều kiện không còn đúng (tình trạng đã đổi) thì bỏ qua để người ký xem và thu hồi.

### Báo cáo

Xuất báo cáo (`requestReportExport`): đọc bảng dữ liệu, dựng tệp đúng định dạng một lần (`buildReportFile`: Excel, PDF, CSV có BOM), lưu vào kho (`reports/<uuid>`), ghi lịch sử với số dòng, tên tệp, kiểu, kích thước của chính tệp đó; tải về (`downloadReportExport`) đọc lại đúng tệp đã lưu. Quyền: `reports.view` và quyền riêng của báo cáo (khảo sát `surveys.view`, xét tốt nghiệp `graduation.manage`); cán bộ theo khoa chỉ xuất, tải báo cáo khoa mình. Mỗi báo cáo ghi rõ lọc theo khoa của sinh viên hay khoa quản lý học phần; báo cáo số liệu hiện tại (thống kê sinh viên, xét tốt nghiệp) không theo học kỳ, tên tệp ghi ngày xuất. Xuất, tải đều ghi nhật ký (`export`, `download`). Lịch sử giữ 30 ngày (tác vụ `report-exports`).

### Nhật ký thao tác

Trang `/administrator/settings/audit-log` (`audit.view`) lọc ở DB theo thời gian (ngày giờ Việt Nam), người thực hiện (tên lưu lúc ghi), thao tác, loại đối tượng, một đối tượng, nội dung; phân trang 50 dòng. Lịch sử của một đối tượng (hồ sơ sinh viên) cần quyền xem đối tượng đó trong phạm vi khoa; lịch sử của chính mình ai cũng xem được. Tác vụ `audit-cleanup` xóa bản ghi cũ hơn `DEFEAT_AUDIT_RETENTION_DAYS` (mặc định 1095 ngày).

### Tác vụ định kỳ

Bảng dưới khớp đúng map `JOBS` trong `src/app/api/cron/[job]/route.ts` (15 tác vụ). Route `/api/cron/<tác vụ>` nhận GET (Vercel Cron) và POST, header `Authorization: Bearer <khóa>` với khóa là `DEFEAT_CRON_SECRET` hoặc `CRON_SECRET` (từ 32 ký tự; chưa đặt khóa nào thì mọi lời gọi 401). Tác vụ lỗi trả 500 với tên tác vụ, chi tiết chỉ ghi log máy chủ. Mọi tác vụ chạy lặp lại không sinh trùng.

| Tác vụ | Việc | Tần suất đề nghị |
|---|---|---|
| `mail-outbox` | Gửi thư đến hạn, gửi lại thư lỗi, xóa thư đã gửi quá 30 ngày | 1 đến 5 phút |
| `class-announcements` | Báo sinh viên thông báo lớp hẹn giờ đã tới giờ | 5 phút |
| `announcement-notifications` | Gửi thông báo cá nhân, email của thông báo chung hẹn giờ đã tới giờ | 5 phút |
| `request-sla` | Nhắc bước đơn sắp hết hạn, quá hạn | Mỗi giờ |
| `exam-sessions` | Ca thi đã công bố mà đã thi xong chuyển "Đã thi" | 15 phút |
| `surveys` | Niêm phong (xáo) phiếu các đợt khảo sát vừa đóng; giảng viên xem kết quả từ lúc này | Mỗi giờ |
| `waitlist-expiry` | Lượt chờ của khóa đã hết mọi đợt đăng ký trong học kỳ chuyển "hết hạn", báo sinh viên | Mỗi giờ |
| `academic-warnings` | Sinh cảnh báo học vụ học kỳ chính vừa kết thúc | Mỗi ngày |
| `decision-effects` | Quyết định đã ký tới ngày hiệu lực thì đổi tình trạng, lớp của sinh viên | Mỗi ngày, sau 0 giờ |
| `class-sessions` | Sinh lại buổi học của các lớp đang mở theo ngày nghỉ lễ mới nhất của lịch năm học | Mỗi ngày |
| `sign-in-failures` | Dọn bộ đếm đăng nhập sai đã hết hạn | Mỗi ngày |
| `orphan-files` | Xóa tệp minh chứng, đề thi không còn dòng DB trỏ tới | Mỗi ngày |
| `notifications-cleanup` | Xóa thông báo đã đọc quá 180 ngày, chưa đọc quá 365 ngày | Mỗi ngày |
| `report-exports` | Xóa lịch sử xuất báo cáo quá 30 ngày và tệp, tệp báo cáo mồ côi | Mỗi ngày |
| `audit-cleanup` | Xóa nhật ký cũ hơn số ngày giữ | Mỗi tuần |

Crontab trên máy chủ (giờ Việt Nam):

```cron
*/5 * * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/mail-outbox
*/5 * * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/class-announcements
*/5 * * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/announcement-notifications
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/exam-sessions
7 * * * *    curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/request-sla
12 * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/surveys
17 * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/waitlist-expiry
10 0 * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/decision-effects
20 1 * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/academic-warnings
45 1 * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/class-sessions
30 2 * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/sign-in-failures
40 2 * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/orphan-files
50 2 * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/notifications-cleanup
55 2 * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/report-exports
15 3 * * 0   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example/api/cron/audit-cleanup
```

Trên Vercel: `vercel.json` ở gốc repo khai báo cùng lịch (giờ UTC); Vercel Cron gọi GET và tự gửi `Authorization: Bearer <CRON_SECRET>` nên đặt biến `CRON_SECRET` trong dự án. Gói Hobby chỉ chạy mỗi ngày một lần: tác vụ 5 phút, mỗi giờ cần gói Pro hoặc bộ hẹn giờ ngoài.

### Hàng đợi thư

| Việc | Cách làm |
|---|---|
| Module | `mail` (không đặt trong `notifications`: thông báo trên cổng và thư là hai kênh khác nhau, hàng đợi chỉ lo gửi thư): bảng `mail_outbox` (người nhận, tiêu đề, nội dung chữ + HTML tùy chọn, loại `account-activation` / `registration-reminder` / `class-announcement` / `announcement`, trạng thái `pending` / `sending` / `sent` / `failed`, số lần thử, lỗi cuối, `next_attempt_at`, id thư Resend) |
| Ghi | `enqueueMail(tx, ...)` trong transaction của thao tác: rollback thì không có thư, commit thì thư chắc chắn được gửi. Thư kích hoạt tài khoản, nhắc đăng ký học phần, email thông báo lớp, email thông báo chung đi qua hàng đợi. Riêng mã OTP của better-auth gửi thẳng `sendMail` qua Resend (không lưu mã vào DB); gửi lỗi thì ghi log `[auth] Không gửi được thư mã ...` (không kèm mã, không kèm tiêu đề thư) |
| Gửi | `deliverDueMail()` lấy thư đến hạn bằng một câu `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`, đổi sang `sending`, tăng số lần thử và giữ chỗ 10 phút (`next_attempt_at`): hai lần chạy song song không gửi trùng; tiến trình chết giữa lúc gửi thì hết hạn giữ chỗ là được lấy lại. Lỗi thì lùi lịch 1, 5, 30 phút, 2 giờ, 8 giờ; lỗi lần thứ 6 thì `failed` |
| Kích gửi | Action gọi `deliverMailSoon(ids)` sau commit (thư đi ngay khi mọi thứ bình thường); tác vụ `POST /api/cron/mail-outbox` (mỗi 1–5 phút) gửi phần còn lại, gửi lại thư lỗi và xóa thư đã gửi quá 30 ngày |
| Chưa có khóa Resend | `sendMail` in thư ra log và coi như gửi được, thư thành `sent` |
| Xem | `/administrator/settings/mail` (quyền `settings.manage`, phạm vi toàn trường): số thư chờ, đã gửi, lỗi; thư lỗi gần đây (người nhận, tiêu đề, lỗi, số lần thử, không hiện nội dung) và nút "Gửi lại" (đặt lại `pending`, đếm lại số lần thử) |

### Kiểm thử end-to-end (Playwright)

> **CẢNH BÁO:** `npm run test:e2e` **xóa sạch và seed lại** database mà `DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL` đang trỏ tới (`e2e/global-setup.ts` chạy `npm run db:seed` rồi cấp thêm 2 tài khoản riêng cho e2e). Chỉ chạy trên database phát triển/kiểm thử.

```bash
npm run test:e2e                                  # next build + next start (mặc định, như khi triển khai)
E2E_SERVER=dev npm run test:e2e                   # next dev; dùng lại server đang chạy ở cổng của BASE_URL nếu có
E2E_SERVER=dev E2E_SERVER_LOG=dev.log npm run test:e2e   # server tự bật bằng tay: chỉ log của nó để đọc mã OTP
npx playwright test e2e/student.spec.ts           # một file
```

| Việc | Cách làm |
|---|---|
| Cấu trúc | `playwright.config.ts`, `e2e/*.spec.ts` (auth, access, pages, student, lecturer, admin), `e2e/support/` (fixture, tài khoản, cấp tài khoản e2e) |
| Phiên đăng nhập | `e2e/auth.setup.ts` đăng nhập 3 tài khoản seed một lần, lưu `storageState` vào `e2e/.auth/` (thêm phiên admin đã đổi sang Quản trị hệ thống). Test tự đăng nhập dùng IP giả riêng trong `x-forwarded-for` để không chạm giới hạn 5 lần/phút |
| Lỗi console | Fixture tự đánh trượt test có `console.error`/`pageerror`; test cố ý gây 401/403/404 khai báo `allowedConsoleErrors` |
| Trang vừa tải | Bấm trước khi React hydrate thì không có tác dụng (nút submit còn gửi form kiểu HTML thuần): `waitForHydration(locator)` trước thao tác ghi chỉ làm một lần, thao tác mở (drawer, menu, tích dòng) thì bọc trong `expect(...).toPass()`. Select của antd là danh sách ảo: dùng `chooseOption` (lọc bằng `search` hoặc tự cuộn). `browser.newContext()` trong test nhận cả storageState của `test.use`: trang chưa đăng nhập dùng `openAnonymous` |
| Múi giờ | Server chạy `TZ=Asia/Ho_Chi_Minh`, trình duyệt cũng vậy: giờ được định dạng theo múi giờ tiến trình, lệch là hydration mismatch |
| Thư | e2e không gửi thư thật: `next dev` bỏ trống khóa Resend (thư in ra log), `next start` dùng khóa giả (Resend từ chối, log không có mã OTP). Log server ở `e2e/.output/server.log`. Test kích hoạt tài khoản đọc mã OTP từ log, không có thì thay mã better-auth vừa lưu trong DB bằng mã tự chọn (`e2e/support/otp.ts`) |
| Kết quả | `e2e/.output/` (báo cáo HTML, trace khi lỗi), đã gitignore |

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
| `jsx-a11y/no-autofocus` | toàn repo | Trang đăng nhập cố ý đặt con trỏ vào ô tên đăng nhập |
| `react/no-unstable-nested-components` | cho phép trong props | `optionRender`, `expandedRowRender` của antd là hàm render, không phải component lồng |
| `import/no-unassigned-import` | cho phép CSS, `server-only`, `dayjs/locale/*` | Import để lấy tác dụng phụ |
