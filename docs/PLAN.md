# Kế hoạch triển khai HCMUE Portal

Dựa trên [ARCHITECTURE.md](ARCHITECTURE.md), [README.md](../README.md) (phân hệ + bộ nhận diện thương hiệu). Frontend thiết kế theo quy trình của skill `evon:ui-ux`: **brief → wireframe → chọn → dựng**, không dựng thẳng.

Mỗi dòng ghi nguồn: *đọc code*, *người dùng nói*, *đoán* (cần xác nhận).

---

## 0. Hiện trạng (audit)

| Hạng mục | Thấy gì | Xử lý |
|---|---|---|
| Stack | Next 16.4 (`cacheComponents`), React 19.3, antd 6, Tailwind 4, motion | Giữ |
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
| **Auth · Đăng nhập** | Vào portal | — | Đăng nhập | Một cột giữa, logo trường, mã SV/email + mật khẩu, "Quên mật khẩu" |
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

### Giai đoạn 2 — Schema dữ liệu
Khoá chính `uuidv7`. Ràng buộc đặt ở DB thay vì ở code:

| Module | Bảng | Ràng buộc chính |
|---|---|---|
| `users` | bảng của better-auth (`user`, `session`, `account`, `verification`) + `role`; `students` (mã SV, khoá, ngành), `lecturers` (mã GV, khoa) | Mã SV/GV `unique` |
| `curriculum` | `faculties`, `programs`, `courses` (mã HP, tín chỉ), `course_prerequisites`, `program_courses` | Mã HP `unique`; tiên quyết không tự trỏ chính nó |
| `course-registration` | `terms`, `registration_periods` (mở, đóng, hạn mức tín chỉ), `class_sections` (sĩ số tối đa, đã đăng ký), `section_meetings` (thứ, tiết bắt đầu/kết thúc, phòng), `enrollments` | `unique(student_id, class_section_id)`; `check(enrolled_count <= capacity)` |
| `grades` | `grade_components` (chuyên cần/giữa kỳ/cuối kỳ + trọng số), `grade_entries`, trạng thái chốt điểm | Điểm `check(0..10)`; tổng trọng số = 100% |
| `schedule` | `attendance` theo buổi | `unique(meeting_date, enrollment_id)` |
| `study-plan` | `study_plans`, `study_plan_items`, `advisor_assignments` | Một kế hoạch đang hiệu lực mỗi SV |
| `announcements` | `announcements` (slug, nội dung, ngày đăng) | Slug `unique` |

- Kiểm: migrate từ DB trắng chạy được; một file seed dữ liệu mẫu (1 khoa, 1 ngành, ~20 học phần, 1 kỳ, vài lớp, 3 tài khoản: SV, GV kiêm cố vấn, admin).

### Giai đoạn 3 — Xác thực
- `auth.lib.ts` (drizzleAdapter `pg`, emailAndPassword, plugin `admin`, `secret`/`baseURL` từ `DEFEAT_*`), `auth-client.lib.ts`, `session.lib.ts` (`getSession` + `requireRole`), route `api/auth/[...all]`.
- `src/proxy.ts` + `src/proxies/authentication.proxy.ts`: chưa có cookie → `/authentication/sign-in`.
- Sign-up: *cần chốt* (tự đăng ký hay chỉ kích hoạt tài khoản do trường cấp); mặc định **tắt đăng ký mở** (`disableSignUp`).
- Áp skill `better-auth-security-best-practices`: rate limit đăng nhập, trusted origins, cookie `secure`.
- Kiểm: 3 tài khoản seed đăng nhập đúng portal; SV mở `/administrator` bị chặn; build qua với `cacheComponents` (kiểm session nằm trong `<Suspense>`).

### Giai đoạn 4 — Wireframe (evon `U3`) → **cổng chọn**
- Một file HTML wireframe cho **5 khung layout** và các màn chính ở bảng 2.1, mỗi màn 2–3 phương án khác nhau thật về bố cục, nội dung thật (tên học phần, mã SV thật kiểu HCMUE), đủ 4 trạng thái (có dữ liệu, đang tải, rỗng, lỗi), xem được ở desktop và mobile 375px.
- Dựng bằng chính token ở mục 2.2 để bản chọn = bản dựng.
- Probe nhanh từng phương án ở 1280 và 375.
- **Dừng chờ người dùng chọn phương án.** Chưa chọn thì không đụng file nào của dự án.

### Giai đoạn 5 — Layouts (evon `U4`)
- Dựng 5 layout trong `src/shared/components/layouts/` theo phương án đã chọn, menu ở `navigation.constant.ts`, mỗi portal một trang trống.
- Kiểm: probe đủ (Tab, rê, lớp nổi) ở 1280 và 375, không cuộn ngang; checklist evon.

### Giai đoạn 6 — Public + dữ liệu danh mục (admin)
- Trang chủ + thông báo; admin CRUD: chương trình đào tạo, học phần + tiên quyết, kỳ, đợt đăng ký, lớp học phần + buổi học, người dùng + phân công cố vấn.
- Tạo và sửa dùng **cùng một form** (evon `D3`).
- Kiểm: tạo đủ dữ liệu cho một kỳ hoàn toàn qua giao diện admin.

### Giai đoạn 7 — Đăng ký học phần (SV)
- Kiểm tra tiên quyết, hạn mức tín chỉ, trùng lịch, trong đợt hay không; lý do hiện ngay trên dòng lớp.
- Giữ chỗ nguyên tử: `UPDATE class_sections SET enrolled_count = enrolled_count + 1 WHERE id = $1 AND enrolled_count < capacity RETURNING` trong cùng transaction với insert `enrollments`; không có dòng trả về = hết chỗ.
- Kiểm: **một file test** cho hàm kiểm tra điều kiện (trùng lịch, thiếu tiên quyết, vượt tín chỉ) + một test 2 SV tranh chỗ cuối cùng → chỉ 1 người được.

### Giai đoạn 8 — Giảng viên
- Danh sách lớp, điểm danh theo buổi, nhập điểm (bảng sửa tại chỗ, lưu nháp, chốt điểm có xác nhận).
- Kiểm: chốt điểm xong không sửa được nữa; điểm ngoài 0–10 bị chặn ở DB.

### Giai đoạn 9 — SV xem kết quả
- Bảng điểm, GPA kỳ / CPA (công thức quy đổi thang 10 → chữ → thang 4 theo quy chế HCMUE: *cần người dùng cung cấp bảng quy đổi*), TKB + xuất `.ics` (tự sinh chuỗi iCalendar, không cần thư viện), lịch thi.
- Kiểm: test hàm tính GPA với vài bộ điểm biết trước.

### Giai đoạn 10 — Cố vấn học tập
- SV lập kế hoạch học tập (kéo thả học phần vào từng kỳ bằng `dnd-kit`), gửi duyệt; cố vấn duyệt / trả lại; danh sách SV bị cảnh báo.

### Giai đoạn 11 — Báo cáo, cảnh báo học vụ tự động
- Thống kê, xếp loại học lực; cảnh báo theo ngưỡng CPA (*cần quy chế*).

---

## 4. Cần người dùng chốt

1. Brief + bảng 2.1 đúng chưa (cổng 1 của evon).
2. Mục 2.3: sidebar admin sáng, nút đăng nhập public màu Cerulean.
3. Gỡ `zsa`, `zsa-react`, `@tanstack/react-table`.
4. Sign-up: tắt đăng ký mở, hay dùng làm bước kích hoạt tài khoản?
5. Logo bản SVG / bản chỉ có dấu; bảng quy đổi điểm và ngưỡng cảnh báo học vụ của trường.
