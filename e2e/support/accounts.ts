export const PASSWORD = process.env.DEFEAT_SEED_ACCOUNT_PASSWORD || "Hcmue@2026";

export const SEED_ACCOUNTS = {
  student: { login: "50.01.104.009", name: "Phạm Gia Đạt", home: "/application/dashboard" },
  lecturer: { login: "GV104011", name: "ThS. Phạm Thùy Hạnh", home: "/lecturer" },
  admin: { login: "CB0021", name: "Trần Minh Khoa", home: "/administrator" },
} as const;

export type SeedRole = keyof typeof SEED_ACCOUNTS;

export const E2E_ACCOUNTS = {
  passwordChanger: { code: "48.01.101.008", name: "Nguyễn Thành Tài" },
  lockable: { code: "48.01.101.014", name: "Trần Phương Yến" },
} as const;

export const STATE = {
  student: "e2e/.auth/student.json",
  lecturer: "e2e/.auth/lecturer.json",
  admin: "e2e/.auth/admin.json",
  system: "e2e/.auth/system.json",
} as const;
