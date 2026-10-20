# Kế hoạch triển khai HCMUE Portal

Dựa trên [ARCHITECTURE.md](ARCHITECTURE.md), [README.md](../README.md) (phân hệ + bộ nhận diện thương hiệu). Frontend thiết kế theo quy trình của skill `evon:ui-ux`: **brief → wireframe → chọn → dựng**, không dựng thẳng.

Mỗi dòng ghi nguồn: *đọc code*, *người dùng nói*, *đoán* (cần xác nhận).

---

## 0. Hiện trạng (audit)

| Hạng mục | Thấy gì | Xử lý |
|---|---|---|
| Stack | Next 16.4 (`cacheComponents` tắt, xem ARCHITECTURE.md), React 19.3, antd 6, Tailwind 4, motion | Giữ |
| Thư viện component | **antd** | Mọi nút, ô nhập, bảng, modal dùng antd; chỉ chỉnh token, không viết lại component |
| Icon | 3 bộ cùng lúc: `@ant-design/icons`, `defeat-icons-react` (3.424 icon, 18px duo-fill) | **Code app chỉ dùng `defeat-icons-react`**. `@ant-design/icons` chỉ là dependency nội bộ của antd |
| Font | Geist qua `next/font`, nhưng chỉ nạp subset `latin` → **chữ có dấu tiếng Việt rơi về font khác**; `body` còn đè `Arial` | Thêm subset `vietnamese`, xoá dòng `font-family: Arial` |
| Token màu | Chỉ có `--background`/`--foreground` mặc định của create-next-app | Dựng bộ token từ bộ nhận diện (mục 2.2) |
| Dark mode | Có khối `prefers-color-scheme: dark` nhưng không có thiết kế tối | **Bỏ**, chỉ làm giao diện sáng |
| Phong cách | Chưa có UI nào (0 file glass/gradient/bóng) | **Flat**, hướng A "đường tóc phẳng" |
| `zsa` / `zsa-react` | Yêu cầu `zod@^3`, project dùng `zod@4` (bị `legacy-peer-deps` che) | **Gỡ**, dùng server action thuần + `schema.safeParse()` |
| `@tanstack/react-table` | Trùng chức năng với antd `<Table>` | **Gỡ**, dùng antd Table |
| `@tanstack/react-query` | Server component + server action đã lo đọc/ghi | Chưa dùng. Chỉ thêm khi cần polling phía client (ví dụ số chỗ còn lại lúc đăng ký) |
| `@dnd-kit/*` | Chỉ cần nếu có kéo thả (sắp xếp kế hoạch học tập theo kỳ) | Giữ, dùng ở giai đoạn 9 |
| `dayjs` | Có sẵn (antd kéo theo) | Dùng cho ngày giờ, locale `vi` |

---

## 1. Brief (evon `U1`)

| | | Nguồn |
|---|---|---|
| **Sản phẩm** | Cổng đào tạo và học vụ của Trường ĐH Sư phạm TP.HCM | đọc README |
| **Cho ai** | Sinh viên; giảng viên (kiêm cố vấn học tập); Phòng Đào tạo; khách xem thông báo | đọc README, người dùng nói |
| **Việc chính** | 1. SV đăng ký học phần đúng đợt, không trùng lịch, đủ điều kiện. 2. GV điểm danh, nhập điểm. 3. Phòng Đào tạo mở lớp, cấu hình đợt đăng ký | đọc README |
| **Nền tảng** | SV: **điện thoại là chính**. GV, Phòng Đào tạo: máy tính | đoán |
| **Điểm khác biệt** | Kiểm tra môn tiên quyết, giới hạn tín chỉ, trùng lịch **ngay lúc chọn lớp**, trước khi bấm đăng ký; xuất TKB `.ics` | đọc README |

---

## 2. Thiết kế (evon)

> **Ghi chú bắt buộc:** **KHÔNG có chế độ chuyển sáng/tối**, chỉ giao diện sáng. **Toàn bộ UI tận dụng Tailwind + component antd**: control dùng antd, bố cục và phần còn lại dùng class Tailwind, không viết CSS riêng. **Toàn bộ UI chống AI slop theo [UI-RULES.md](UI-RULES.md)**: mọi giai đoạn có UI đều chạy mục 5 của file đó trước khi báo xong.

### 2.1 Việc chính của từng màn (evon `U2`)

| Màn | Đến để làm gì | So sánh, quyết định bằng gì | Hành động cuối | Loại sản phẩm này thường làm *(theo trí nhớ, cần kiểm)* |
|---|---|---|---|---|
| **Public · Trang chủ** | Xem thông báo đào tạo mới, lịch đăng ký sắp tới | Ngày đăng, loại thông báo, hạn chót | Mở thông báo, đăng nhập | Danh sách thông báo theo ngày là nội dung chính, không hero quảng cáo |
| **Auth · Đăng nhập** | Vào portal | — | Đăng nhập | Một cột giữa, logo trường, mã số (MSSV hoặc mã cán bộ, giảng viên) + mật khẩu, "Quên mật khẩu" |
| **SV · Tổng quan** | Biết hôm nay học gì, đợt đăng ký còn bao lâu, có cảnh báo gì không | Giờ học, hạn chót đợt đăng ký, cảnh báo học vụ | Mở TKB, vào đăng ký | Lịch hôm nay đứng đầu; cảnh báo/hạn chót là banner |
| **SV · Đăng ký học phần** | Chọn lớp cho kỳ tới | **Còn chỗ không, có trùng lịch không, đủ tiên quyết chưa**, số tín chỉ, giảng viên, giờ học | Đăng ký / huỷ lớp | Lớp **không đăng ký được hiện lý do ngay trên dòng** (trùng lịch, thiếu tiên quyết, hết chỗ); tổng tín chỉ đã chọn dính đầu/đáy màn |
| **SV · TKB** | Xem lịch tuần | Thứ, tiết, phòng | Xuất `.ics` | Lưới tuần ở desktop, danh sách theo ngày ở điện thoại |
| **SV · Bảng điểm** | Xem điểm, GPA/CPA | Điểm từng thành phần, điểm chữ, GPA kỳ | — | Nhóm theo học kỳ, GPA kỳ + CPA tích luỹ ở đầu |
| **GV · Lớp học phần** | Chọn lớp để điểm danh/nhập điểm | Lớp hôm nay dạy, sĩ số, hạn nhập điểm | Mở lớp | Lớp có buổi dạy hôm nay đứng đầu; lớp sắp hết hạn nhập điểm nổi lên (trạng thái tính từ giờ) |
| **GV · Nhập điểm** | Nhập điểm cả lớp nhanh | Điểm từng thành phần, ô trống, ô ngoài khoảng 0–10 | Lưu nháp / chốt điểm | Bảng sửa tại chỗ, Tab/Enter qua ô kế, tự lưu nháp, "Chốt" là việc không đảo ngược (hộp xác nhận) |
| **GV · Cố vấn** | Duyệt kế hoạch học tập, theo dõi SV bị cảnh báo | Trạng thái kế hoạch, mức cảnh báo, CPA | Duyệt / trả lại | Danh sách chờ duyệt đứng đầu |
| **Admin · Lớp học phần** | Mở lớp cho kỳ | Học phần, sĩ số tối đa, phòng, giờ, GV, xung đột phòng/GV | Tạo/sửa lớp | Bảng dày dữ liệu, lọc theo kỳ/khoa, form trong panel trượt |
| **Admin · Đợt đăng ký** | Cấu hình thời gian, đối tượng, hạn mức tín chỉ | Thời gian mở/đóng, khoá áp dụng | Mở/đóng đợt | Trạng thái đợt (sắp mở / đang mở / đã đóng) rõ ràng |

**Trạng thái suy từ giờ phải nổi** (evon `U3`): đợt đăng ký sắp đóng, lớp quá hạn nhập điểm, kế hoạch học tập chờ duyệt quá lâu.

### 2.2 Bộ nhận diện → token

| Token | Giá trị | Dùng ở đâu | Không dùng ở đâu |
|---|---|---|---|
| `--primary` | Xanh Cerulean `#124874` | Nút chính, link, ô nhập đang focus, tab đang chọn, biểu đồ | Nền lớn, chữ thân bài |
| `--primary-foreground` | `#ffffff` | Chữ trên nút chính | |
| `--primary-hover` | Cerulean pha nền 85% | Nút chính khi rê chuột | |
| `--primary-light` | Cerulean 5% | Nền badge/avatar mang màu thương hiệu | |
| `--ring-focus` | Cerulean 10% | Ring khi ô nhập đang focus | |
| `--brand-accent` | Đỏ Jasper `#CF373D` | **Chỉ cho dấu hiệu thương hiệu**: logo, vạch mảnh trên header trang public, chữ "SP" | **Không bao giờ cho nút hay trạng thái**: đỏ trên nút đọc thành "xoá/nguy hiểm" |
| `--danger` | rose-700 trên nền rose-500/10 | Xoá, đăng xuất, chốt điểm (evon locked rule 1–2) | |
| Trạng thái | xanh lá = xong, hổ phách = cần chú ý, xám = trung tính, đỏ = lỗi | Badge trạng thái (bảng ánh xạ chung, mục 2.4) | |

- **Font:** Geist (dự án đã chọn), subset `latin` + `vietnamese`. Một font, phân vai bằng độ đậm: tiêu đề 600, thân 400, nhãn 500.
- **Nơi đổi thương hiệu:** màu ở `src/shared/constants/theme.constant.ts` (nguồn duy nhất, sinh ra cả CSS variables cho Tailwind lẫn `ThemeConfig` cho antd); font ở `src/app/layout.tsx`.
- **Kiểm tương phản:** chữ trắng trên `#124874` ≈ 9.5:1 (đạt AAA). `#CF373D` trên trắng ≈ 4.9:1, vừa qua ngưỡng AA 4.5 → dùng được cho chữ nhưng không cho chữ nhỏ dưới 14px.
- **Logo:** dùng `public/hcmue-logo.png` hiện có. Cần bản SVG hoặc bản chỉ có dấu (không chữ) cho favicon và sidebar thu gọn → *cần người dùng cung cấp*.

### 2.3 Thay đổi so với ARCHITECTURE.md

Evon chốt: mục sidebar đang chọn dùng nền xám + chữ đậm, **không tô màu nhấn**; giao diện flat. Vì vậy:

- **Administrator:** sidebar **sáng**, không phải "sidebar Cerulean đậm" như mục 3 của ARCHITECTURE.md. Màu Cerulean xuất hiện ở logo đầu sidebar, nút chính, tab đang chọn. → *cần xác nhận*.
- **Public:** nút "Đăng nhập" là nút chính **Cerulean**, không phải đỏ Jasper. → *cần xác nhận*.

### 2.4 Hợp đồng nguyên tố (evon `D1`), chốt trước màn đầu tiên

| Nguyên tố | Chốt (antd + token) |
|---|---|
| Nút | Mặc định là viền; chính (`type="primary"`) một chỗ mỗi nhóm; chữ (`type="text"`); nguy hiểm (nền rose mờ, không dùng `danger` đặc). Cao `h-11` điện thoại / `h-10` từ `md`, bo 8px. Icon trái chỉ khi nói đúng hành động |
| Badge trạng thái | Pill, nền mờ + chữ đậm cùng tông, chữ 12px. Một bảng ánh xạ ở `src/shared/constants/status.constant.ts` dùng cho mọi màn |
| Ô nhập | antd `Input`, cao bằng nút (`h-11` / `h-10`), nền trắng, viền 1px; focus: viền Cerulean + ring 10%. Không icon trái mặc định |
| Card | antd `Card` không bóng, viền 1px nhạt, bo 12px, padding 20px |
| Dòng danh sách / bảng | antd `Table` `size="middle"` (admin dùng `small`), rê chuột đổi nền nhạt |
| Modal | Rộng 480px (form 640px), nút dạt phải, nút chính ngoài cùng; hộp xác nhận việc không đảo ngược không cho bấm ra ngoài để đóng |
| Trạng thái rỗng | Icon xám + tiêu đề + một câu + (tuỳ) một nút |

---

## 3. Lộ trình

Mỗi giai đoạn có **cách kiểm** riêng; chưa qua kiểm thì không sang giai đoạn sau.

### Giai đoạn 0 — Dọn dependency
- Gỡ `zsa`, `zsa-react`, `@tanstack/react-table`.
- Kiểm: `npm ls` không còn cảnh báo peer dependency; `npm run build` qua.

### Giai đoạn 1 — Nền tảng
| File | Nội dung |
|---|---|
| `src/shared/libs/env.lib.ts` | Parse các biến `DEFEAT_*` bằng zod, thiếu là lỗi lúc khởi động |
| `src/shared/libs/db.lib.ts` | `drizzle(postgres(url))` |
| `drizzle.config.ts` | Gom `src/modules/*/*.schema.ts` |
| `src/shared/constants/theme.constant.ts` | Token mục 2.2 → CSS variables + antd `ThemeConfig` |
| `src/app/globals.css` | Xoá dark mode, xoá `Arial`; khai `@theme inline` cho token; thanh cuộn mảnh (evon) |
| `src/app/layout.tsx` | Geist + subset `vietnamese`, `ConfigProvider` (theme + locale `vi_VN`) |
| `src/app/page.tsx` | Xoá trang mẫu |
| `package.json` | Script `db:generate`, `db:migrate`, `db:studio` |
- Kiểm: `npm run db:migrate` chạy trên Postgres local; build qua.

### Giai đoạn 2 — Schema dữ liệu ✅
PostgreSQL 18.4, khoá chính `uuid` mặc định `uuidv7()`. Ràng buộc đặt ở DB thay vì ở code. Chi tiết ở `docs/ARCHITECTURE.md` mục 10.

Đã làm (gồm phần DB còn thiếu của Giai đoạn 1: `env.lib.ts`, `db.lib.ts`, `drizzle.config.ts`, script `db:*`, cùng `pg-error.lib.ts`): 76 bảng trên 20 module, phủ đủ kiểu dữ liệu frontend đang dùng chứ không chỉ 7 module ban đầu.

| Module | Bảng |
|---|---|
| `authentication` | `user`, `session`, `account`, `verification`, `rate_limit` (better-auth + cột plugin `admin`), `sign_in_failures` (khóa tạm theo tên đăng nhập) |
| `curriculum` | `faculties`, `majors`, `courses`, `course_relations` (tiên quyết, song hành, tương đương), `programs`, `program_cohorts`, `program_courses` |
| `users` | `lecturers`, `staff_members`, `administrative_classes` (kèm cố vấn), `students`, `student_decisions`, `lecturer_load_norms` |
| `facilities` | `campuses`, `rooms` |
| `course-registration` | `terms`, `registration_periods`, `class_sections`, `class_section_audience_majors`, `section_meetings`, `lab_groups`, `reserved_seats`, `reserved_seat_majors`, `enrollments`, `waitlist_entries`, `registration_holds`, `registration_events` |
| `grades` | `grade_sheets`, `grade_components`, `grade_scores`, `course_results`, `academic_warnings` |
| `schedule` | `class_sessions`, `attendance_records` |
| `teaching` | `syllabi`, `syllabus_outcomes`, `syllabus_weeks`, `syllabus_assessments`, `class_announcements`, `class_announcement_reads` |
| `exams` | `exam_sessions`, `exam_proctors`, `exam_eligibility_overrides` |
| `study-plan` | `study_plans`, `study_plan_items` |
| `advising` | `advising_appointments`, `appointment_students`, `advising_notes` |
| `requests` | `academic_requests`, `request_steps`, `request_attachments` |
| `access`, `audit`, `settings` | `roles`, `role_permissions`, `role_assignments`, `audit_logs`, `regulations`, `calendar_events`, `report_exports` |
| `tuition`, `surveys`, `graduation`, `notifications`, `announcements` | `tuition_rates`, `tuition_fees`, `tuition_invoices`, `invoice_lines`, `payments`, `surveys`, `survey_questions`, `survey_submissions`, `survey_responses`, `survey_answers`, `graduation_records`, `notifications`, `announcements` |

- Kiểm (đã qua): `npm run db:migrate` trên DB trắng; `npm run db:seed` (chương trình CNTT 2023 với 33 học phần, 3 học kỳ, 7 lớp, đợt đăng ký đang mở, 3 tài khoản SV / GV kiêm cố vấn / admin); `npm run test:db` 23/23 test; `tsc` kiểm 35 enum khớp kiểu frontend; `drizzle-kit generate` không còn khác biệt giữa schema và DB.
- Bàn giao cho Giai đoạn 3: better-auth phải đặt `advanced.database.generateId: false` để DB tự sinh `uuidv7()` cho cột `uuid`; mật khẩu seed đã băm bằng `better-auth/crypto` và xác minh được.

Định danh trên URL khi nối dữ liệu thật:

| Đối tượng | Hiện tại (mock) | Khi làm thật |
|---|---|---|
| Lớp học phần, chương trình, học phần, đơn từ, quyết định, kỳ thi, khảo sát… | Chuỗi tự đặt, ví dụ `/lecturer/classes/hk1-2026-comp1020-01` | `uuid` (khoá chính `uuidv7` từ Postgres), ví dụ `/lecturer/classes/0192f3a4-…` |
| Sinh viên, giảng viên | `sv-29`, `gv-3` | Không dùng uuid, dùng thẳng mã SV, mã GV (đã `unique`), ví dụ `/lecturer/advising/students/48.01.104.001` |
| Thông báo công khai | slug | Giữ slug |

- Route chỉ nhận đúng định dạng: param không phải uuid hợp lệ (hoặc không khớp mã SV/GV) thì trả 404 trong `proxy.ts`, trước khi render. Kiểm tra ở page bằng `notFound()` vẫn hiện đúng giao diện 404 nhưng mã HTTP là 200, vì `loading.tsx` đã bắt đầu stream (Next gắn `noindex`).
- Mã lớp học phần (`COMP1020.01`) vẫn hiển thị trên giao diện và dùng để tìm kiếm, không dùng làm định danh trên URL.

- Kiểm: migrate từ DB trắng chạy được; một file seed dữ liệu mẫu (1 khoa, 1 ngành, ~20 học phần, 1 kỳ, vài lớp, 3 tài khoản: SV, GV kiêm cố vấn, admin).

### Giai đoạn 3 — Xác thực và phân quyền ✅
**Tên đăng nhập** (người dùng nói):

| Đối tượng | Đăng nhập | Khôi phục mật khẩu |
|---|---|---|
| Sinh viên | **Chỉ mã số sinh viên**, ví dụ `50.01.104.013`. Nhận cả dạng có dấu chấm và dạng 10 chữ số liền (`5001104013`), chuẩn hoá về 10 chữ số trước khi tra. Nhập email sinh viên ở ô đăng nhập thì báo dùng MSSV | Email trường cấp `5001104013@student.hcmue.edu.vn` (10 chữ số của MSSV + `@student.hcmue.edu.vn`) |
| Giảng viên, cán bộ | **Mã số cán bộ, giảng viên** (`lecturers.code` dạng `GV104011`, `staff_members.code` dạng `CB0021`), không phân biệt hoa thường. Không đăng nhập bằng email (mọi tài khoản) | Email công vụ `@hcmue.edu.vn` (luồng OTP như sinh viên) |

- `students.code` lưu 10 chữ số liền; dạng có dấu chấm `NN.NN.NNN.NNN` chỉ là cách hiển thị và cách nhập.
- better-auth: plugin `username` (username = MSSV đã chuẩn hoá), `emailAndPassword` để khôi phục qua email; `disableSignUp`; `advanced.database.generateId: false` để DB sinh `uuidv7()`.
- `auth.lib.ts`, `auth-client.lib.ts`, `session.lib.ts` (`getSession`, `requireRole`), route `api/auth/[...all]`.
- `src/proxy.ts`: chưa có cookie → `/authentication/sign-in`. Quyền chi tiết của admin lấy từ `roles` / `role_assignments`.
- Quên mật khẩu: OTP gửi email (*cần chốt dịch vụ gửi mail*; tạm thời in OTP ra log ở môi trường dev).
- Áp skill `better-auth-security-best-practices`: rate limit đăng nhập, trusted origins, cookie `secure`.
- Bỏ nút tài khoản dùng thử và `DEMO_ACCOUNTS` khi đăng nhập thật chạy được.
- Kiểm: SV đăng nhập được bằng cả `50.01.104.013` và `5001104013`, không đăng nhập được bằng email; khôi phục mật khẩu bằng email trường; SV mở `/administrator` bị chặn.
- Đã làm: các mục trên, `tests/auth.test.ts` (11 test), kiểm tay trên trình duyệt. MSSV hiển thị dạng `50.01.104.013` toàn bộ giao diện. Còn lại cho các giai đoạn sau: nội dung các trang vẫn là dữ liệu mẫu (header lấy tên từ phiên đăng nhập); "Đổi mật khẩu" trong hồ sơ chưa nối (trang `/authentication/verify` đã nối OTP xác minh email); bộ chuyển vai trò xem thử của admin vẫn là mock.

### Giai đoạn 4 — Khung đọc/ghi dữ liệu (thử trên 1 module) ✅
- Mỗi module: `*.query.ts` (đọc, `server-only`), `*.action.ts` (server action, `schema.safeParse()`, trả `ActionResult` chung), lỗi Postgres đổi sang câu tiếng Việt qua `pgErrorMessage`.
- Đổi định danh URL sang uuid / mã SV, mã GV như bảng ở Giai đoạn 2; `proxy.ts` trả 404 khi sai định dạng.
- Làm thử trọn vẹn trên `facilities` (phòng học) để chốt khuôn mẫu trước khi nhân ra module khác.
- Đã làm: `action.lib.ts` (`ActionResult`, `parseInput`, `actionFailure`), `requireSession()`, phân quyền admin đọc từ `role_assignments` (thêm `roles.key`, bỏ nút "Xem thử" vai trò người khác), module `facilities` đọc/ghi DB thật (12 phòng, 3 cơ sở trong seed), `tests/facilities.test.ts`. Quy ước ghi ở ARCHITECTURE.md mục 10. Đổi định danh URL sang uuid làm dần theo từng module khi nối dữ liệu (phòng học không có trang chi tiết). Trang quản lý phân quyền (`/administrator/settings/access`) vẫn đọc danh sách vai trò mẫu, nối ở Giai đoạn 5.

### Giai đoạn 5 — Danh mục (admin) — phần đào tạo và phân quyền ✅
- Đã làm: khoa, ngành, học phần (kèm tiên quyết, song hành, tương đương), chương trình đào tạo (kèm khóa áp dụng) đọc/ghi DB thật; seed nạp đủ 45 học phần, 8 chương trình, 6 ngành. Trang Phân quyền: sửa quyền của vai trò, cấp vai trò cho tài khoản cán bộ/giảng viên có thật (chọn từ danh sách), thu hồi; `user.role` tự thêm/bỏ `admin` theo vai trò được cấp. Link chương trình dùng uuid, link cũ trả 404. Tài khoản admin seed có 2 vai trò để thử đổi vai trò. `tests/curriculum.test.ts`.
- Chuyển sang Giai đoạn 6: học kỳ, đợt đăng ký, lớp học phần, người dùng, phân công cố vấn và giảng dạy. Các bảng này đang được dữ liệu mẫu của module khác tham chiếu theo id (`hk1-2026`, `sv-29`, `hk1-2026-comp1020-01`), nối riêng sẽ làm vỡ các trang còn dùng mock, nên nối cùng lúc với module đăng ký học phần.
- Còn lại của phần đào tạo: sửa khung chương trình (thêm, bớt học phần theo học kỳ) trên trang chi tiết chương trình chưa có giao diện sửa.

#### Kế hoạch ban đầu của giai đoạn 5
- Khoa, ngành, học phần + tiên quyết, chương trình đào tạo, học kỳ, đợt đăng ký, lớp học phần (buổi học, nhóm thực hành, giữ chỗ), người dùng, phân công cố vấn và giảng dạy.
- Tạo và sửa dùng **cùng một form** (evon `D3`).
- Kiểm: tạo đủ dữ liệu cho một kỳ hoàn toàn qua giao diện admin.

### Giai đoạn 6 — Đăng ký học phần (SV)
- Kiểm tra tiên quyết, hạn mức tín chỉ, trùng lịch, trong đợt hay không; lý do hiện ngay trên dòng lớp.
- Giữ chỗ nguyên tử: tăng sĩ số và insert `enrollments` trong cùng transaction (`... WHERE enrolled_count < capacity RETURNING`, không có dòng trả về = hết chỗ); hàng chờ, chặn đăng ký, nhật ký đăng ký.
- Kiểm: test hàm kiểm tra điều kiện + test 2 SV tranh chỗ cuối cùng → chỉ 1 người được.
- Đã làm: đăng ký, hủy, danh sách chờ của sinh viên; mở lớp, phân công, hủy lớp, chuyển sinh viên, đợt đăng ký, khóa đăng ký của admin (đọc/ghi DB, server kiểm lại bằng chính hàm của giao diện). Server chặn đăng ký khi học phí học kỳ đang học quá hạn. Theo dõi đăng ký: danh sách sinh viên chưa đăng ký đọc từ DB theo đợt đang mở, nút nhắc gửi thông báo trên cổng sinh viên (sinh viên chưa kích hoạt tài khoản thì không nhận được).

### Giai đoạn 7 — Giảng viên
- Điểm danh theo buổi, nhập điểm (lưu nháp, chốt có xác nhận), đề cương, thông báo lớp, lịch dạy, khối lượng giảng dạy; admin công bố điểm → `course_results`.
- Kiểm: chốt điểm xong không sửa được; điểm ngoài 0–10 bị chặn ở DB.
- Đã làm (grades, graduation): bảng điểm học phần đọc/ghi DB (lưu nháp tự động, chốt, khoa duyệt/trả lại, công bố → `course_results`), bảng điểm sinh viên, GPA/CPA, xếp loại, cảnh báo học vụ, xét tốt nghiệp (trình hội đồng lập dự thảo quyết định) đọc từ DB; trigger chặn sửa điểm sau khi chốt và chặn nhảy bước; `tests/grades.test.ts`, `tests/graduation.test.ts`.

### Giai đoạn 8 — Sinh viên xem kết quả
- Bảng điểm, GPA kỳ / CPA (*cần bảng quy đổi của trường*), TKB + xuất `.ics`, lịch thi và điều kiện dự thi, tiến độ chương trình.
- Đã làm (lịch học, lịch thi, khảo sát đọc/ghi DB thật): buổi học sinh từ lịch tuần và nhóm thực hành (`class_sessions.lab_group_id`), giảng viên lưu điểm danh theo buổi; TKB sinh viên/giảng viên lấy từ lớp đã đăng ký/đang dạy; lịch thi, cán bộ coi thi, sửa và công bố ca thi, nộp đề, đề nghị đổi ca (`exam_proctor_swap_requests`), điều kiện dự thi tính từ điểm danh và quyết định cho dự thi; khảo sát ẩn danh (id phiếu chỉ mang ngày nộp), giảng viên chỉ xem lớp từ 5 phiếu. `tests/schedule.test.ts`, `tests/exams.test.ts`, `tests/surveys.test.ts`. Chưa có: dịch vụ lưu tệp đề thi (mới ghi khóa lưu trữ), Phòng Khảo thí duyệt đề, sinh lại buổi học khi đổi lịch lớp.
- Kiểm: test hàm tính GPA với vài bộ điểm biết trước.

### Giai đoạn 9 — Cố vấn và đơn từ
- Kế hoạch học tập (gửi duyệt, duyệt / trả lại), lịch hẹn và ghi chú cố vấn, đơn từ đi qua từng bước duyệt.
- Đơn từ đã đọc/ghi DB thật (module `requests`): sinh viên, giảng viên gửi và hủy đơn; cố vấn, giảng viên, khoa, Phòng Đào tạo, Phòng Khảo thí duyệt hoặc từ chối đúng bước của mình (khóa dòng đơn khi chuyển bước, mỗi đơn một bước đang chờ); mã đơn cấp bằng bộ đếm `request_code_counters`; tệp minh chứng mới lưu tên và kích thước, chưa có kho lưu nội dung.
- Đã làm (`teaching`, `study-plan`, `advising` đọc/ghi DB thật): đề cương và thông báo lớp chỉ giảng viên dạy lớp sửa (thông báo hẹn giờ tự đăng khi tới giờ, sinh viên đánh dấu đã đọc), kế hoạch học tập theo khung chương trình (nháp hoặc bị trả lại thì sửa, đã duyệt thì sửa thành bản mới, chờ duyệt thì khóa; chỉ cố vấn lớp sinh hoạt duyệt), lịch hẹn và ghi chú cố vấn; `tests/teaching|study-plan|advising.test.ts`. Đợt 2: cổng sinh viên có `/application/classes` (thông báo lớp, đề cương đã công bố, liên hệ giảng viên) và `/application/advising` (lịch hẹn, liên hệ cố vấn); bài hẹn giờ được báo qua tác vụ cron `class-announcements` (cột `notified_at`, `FOR UPDATE SKIP LOCKED`, trang lớp gọi bù), email lớp gửi thật khi bật; quyền đọc lớp kiểm trong query (giảng viên dạy lớp hoặc sinh viên đang học).

### Giai đoạn 10 — Phần còn lại
- Học phí (hoá đơn, thanh toán), khảo sát ẩn danh, xét tốt nghiệp, thông báo, audit log, cảnh báo học vụ tự động (*cần ngưỡng của trường*), báo cáo và nhập / xuất Excel.
- Đã nối DB: học phí (hóa đơn theo tín chỉ đăng ký, thanh toán), thông báo cá nhân (đánh dấu đã đọc), thông báo công khai (đăng, hẹn giờ, sửa, ghim, gỡ), nhật ký thao tác (`recordAudit` trong `audit.lib.ts`), quy chế theo phiên bản, lịch năm học, lịch sử xuất báo cáo. Tải báo cáo: mỗi báo cáo đọc dữ liệu thật và tạo CSV lúc tải (chưa có kho lưu tệp nên tải lại là đọc lại dữ liệu hiện tại; chỉ có CSV vì chưa có thư viện xlsx, pdf). Còn lại: ghi nhận thanh toán từ ngân hàng.
- Đã làm thêm: trang Học phí của cán bộ (`/administrator/tuition`, quyền `tuition.manage`, vai trò mẫu Phòng Kế hoạch - Tài chính) ghi khoản nộp tay, hủy khoản ghi nhầm (giữ dòng kèm lý do), nhập sao kê .xlsx/.csv có xem trước đối chiếu (trigger `payments_within_invoice_total` chặn nộp vượt số phải nộp, mã giao dịch unique); báo cáo xuất .xlsx (exceljs) bên cạnh CSV; nhập sinh viên từ .xlsx; đổi lịch lớp thì sinh lại buổi học tương lai chưa điểm danh và báo sinh viên, giảng viên; trang Theo dõi đăng ký đếm nhịp đăng ký thật từ `registration_events`; đường dẫn sai trong cổng trả 404 thật (nhóm `(portal-not-found)`).

### Giai đoạn 11 — Hoàn thiện
- Xoá toàn bộ mock (`mock*.lib.ts`, `*.mock.ts`), test end-to-end các luồng chính, cấu hình triển khai.
- Đã làm: không còn code chạy lúc runtime đọc `*.mock.ts` hay `MOCK_MAJORS`/`MOCK_COHORTS`; ngành, khoa, khóa đọc từ DB. Mock chỉ còn là dữ liệu nguồn cho seed (`scripts/seed`) và test seed. Danh mục học phần thống nhất (201 học phần), khung chương trình mỗi ngành theo đúng thứ tự học phần trong bảng điểm mẫu. Xuất/nhập bảng điểm và xuất danh sách xét tốt nghiệp bằng CSV.
- Đã làm kho lưu tệp (`storage.lib.ts`, đĩa cục bộ dưới `DEFEAT_STORAGE_DIRECTORY`): minh chứng đơn từ, đề thi và đáp án tải lên thật (kiểm đuôi và chữ ký đầu tệp, 10 MB/tệp minh chứng, 20 MB/tệp đề), tải xuống qua `/api/files/...` theo đúng quyền xem đơn, quyền đề thi; tác vụ `orphan-files` dọn tệp mồ côi. Chưa có: S3/R2, quét virus, Phòng Khảo thí duyệt đề.
- Đã làm (tài khoản): cấp tài khoản cho sinh viên (MSSV), giảng viên và cán bộ mới (mã số cán bộ, giảng viên; thư kích hoạt tới email công vụ) với mật khẩu ngẫu nhiên không lưu dạng rõ, thư kích hoạt qua luồng quên mật khẩu (OTP), trạng thái chưa cấp / chưa kích hoạt / đang dùng / đã khóa, khóa và mở khóa (chặn đăng nhập, thu hồi phiên ngay), thư nhắc đăng ký học phần tới email trường; chỉ mở các endpoint better-auth app dùng, chặn open redirect `?next=`.
- Còn lại: kho lưu tệp (minh chứng đơn từ, đề thi mới lưu tên tệp), dịch vụ gửi email (OTP đang in ra log server), cổng sinh viên xem thông báo lớp và đề cương, giao diện sửa khung chương trình và sửa cột điểm, khung chương trình 5 ngành ngoài CNTT trong seed chỉ khoảng 105 tín chỉ (dưới mức xét tốt nghiệp), trang 404 trong cổng trả mã 200.
- Đã làm (hàng đợi thư): thư kích hoạt, nhắc đăng ký, email thông báo lớp ghi vào `mail_outbox` cùng transaction của thao tác, gửi ngay sau phản hồi và gửi lại khi lỗi (tác vụ cron `mail-outbox`, lùi 1 phút tới 8 giờ, 6 lần thì dừng), trang `/administrator/settings/mail` xem thư lỗi và gửi lại; OTP vẫn gửi thẳng.
- Đã làm (đợt 2: khung, cột điểm, Excel, cảnh báo): sửa khung chương trình (thêm, bỏ, chuyển học kỳ bằng menu hoặc kéo thả; trigger chặn khung của chương trình ngừng áp dụng và học kỳ vượt số năm × 2), giảng viên sửa cột điểm khi bảng còn nháp/bị trả lại (gợi ý theo đề cương đã công bố), xuất/nhập bảng điểm `.xlsx` (vẫn nhận `.csv`) và xuất danh sách xét tốt nghiệp `.xlsx` bằng exceljs, sinh cảnh báo học vụ cho học kỳ đã kết thúc (nút ở trang cảnh báo học vụ, tác vụ cron `academic-warnings`, báo cố vấn), khung mẫu mỗi ngành đủ tổng tín chỉ của chương trình nên khóa 48 ngành nào cũng có sinh viên đủ điều kiện tốt nghiệp.
- Đã làm (đợt 2: kho tệp, quét virus, duyệt đề): driver S3 (`DEFEAT_STORAGE_DRIVER=s3`, AWS S3/R2/MinIO, ký SigV4 trong `s3.lib.ts`, tải xuống vẫn qua route của app dạng luồng), quét ClamAV qua clamd INSTREAM trước khi ghi kho (fail-closed khi đã cấu hình), Phòng Khảo thí duyệt (khóa đề, trigger `exam_sessions_paper_locked`) hoặc trả lại đề kèm lý do, giảng viên thấy lý do và nộp lại.

---

## 4. Cần người dùng chốt

1. Brief + bảng 2.1 đúng chưa (cổng 1 của evon).
2. Mục 2.3: sidebar admin sáng, nút đăng nhập public màu Cerulean.
3. Gỡ `zsa`, `zsa-react`, `@tanstack/react-table`.
4. ~~Sign-up~~: đã chốt, không có đăng ký.
5. Logo bản SVG / bản chỉ có dấu; bảng quy đổi điểm và ngưỡng cảnh báo học vụ của trường.
6. ~~Tên đăng nhập sinh viên~~: đã chốt, chỉ dùng MSSV; khôi phục qua `MSSV@student.hcmue.edu.vn`.
7. ~~Tên đăng nhập và cách khôi phục của giảng viên, cán bộ~~: đã chốt, đăng nhập bằng mã số cán bộ, giảng viên; khôi phục qua email công vụ.
8. Dịch vụ gửi email OTP; nơi triển khai (VPS / Vercel / server trường); thư viện Excel (đề xuất `exceljs`).
