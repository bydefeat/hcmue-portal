// Tài khoản seed (scripts/seed/people.seed.ts) và tài khoản riêng của e2e (support/provision.ts). Mật khẩu mặc định của seed.
export const PASSWORD = process.env.DEFEAT_SEED_ACCOUNT_PASSWORD || "Hcmue@2026";

export const SEED_ACCOUNTS = {
  student: { login: "50.01.104.009", name: "Phạm Gia Đạt", home: "/application/dashboard" },
  lecturer: { login: "GV104011", name: "ThS. Phạm Thùy Hạnh", home: "/lecturer" },
  admin: { login: "CB0021", name: "Trần Minh Khoa", home: "/administrator" },
} as const;

export type SeedRole = keyof typeof SEED_ACCOUNTS;

export const E2E_ACCOUNTS = {
  // Đổi mật khẩu thu hồi mọi phiên của tài khoản nên không dùng tài khoản seed (phiên đã lưu của các test khác sẽ mất).
  passwordChanger: { code: "48.01.101.008", name: "Nguyễn Thành Tài" },
  // Bị khóa/mở khóa trong kịch bản của Phòng Đào tạo.
  lockable: { code: "48.01.101.014", name: "Trần Phương Yến" },
} as const;

// Phiên đăng nhập lưu sẵn (auth.setup.ts). "system" là tài khoản Phòng Đào tạo đã đổi sang vai trò Quản trị hệ thống.
export const STATE = {
  student: "e2e/.auth/student.json",
  lecturer: "e2e/.auth/lecturer.json",
  admin: "e2e/.auth/admin.json",
  system: "e2e/.auth/system.json",
} as const;
