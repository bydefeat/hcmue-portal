-- Bước đơn từ xử lý theo quyền requests.step.* thay cho khóa vai trò cứng. Giữ nguyên hành vi cũ cho dữ liệu đang có:
-- vai trò hệ thống được cấp đúng các bước trước đây code gán theo khóa; vai trò tự tạo không được cấp bước nào (như cũ).
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
JOIN (
  VALUES
    ('system-admin', 'requests.step.faculty'),
    ('system-admin', 'requests.step.academic-office'),
    ('system-admin', 'requests.step.exam-office'),
    ('system-admin', 'requests.supervise'),
    ('academic-head', 'requests.step.faculty'),
    ('academic-head', 'requests.step.academic-office'),
    ('academic-head', 'requests.step.exam-office'),
    ('academic-head', 'requests.supervise'),
    ('academic-officer', 'requests.step.academic-office'),
    ('faculty-secretary', 'requests.step.faculty'),
    ('exam-office', 'requests.step.exam-office')
) AS p("role_key", "permission") ON p."role_key" = r."key"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Thông báo chung: đối tượng cũ là nhãn tự do (cột audiences đã bỏ ở migration trước); đặt về "toàn trường", người quản trị
-- chỉnh lại nếu cần. Bài đã đăng trước đây coi như đã gửi thông báo để tác vụ announcement-notifications không gửi lại.
UPDATE "announcements" SET "notified_at" = coalesce("published_at", now()) WHERE "status" <> 'draft' AND "notified_at" IS NULL;
