import dayjs from "dayjs";

export function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(random: () => number, values: readonly T[]) {
  return values[Math.floor(random() * values.length)];
}

export function randomBetween(random: () => number, min: number, max: number, step = 1) {
  const steps = Math.round((max - min) / step);
  return Math.round((min + Math.floor(random() * (steps + 1)) * step) * 100) / 100;
}

export function mockDate(offsetDays: number, time = "08:00") {
  const [hour, minute] = time.split(":").map(Number);
  return dayjs().startOf("day").add(offsetDays, "day").hour(hour).minute(minute).toISOString();
}

export function mockDelay(milliseconds = 120) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const FAMILY_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"];
const FEMALE_MIDDLE = ["Thị", "Ngọc", "Thanh", "Minh", "Thu", "Phương", "Bảo", "Khánh", "Thùy", "Mỹ"];
const MALE_MIDDLE = ["Văn", "Minh", "Quốc", "Hoàng", "Đức", "Gia", "Thành", "Hữu", "Tuấn", "Nhật"];
const FEMALE_GIVEN = ["Anh", "Trang", "Linh", "Hà", "Vy", "Ngân", "Thảo", "Hương", "Nhi", "My", "Quỳnh", "Yến", "Tâm", "Hạnh", "Uyên", "Châu"];
const MALE_GIVEN = ["Huy", "Khoa", "Nam", "Phúc", "Long", "Tùng", "Bảo", "Duy", "Khang", "Quân", "Thịnh", "Hiếu", "Tài", "Sơn", "Đạt", "Vinh"];

export type MockGender = "female" | "male";

export function mockPersonName(seed: number) {
  const random = createRandom(seed * 7919 + 17);
  const gender: MockGender = random() < 0.58 ? "female" : "male";
  const middle = pickOne(random, gender === "female" ? FEMALE_MIDDLE : MALE_MIDDLE);
  const given = pickOne(random, gender === "female" ? FEMALE_GIVEN : MALE_GIVEN);
  return { fullName: `${pickOne(random, FAMILY_NAMES)} ${middle} ${given}`, gender };
}

export const MOCK_MAJORS = [
  { code: "104", short: "CNTT", name: "Công nghệ thông tin", faculty: "Khoa Công nghệ Thông tin" },
  { code: "101", short: "TOAN", name: "Sư phạm Toán học", faculty: "Khoa Toán - Tin học" },
  { code: "601", short: "VAN", name: "Sư phạm Ngữ văn", faculty: "Khoa Ngữ văn" },
  { code: "751", short: "ANH", name: "Ngôn ngữ Anh", faculty: "Khoa Tiếng Anh" },
  { code: "102", short: "LY", name: "Sư phạm Vật lý", faculty: "Khoa Vật lý" },
  { code: "611", short: "TLH", name: "Tâm lý học", faculty: "Khoa Tâm lý học" },
] as const;

export const MOCK_COHORTS = [48, 49, 50, 51] as const;

export type MockStudentIdentity = {
  id: string;
  index: number;
  code: string;
  fullName: string;
  gender: MockGender;
  cohort: number;
  majorCode: string;
  majorName: string;
  faculty: string;
  className: string;
};

export function mockStudentIdentity(index: number): MockStudentIdentity {
  const major = MOCK_MAJORS[index % MOCK_MAJORS.length];
  const cohort = MOCK_COHORTS[Math.floor(index / MOCK_MAJORS.length) % MOCK_COHORTS.length];
  const sequence = Math.floor(index / (MOCK_MAJORS.length * MOCK_COHORTS.length)) + 1;
  const { fullName, gender } = mockPersonName(index + 1000);
  return {
    id: `sv-${index}`,
    index,
    code: `${cohort}01${major.code}${String(sequence * 7 + (index % 5)).padStart(3, "0")}`,
    fullName,
    gender,
    cohort,
    majorCode: major.code,
    majorName: major.name,
    faculty: major.faculty,
    className: `${cohort}.01.${major.short}.${sequence % 2 === 0 ? "B" : "A"}`,
  };
}

const LECTURER_TITLES = ["ThS.", "TS.", "ThS.", "PGS.TS.", "TS.", "ThS."] as const;

export type MockLecturerIdentity = {
  id: string;
  index: number;
  code: string;
  fullName: string;
  title: string;
  displayName: string;
  gender: MockGender;
  faculty: string;
};

export function mockLecturerIdentity(index: number): MockLecturerIdentity {
  const major = MOCK_MAJORS[index % MOCK_MAJORS.length];
  const { fullName, gender } = mockPersonName(index + 50);
  const title = LECTURER_TITLES[index % LECTURER_TITLES.length];
  return {
    id: `gv-${index}`,
    index,
    code: `GV${major.code}${String(index + 11).padStart(3, "0")}`,
    fullName,
    title,
    displayName: `${title} ${fullName}`,
    gender,
    faculty: major.faculty,
  };
}
