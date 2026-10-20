-- Giảng viên, cán bộ đăng nhập bằng mã hồ sơ: tài khoản đã cấp mà chưa có username thì đặt theo mã (chữ thường để tra,
-- chữ hoa để hiển thị). Chạy lại nhiều lần không đổi gì thêm: chỉ đụng tài khoản username còn trống, bỏ qua mã sai dạng
-- hoặc mã đã là tên đăng nhập của tài khoản khác. Giảng viên trước, cán bộ sau (một người có cả hai hồ sơ thì giữ mã giảng viên).
UPDATE "user" AS u
SET "username" = lower(regexp_replace(l."code", '\s', '', 'g')),
    "display_username" = upper(regexp_replace(l."code", '\s', '', 'g')),
    "updated_at" = now()
FROM "lecturers" AS l
WHERE l."user_id" = u."id"
  AND u."username" IS NULL
  AND lower(regexp_replace(l."code", '\s', '', 'g')) ~ '^[a-z]{2,4}[0-9]{3,8}$'
  AND NOT EXISTS (SELECT 1 FROM "user" AS o WHERE o."username" = lower(regexp_replace(l."code", '\s', '', 'g')));
--> statement-breakpoint
UPDATE "user" AS u
SET "username" = lower(regexp_replace(s."code", '\s', '', 'g')),
    "display_username" = upper(regexp_replace(s."code", '\s', '', 'g')),
    "updated_at" = now()
FROM "staff_members" AS s
WHERE s."user_id" = u."id"
  AND u."username" IS NULL
  AND lower(regexp_replace(s."code", '\s', '', 'g')) ~ '^[a-z]{2,4}[0-9]{3,8}$'
  AND NOT EXISTS (SELECT 1 FROM "user" AS o WHERE o."username" = lower(regexp_replace(s."code", '\s', '', 'g')));
