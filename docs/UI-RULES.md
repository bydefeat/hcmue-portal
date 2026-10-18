# Luật UI — chống AI slop

Nguồn: plugin `evon:ui-ux` (evondevkit), áp cho stack của dự án (**antd + Tailwind**, chỉ giao diện sáng). Mã luật trong ngoặc (`M3`, `F12`...) là mã gốc của evon, tra lại trong skill khi cần chi tiết.

**Mọi màn, mọi component phải qua file này.** PR vi phạm mục 1 hoặc mục 2 thì không merge.

---

## 1. Cấm — dấu hiệu "AI dựng"

| # | Cấm | Thay bằng |
|---|---|---|
| 1 | Gradient ở bất kỳ đâu (`bg-gradient-*`, `linear-gradient`) (`M12`) | Nền phẳng theo token |
| 2 | Glassmorphism, `backdrop-blur` (`F19`) | Nền trắng đặc |
| 3 | Bóng trong trang: card, khối, nút (`M15`) | Viền 1px + bo góc. Bóng chỉ cho lớp nổi: dropdown, popover, modal |
| 4 | Viền phát sáng, `ring-4`, bóng màu neon (`F20`) | |
| 5 | `border-dashed` (`F21`) | Trừ khung kéo thả tệp |
| 6 | Hover phóng to/nhấc lên: `scale-105`, `-translate-y-1` (`F22`) | Hover chỉ đổi màu nền (`I12`) |
| 7 | Fade-in/slide-in cả trang hay nội dung tĩnh khi tải (`F23`) | Chuyển động chỉ cho lớp nổi (mở/đóng modal, drawer, dropdown) |
| 8 | `transition-all` (`F24`) | `transition-colors` |
| 9 | Hero chiếm nguyên màn trong app (`F7`) | Vào là thấy việc ngay |
| 10 | Mỗi mục một card; card lồng card lồng card (`F2`, `F3`) | Danh sách/bảng; lồng tối đa 2 tầng |
| 11 | Bọc antd `Table` trong `Card` (`F4`) | Bảng tự là khung |
| 12 | Chia đều 3 cột chỉ vì có 3 mục (`F5`) | Bố cục theo mức quan trọng |
| 13 | Emoji trong tiêu đề, lời chào, làm icon (`T19`) | Icon `defeat-icons-react` |
| 14 | Badge kiểu "✨ Mới", "🚀 Nhanh", "AI-powered" (`T21`) | Không có |
| 15 | Dấu gạch dài (—) trong câu văn trên UI (`T18`) | Dấu phẩy, dấu chấm, hai câu |
| 16 | Chữ hướng dẫn thừa: "Bấm vào đây để...", "Vui lòng..." lặp lại nhãn (`T20`) | Nhãn nút tự nói việc |
| 17 | Mỗi trạng thái đều gắn badge xanh "Hoạt động" trên mọi dòng (`N3`) | Chỉ ngoại lệ mới có dấu |
| 18 | Màu để trang trí/phân loại khối: nền xanh nhạt cho khối này, tím cho khối kia (`M4`, `M5`) | Phân loại bằng icon + chữ |
| 19 | Màu nhấn thứ hai (`M3`) | Chỉ Cerulean. Jasper không phải màu nhấn UI (mục 3) |
| 22 | Ba nút cùng màu nhấn trong một nhóm (`I3`) | Một nút chính, còn lại viền |
| 23 | Mã hex rải trong markup, `style={{ color: ... }}` (`M24`) | Token (mục 3) |
| 24 | Spacing, cỡ chữ, bo góc tuỳ hứng: `p-[13px]`, `text-[15px]` (`F14`, `T7`) | Thang ở mục 2 |
| 25 | Margin/translate âm để nhích cho thẳng (`N11`) | `gap`, `items-*`, padding đúng chỗ; buộc phải dùng thì comment lý do |
| 26 | Icon nhiều bộ, nhiều màu, SVG tự vẽ inline (`F15`) | Một bộ `defeat-icons-react`, một màu xám |
| 27 | Ba icon giống hệt cho ba mục khác nghĩa (`F17`) | Khác icon, hoặc bỏ icon |
| 28 | Placeholder lặp lại nhãn, placeholder `••••••` cho mật khẩu (`T25`, `T26`) | Bỏ placeholder nếu không nói thêm gì |
| 29 | Tự điền sẵn giá trị người dùng chưa chọn, tick sẵn đồng ý (`N7`) | Để trống |
| 30 | Số liệu bịa cho có (số đếm trên tab, "+12% so với tháng trước" không có thật) (`N7`) | Chỉ hiện số thật |
| 31 | Dark mode, `dark:`, nút đổi theme | **Dự án chỉ có giao diện sáng** |

---

## 2. Bắt buộc

### Màu & chữ
- Nền trang **xám nhạt**, card/bảng **trắng** (`M1`). 95% trung tính, 5% màu nhấn (`M2`). Màu nhấn phải **thật sự xuất hiện** ở nút chính, link, tab/ô đang chọn (`D5`).
- Chữ chỉ **3 sắc độ**: chính, phụ, chữ trên nền nhấn (`M11`).
- **Một bảng trạng thái cho cả app** ở `src/shared/constants/status.constant.ts`: xám = chờ/trung tính, xanh lá = xong, hổ phách = cần chú ý, đỏ = lỗi/không đảo ngược. Màu **luôn có chữ hoặc icon đi kèm** (`N4`, `M7`).
- Một font (Geist, có subset `vietnamese`), phân vai bằng độ đậm: 400 thân, 500 nhãn/nút, 600 tiêu đề (`T2`, `T5`).
- Thang cỡ chữ: `xs` nhãn/thời gian · `sm` **mặc định** · `base` tên thẻ · `lg` tiêu đề khối · `xl` **tên trang** (không `2xl` ngoài hero). Tên trang > tiêu đề khối > tên thẻ, mỗi bậc cách đúng một nấc (`T6`, `T8`).
- Số xếp cột (điểm, tín chỉ, sĩ số, GPA) dùng `tabular-nums` (`T16`). Mã SV, mã học phần, mã lớp dùng `font-mono` (`T17`).
- Câu dài tối đa ~75 ký tự/dòng, căn trái, mô tả có `text-pretty` (`T10`–`T12`).

### Khối & nhịp
- Thang khoảng cách: **4 / 8 / 12 / 16 / 20 / 24 / 32 / 40**. Padding trang `p-4 sm:p-6`; padding card `p-4 sm:p-5`; gap lưới `gap-3`.
- Bo góc theo chiều cao: phần tử **dưới 40px → 8px**, **từ 40px → 12px** (card, modal) (`F1`, luật khoá 10).
- Ô nhập, select, nút trong form: **`h-11` ở điện thoại, `h-10` từ `md`**, ô và nút luôn cao bằng nhau. Form đăng nhập đứng riêng giữa trang: `h-12`.
- Viền 1px, chỉ 2 token viền (`M14`).
- Mục xếp chồng có nền rê/đang chọn cách nhau tối thiểu 4px (`gap-1`) (luật khoá 19).
- Mọi flex/grid item chứa nội dung động có `min-w-0` (`T13`). Trang **không cuộn ngang ở 375px** (`N8`).

### Trạng thái & tương tác
- Mọi trang có dữ liệu có đủ **đang tải / rỗng / lỗi** (`I19`). Khung chờ đúng hình dòng thật (antd `Skeleton`).
- Đổi trạng thái thì phần tử xung quanh **không xê dịch** (`N1`).
- Câu lỗi nói **chuyện gì, vì sao, làm gì tiếp** (`N6`). Ví dụ: không viết "Đăng ký thất bại", viết "Lớp MATH101.02 đã đủ 60/60 chỗ. Chọn lớp khác cùng học phần."
- Mọi thứ bấm được có hover nhìn thấy và `cursor-pointer` trên cùng một phần tử (`I9`, `I29`).
- Nút mặc định là **viền**; nút chính chỉ một chỗ mỗi nhóm, có lý do (`I1`–`I3`).
- Modal có ô nhập: **bấm ra ngoài không đóng** (`I20`). Việc không đảo ngược (chốt điểm, xoá, đăng xuất) dùng hộp xác nhận tông đỏ (luật khoá 1, 3).
- Ô mật khẩu có nút hiện/ẩn (`I27`); không tắt autocomplete của trình duyệt, khai đúng `autoComplete` (`I28`).
- Không vẽ vòng focus ở nút, link, tab, dòng; **chỉ ô nhập** có viền + ring khi focus (`I13`).
- Dữ liệu nhiều thì phân trang (`I16`).
- Theo quy ước số đông: logo góc trái về trang chủ, ✕ góc phải để đóng, Huỷ bên trái nút chính, dấu `*` đỏ cho trường bắt buộc.

---

## 3. Bộ nhận diện

| Token | Giá trị | Vai |
|---|---|---|
| `primary` | Cerulean `#124874` | **Màu nhấn duy nhất của UI**: nút chính, link, ô focus, tab đang chọn, biểu đồ |
| `brand-accent` | Jasper `#CF373D` | **Chỉ là màu thương hiệu trong nội dung**: logo, chữ "SP". Không cho nút, badge, trạng thái, chữ dưới 14px |
| `danger` | rose-700 / nền rose-500 10% | Lỗi, việc không đảo ngược |

Lý do Jasper không lên UI: đỏ trong app luôn đọc là "lỗi/nguy hiểm" (`M30`, `N4`); nút đỏ "Đăng ký học phần" sẽ khiến người dùng ngần ngại bấm.

Nguồn màu duy nhất: `src/shared/constants/theme.constant.ts` (sinh CSS variables cho Tailwind + `ThemeConfig` cho antd).

---

## 4. antd: có gì dùng đó, không độ chế

> **Luật của chủ dự án, đứng trên mọi luật evon ở trên.** Chỗ nào luật evon khác hành vi mặc định của antd thì **theo antd**.

- **Giữ nguyên hành vi mặc định của antd**: hiệu ứng wave, vòng focus, kích thước, bo góc, màu mục Menu đang chọn, nút ✕ của Drawer/Modal, `danger` của Button/Menu, bóng của lớp nổi.
- **Không** tắt/ghi đè hành vi antd bằng prop hay class (`wave={{ disabled }}`, `lineWidthFocus: 0`, `outline-hidden` lên component antd, `classNames` để vẽ lại, token component để đổi dáng).
- `ConfigProvider` chỉ nhận: **màu thương hiệu + màu nền/chữ** (`theme.constant.ts`), font Geist, locale `vi_VN`, và token `Layout` cần để dựng khung (nền header/sider/footer, padding 0).
- Thiếu component trong antd (ví dụ dock và sidebar trượt trên điện thoại) mới tự dựng bằng Tailwind.
- Component chỉ gồm antd + class Tailwind cho bố cục; không CSS Module, không styled-components, không `style={{}}` trang trí.
- **Source code không có comment.**

---

## 5. Kiểm trước khi báo xong

1. Grep phải ra **rỗng**: `gradient|backdrop-blur|shadow-(md|lg|xl|2xl)|scale-1[0-9]|transition-all|border-dashed|dark:|—` trong `src/`; không còn comment (`//`, `/* */`).
2. Mở trang ở **1280px và 375px**: không cuộn ngang, chữ có dấu đúng font, ca dài nhất (tên học phần dài nhất, mã dài nhất) vẫn đọc được.
3. Bật lần lượt **có dữ liệu / đang tải / rỗng / lỗi**: phần tử xung quanh không xê dịch.
4. Chuyển sang đen trắng (DevTools → Rendering → Emulate vision deficiency: achromatopsia): mọi trạng thái vẫn đọc ra.
5. Đếm chỗ có màu nhấn trên màn: mỗi chỗ nói một điều chỗ khác chưa nói (`N3`).
6. Rút chuột, đi hết màn bằng Tab + Enter + mũi tên (`N9`).
7. Chạy 12 phép thử `N1`–`N12` của evon (`references/principles.md`) và `references/checklist.md`; có thể chạy `scripts/probe.mjs` của evon trên URL trang.
