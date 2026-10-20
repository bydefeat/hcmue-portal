import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import Module from "node:module";
import { after, before, describe, test } from "node:test";
import { inflateSync } from "node:zlib";
import { serializeSignedCookie } from "better-call";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { buildPdf, buildTablePdf, isNumericColumn } from "@/shared/libs/pdf.lib";
import { base64ToBytes } from "@/shared/libs/spreadsheet.lib";
import { roleAssignments, roles } from "@/modules/access/access.schema";
import { AUTH_COOKIE_PREFIX } from "@/modules/authentication/authentication.constant";
import { session, user } from "@/modules/authentication/authentication.schema";
import { receiptVerificationCode } from "@/modules/course-registration/course-registration.rule";
import { classSections, terms } from "@/modules/course-registration/course-registration.schema";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { gradeSheets } from "@/modules/grades/grades.schema";
import { reportExports } from "@/modules/settings/settings.schema";
import { auditLogs } from "@/modules/audit/audit.schema";
import { deleteFiles, newStorageKey, putFile } from "@/shared/libs/storage.lib";
import { newId } from "@/shared/libs/id.lib";
import { buildReportFile } from "@/modules/settings/settings.lib";
import { administrativeClasses, lecturers, studentDecisions, students } from "@/modules/users/users.schema";
// Chỉ lấy kiểu: các module này nạp động sau khi dựng môi trường request của Next (xem bên dưới).
import type * as GradesAction from "@/modules/grades/grades.action";
import type * as RegistrationAction from "@/modules/course-registration/course-registration.action";
import type * as RegistrationQuery from "@/modules/course-registration/course-registration.query";
import type * as SettingsAction from "@/modules/settings/settings.action";
import type * as SettingsQuery from "@/modules/settings/settings.query";
import type * as UsersAction from "@/modules/users/users.action";

// ---------- Môi trường request của Next cho test ----------
// Server action, query đọc phiên qua headers()/cookies() của Next và chặn bằng forbidden(). Test chạy bằng tsx (không qua Next) nên
// dựng lại những gì server Next có: AsyncLocalStorage toàn cục, cờ authInterrupts (next.config.ts bật), bản react-server của
// next/navigation. Module của Next và các action nạp động (import()) sau bước này.
Object.assign(globalThis, { AsyncLocalStorage });
Object.assign(process.env, { __NEXT_EXPERIMENTAL_AUTH_INTERRUPTS: "true" });
const resolveFilename = Reflect.get(Module, "_resolveFilename") as (request: string, ...rest: unknown[]) => string;
Reflect.set(Module, "_resolveFilename", function (this: unknown, request: string, ...rest: unknown[]) {
  return resolveFilename.call(this, request === "next/navigation" ? "next/dist/client/components/navigation.react-server.js" : request, ...rest);
});

const createdSessions: string[] = [];

// Phiên tạo thẳng trong DB (không qua đăng nhập để không đổi last_sign_in_at của tài khoản seed), cookie ký như better-auth.
async function sessionCookieOf(userId: string) {
  const token = randomBytes(24).toString("base64url");
  const [row] = await db.insert(session).values({ userId, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).returning({ id: session.id });
  createdSessions.push(row.id);
  const signed = await serializeSignedCookie(`${AUTH_COOKIE_PREFIX}.session_token`, token, env.DEFEAT_BETTER_AUTH_SESSION_SIGNING_SECRET_KEY);
  return signed.split(";")[0];
}

async function asRequestOf() {
  const [{ workAsyncStorage }, { workUnitAsyncStorage }, { RequestCookies }] = await Promise.all([
    import("next/dist/server/app-render/work-async-storage.external.js"),
    import("next/dist/server/app-render/work-unit-async-storage.external.js"),
    import("next/dist/server/web/spec-extension/cookies.js"),
  ]);
  return <T>(cookie: string, run: () => Promise<T>): Promise<T> => {
    const headers = new Headers({ cookie });
    const workStore = { route: "/test", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false } as never;
    const requestStore = { type: "request", phase: "render", headers, cookies: new RequestCookies(headers), implicitTags: { tags: [] } } as never;
    return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(requestStore, run));
  };
}

// ---------- Trích chữ từ PDF ----------
// Đủ cho định dạng pdfkit ghi (font Type0 Identity-H, bảng ToUnicode), không phải bộ đọc PDF tổng quát. Mỗi khối BT...ET là một dòng.
type PdfObject = { dict: string; stream: Buffer | null };

// Đọc tuần tự từng "N 0 obj": luồng dữ liệu cắt đúng /Length byte (dữ liệu font nhị phân có thể chứa chữ "endobj").
function readObjects(bytes: Uint8Array) {
  const source = Buffer.from(bytes).toString("latin1");
  const objects = new Map<number, PdfObject>();
  const header = /(\d+) 0 obj\s*/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(source))) {
    const bodyStart = header.lastIndex;
    const endobj = source.indexOf("endobj", bodyStart);
    const streamAt = source.indexOf("stream", bodyStart);
    if (streamAt < 0 || streamAt > endobj) {
      objects.set(Number(match[1]), { dict: source.slice(bodyStart, endobj), stream: null });
      header.lastIndex = endobj;
      continue;
    }
    const dict = source.slice(bodyStart, streamAt);
    const dataStart = source.indexOf("\n", streamAt) + 1;
    const length = Number(dict.match(/\/Length (\d+)/)?.[1] ?? 0);
    const data = Buffer.from(source.slice(dataStart, dataStart + length), "latin1");
    objects.set(Number(match[1]), { dict, stream: /\/FlateDecode/.test(dict) ? inflateSync(data) : data });
    header.lastIndex = source.indexOf("endobj", dataStart + length);
  }
  return objects;
}

function utf16(hex: string) {
  const units: number[] = [];
  for (let index = 0; index < hex.length; index += 4) units.push(parseInt(hex.slice(index, index + 4), 16));
  return String.fromCharCode(...units);
}

function parseToUnicode(cmap: string) {
  const map = new Map<number, string>();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(entry[1], 16), utf16(entry[2]));
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const entry of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
      const start = parseInt(entry[1], 16);
      const end = parseInt(entry[2], 16);
      if (entry[3].startsWith("[")) {
        [...entry[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((value, offset) => map.set(start + offset, utf16(value[1])));
      } else {
        const first = parseInt(entry[3].slice(1, -1), 16);
        for (let code = start; code <= end; code++) map.set(code, String.fromCharCode(first + code - start));
      }
    }
  }
  return map;
}

function pdfPageCount(bytes: Uint8Array) {
  return [...readObjects(bytes).values()].filter((object) => /\/Type \/Page\b/.test(object.dict)).length;
}

function pdfText(bytes: Uint8Array) {
  const objects = readObjects(bytes);
  // Tên font trong trang (/F1...) → bảng mã của font đó.
  const fonts = new Map<string, Map<number, string>>();
  for (const object of objects.values()) {
    for (const font of object.dict.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const toUnicode = objects.get(Number(font[2]))?.dict.match(/\/ToUnicode (\d+) 0 R/);
      const cmap = toUnicode ? objects.get(Number(toUnicode[1]))?.stream : null;
      if (cmap) fonts.set(font[1], parseToUnicode(cmap.toString("latin1")));
    }
  }
  const pages = [...objects.values()].filter((object) => /\/Type \/Page\b/.test(object.dict));
  const lines: string[] = [];
  for (const page of pages) {
    for (const reference of page.dict.match(/\/Contents (\d+) 0 R/)?.slice(1) ?? []) {
      const content = objects.get(Number(reference))?.stream?.toString("latin1") ?? "";
      let font = new Map<number, string>();
      for (const block of content.matchAll(/BT([\s\S]*?)ET/g)) {
        let line = "";
        for (const token of block[1].matchAll(/\/(F\d+) [\d.]+ Tf|<([0-9a-fA-F]*)>/g)) {
          if (token[1]) font = fonts.get(token[1]) ?? new Map();
          else for (let index = 0; index < token[2].length; index += 4) line += font.get(parseInt(token[2].slice(index, index + 4), 16)) ?? "";
        }
        lines.push(line);
      }
    }
  }
  return lines.join("\n");
}

const FORBIDDEN = "NEXT_HTTP_ERROR_FALLBACK;403";

function mediaBox(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("latin1").match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!.slice(1).map(Number);
}

const flat = (text: string) => text.replace(/\s+/g, " ");

function readPdf(result: { ok: boolean; data?: { base64: string } | { content: string } }) {
  assert.ok(result.ok, JSON.stringify(result));
  const data = result.data!;
  const bytes = base64ToBytes("base64" in data ? data.base64 : data.content);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-");
  return { bytes, text: flat(pdfText(bytes)) };
}

// forbidden() của Next ném lỗi mang digest; so khớp digest thay vì thông điệp.
async function expectForbidden(run: () => Promise<unknown>) {
  const error = await run().then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.equal(error && typeof error === "object" && "digest" in error ? error.digest : null, FORBIDDEN);
}

describe("pdf.lib: dựng tài liệu PDF tiếng Việt", () => {
  test("bảng nhiều trang: tệp PDF hợp lệ, đủ dòng, đúng chữ có dấu, lặp tiêu đề cột và đánh số trang", async () => {
    const rows = Array.from({ length: 90 }, (_, index) => [`SV${String(index + 1).padStart(3, "0")}`, `Nguyễn Thị Ngọc Ánh ${index + 1}`, "Khoa Ngữ văn", (index % 10) + 0.5, `${index},5%`]);
    const bytes = await buildTablePdf({
      title: "Danh sách kiểm tra",
      subtitle: "Học kỳ 1, năm học 2026-2027",
      header: ["Mã", "Họ và tên đầy đủ", "Khoa", "Điểm", "Tỉ lệ"],
      rows: [...rows, ["Đặc biệt", "Lê Thị Huyền Trang ếữặĐ đường dài cần xuống dòng trong ô vì quá nhiều chữ so với độ rộng cột", "Khoa Toán - Tin học", 10, "100%"]],
    });
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-");
    const text = flat(pdfText(bytes));
    for (const phrase of ["TRƯỜNG ĐẠI HỌC SƯ PHẠM THÀNH PHỐ HỒ CHÍ MINH", "DANH SÁCH KIỂM TRA", "Học kỳ 1, năm học 2026-2027", "Ngày xuất:", "ếữặĐ", "Trường Đại học Sư phạm Thành phố Hồ Chí Minh"]) {
      assert.ok(text.includes(phrase), `thiếu "${phrase}"`);
    }
    for (let index = 1; index <= 90; index++) assert.ok(text.includes(`SV${String(index).padStart(3, "0")} Nguyễn Thị Ngọc Ánh ${index} `), `thiếu dòng ${index}`);
    const pages = pdfPageCount(bytes);
    assert.ok(pages >= 2);
    // Hàng tiêu đề lặp lại ở mỗi trang, chân trang ghi "Trang x/y".
    assert.equal(text.split("Họ và tên đầy đủ").length - 1, pages);
    for (let page = 1; page <= pages; page++) assert.ok(text.includes(`Trang ${page}/${pages}`));
  });

  test("bảng nhiều cột chuyển khổ ngang; cột số nhận cả số kiểu Việt Nam", async () => {
    const wide = await buildTablePdf({ title: "Rộng", header: ["A", "B", "C", "D", "E", "F", "G"], rows: [["1", "2", "3", "4", "5", "6", "7"]] });
    const narrow = await buildTablePdf({ title: "Hẹp", header: ["A", "B"], rows: [] });
    assert.ok(mediaBox(wide)[0] > mediaBox(wide)[1]);
    assert.ok(mediaBox(narrow)[0] < mediaBox(narrow)[1]);
    assert.ok(flat(pdfText(narrow)).includes("Không có dữ liệu."));
    assert.ok(isNumericColumn([[1], ["8,5"], [null], ["12,5%"]], 0));
    assert.ok(!isNumericColumn([["50.01.104.009"], [3]], 0));
  });

  test("văn bản có quốc hiệu, số văn bản, đoạn in đậm một phần và khối ký", async () => {
    const bytes = await buildPdf({
      title: "Quyết định",
      parent: "Bộ Giáo dục và Đào tạo",
      reference: "Số: 1301/QĐ-ĐHSP",
      motto: true,
      dateLine: "TP. Hồ Chí Minh, ngày 20/10/2026",
      hideExportedAt: true,
      blocks: [
        { type: "paragraph", text: [{ text: "Điều 1. ", bold: true }, { text: "Cho phép sinh viên bảo lưu kết quả học tập." }] },
        { type: "signature", lines: ["KT. HIỆU TRƯỞNG"], name: "Trần Minh Khoa" },
      ],
    });
    const text = flat(pdfText(bytes));
    for (const phrase of ["BỘ GIÁO DỤC VÀ ĐÀO TẠO", "Số: 1301/QĐ-ĐHSP", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", "Độc lập - Tự do - Hạnh phúc", "Điều 1. Cho phép sinh viên bảo lưu", "KT. HIỆU TRƯỞNG", "Trần Minh Khoa"]) {
      assert.ok(text.includes(phrase), `thiếu "${phrase}"`);
    }
    assert.ok(!text.includes("Ngày xuất"));
  });
});

describe("pdf: server action tải PDF kiểm quyền như trang", () => {
  const ids = { secretaryUserId: "", reportJobId: "" };
  let student: { id: string; userId: string; code: string; fullName: string; faculty: string };
  let otherStudent: { id: string; faculty: string };
  let otherFacultyStudent: { id: string };
  let lecturer: { id: string; userId: string };
  let adminUserId: string;
  let cookies: { student: string; lecturer: string; admin: string; secretary: string };
  let asRequest: Awaited<ReturnType<typeof asRequestOf>>;
  let grades: typeof GradesAction;
  let registration: typeof RegistrationAction;
  let registrationQuery: typeof RegistrationQuery;
  let settings: typeof SettingsAction;
  let settingsQuery: typeof SettingsQuery;
  let users: typeof UsersAction;

  before(async () => {
    [asRequest, grades, registration, registrationQuery, settings, settingsQuery, users] = await Promise.all([
      asRequestOf(),
      import("@/modules/grades/grades.action"),
      import("@/modules/course-registration/course-registration.action"),
      import("@/modules/course-registration/course-registration.query"),
      import("@/modules/settings/settings.action"),
      import("@/modules/settings/settings.query"),
      import("@/modules/users/users.action"),
    ]);
    const studentRows = await db
      .select({ id: students.id, userId: students.userId, code: students.code, fullName: students.fullName, faculty: faculties.name })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(eq(students.code, "5001104009"));
    student = { ...studentRows[0], userId: studentRows[0].userId! };
    const [other] = await db
      .select({ id: students.id, faculty: faculties.name })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(and(ne(students.id, student.id), eq(faculties.name, student.faculty)))
      .limit(1);
    otherStudent = other;
    const [outside] = await db
      .select({ id: students.id })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(ne(faculties.name, student.faculty))
      .limit(1);
    otherFacultyStudent = outside;
    const [lecturerRow] = await db.select({ id: lecturers.id, userId: lecturers.userId }).from(lecturers).where(eq(lecturers.email, "hanhpt@hcmue.edu.vn"));
    lecturer = { id: lecturerRow.id, userId: lecturerRow.userId! };
    const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, "khoatm@hcmue.edu.vn"));
    adminUserId = admin.id;

    // Giáo vụ khoa (phạm vi khoa của sinh viên mẫu): có quyền xem sinh viên, xem báo cáo; không có quyền quyết định.
    const [secretary] = await db.insert(user).values({ name: "Giáo vụ thử PDF", email: `pdf-test-${Date.now()}@hcmue.edu.vn`, role: "admin" }).returning({ id: user.id });
    ids.secretaryUserId = secretary.id;
    const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "faculty-secretary"));
    const [faculty] = await db.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, student.faculty));
    await db.insert(roleAssignments).values({ userId: secretary.id, roleId: role.id, facultyId: faculty.id });

    cookies = {
      student: await sessionCookieOf(student.userId),
      lecturer: await sessionCookieOf(lecturer.userId),
      admin: await sessionCookieOf(adminUserId),
      secretary: await sessionCookieOf(secretary.id),
    };

    // Tệp báo cáo dựng như action xuất (buildReportFile) và lưu vào kho; tải về phải trả đúng tệp đã lưu. Action xuất gọi
    // revalidatePath nên không chạy được ngoài Next.
    const [term] = await db.select({ id: terms.id, name: terms.name }).from(terms).where(eq(terms.isCurrent, true));
    const table = (await asRequest(cookies.admin, () => settingsQuery.getReportTable("registration", term.id, "all")))!;
    const file = await buildReportFile(table, { title: "Tỉ lệ đăng ký học phần", subtitle: `${term.name} · Toàn trường` }, "pdf");
    const jobId = newId();
    const storageKey = newStorageKey("reports", jobId);
    await putFile(storageKey, file.data);
    await db.insert(reportExports).values({
      id: jobId,
      reportKey: "registration",
      params: { termId: term.id, faculty: "all", format: "pdf" },
      status: "done",
      rowCount: table.rows.length,
      storageKey,
      fileName: "registration-test.pdf",
      contentType: file.contentType,
      sizeBytes: file.data.byteLength,
      finishedAt: new Date(),
      requestedByUserId: adminUserId,
    });
    ids.reportJobId = jobId;
  });

  after(async () => {
    if (createdSessions.length > 0) await db.delete(session).where(inArray(session.id, createdSessions));
    if (ids.reportJobId) {
      const removed = await db.delete(reportExports).where(eq(reportExports.id, ids.reportJobId)).returning({ storageKey: reportExports.storageKey });
      await deleteFiles(removed.flatMap((row) => (row.storageKey ? [row.storageKey] : [])));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, ids.reportJobId));
    }
    if (ids.secretaryUserId) {
      await db.delete(roleAssignments).where(eq(roleAssignments.userId, ids.secretaryUserId));
      await db.delete(user).where(eq(user.id, ids.secretaryUserId));
    }
    await db.$client.end();
  });

  test("sinh viên tải bảng điểm của chính mình; gọi action của cán bộ, giảng viên thì bị chặn", async () => {
    const { text } = readPdf(await asRequest(cookies.student, () => grades.downloadOwnTranscriptPdf()));
    assert.ok(text.includes("BẢNG ĐIỂM HỌC TẬP"));
    assert.ok(text.includes(student.fullName));
    assert.ok(text.includes("50.01.104.009"));
    assert.ok(text.includes("Xếp loại:"));
    await expectForbidden(() => asRequest(cookies.student, () => grades.downloadStudentTranscriptPdf(otherStudent.id)));
    await expectForbidden(() => asRequest(cookies.student, () => grades.exportGradeSheetPdf(otherStudent.id)));
    await expectForbidden(() => asRequest(cookies.lecturer, () => grades.downloadOwnTranscriptPdf()));
  });

  test("phiếu đăng ký PDF có đủ lớp đang học và đúng mã xác thực như trang", async () => {
    const result = await asRequest(cookies.student, () => registration.downloadRegistrationReceiptPdf());
    const { text } = readPdf(result);
    assert.ok(result.ok && result.data.fileName.endsWith(".pdf"));
    assert.ok(text.includes("PHIẾU ĐĂNG KÝ HỌC PHẦN"));
    const [term] = await db.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true));
    const sections = await asRequest(cookies.student, async () =>
      (await registrationQuery.getStudentEnrollments(student.id, term.id)).map(({ section }) => section).toSorted((a, b) => a.code.localeCompare(b.code)),
    );
    assert.ok(sections.length > 0);
    for (const section of sections) assert.ok(text.includes(section.code), `thiếu lớp ${section.code}`);
    assert.ok(text.includes(`Mã xác thực ${receiptVerificationCode(student.id, term.id, sections.map((section) => section.id))}`));
    await expectForbidden(() => asRequest(cookies.lecturer, () => registration.downloadRegistrationReceiptPdf()));
  });

  test("giảng viên tải danh sách lớp mình dạy, không tải được lớp của người khác", async () => {
    const [own] = await db.select({ id: classSections.id, code: classSections.code }).from(classSections).where(eq(classSections.lecturerId, lecturer.id)).limit(1);
    const { text } = readPdf(await asRequest(cookies.lecturer, () => registration.exportClassRosterPdf(own.id)));
    const roster = await asRequest(cookies.lecturer, () => registrationQuery.getClassRoster(own.id));
    assert.ok(text.includes("DANH SÁCH LỚP HỌC PHẦN"));
    assert.ok(text.includes(`Sĩ số: ${roster.length}`));
    for (const entry of roster) assert.ok(text.includes(entry.studentCode), `thiếu ${entry.studentCode}`);
    const [others] = await db.select({ id: classSections.id }).from(classSections).where(ne(classSections.lecturerId, lecturer.id)).limit(1);
    const denied = await asRequest(cookies.lecturer, () => registration.exportClassRosterPdf(others.id));
    assert.ok(!denied.ok);
    await expectForbidden(() => asRequest(cookies.student, () => registration.exportClassRosterPdf(own.id)));
  });

  test("bảng điểm lớp PDF chỉ khi đã chốt và chỉ lớp mình dạy", async () => {
    const sheets = await db
      .select({ id: classSections.id, code: classSections.code, status: gradeSheets.status, lecturerId: classSections.lecturerId })
      .from(gradeSheets)
      .innerJoin(classSections, eq(classSections.id, gradeSheets.classSectionId));
    const locked = sheets.find((sheet) => sheet.lecturerId === lecturer.id && ["locked", "approved", "published"].includes(sheet.status))!;
    const draft = sheets.find((sheet) => sheet.lecturerId === lecturer.id && ["draft", "returned"].includes(sheet.status))!;
    const foreign = sheets.find((sheet) => sheet.lecturerId !== lecturer.id)!;
    const { text } = readPdf(await asRequest(cookies.lecturer, () => grades.exportGradeSheetPdf(locked.id)));
    assert.ok(text.includes("BẢNG ĐIỂM LỚP HỌC PHẦN"));
    assert.ok(text.includes(locked.code));
    assert.ok(text.includes("GIẢNG VIÊN"));
    const notLocked = await asRequest(cookies.lecturer, () => grades.exportGradeSheetPdf(draft.id));
    assert.ok(!notLocked.ok && notLocked.message.includes("chưa chốt"));
    await expectForbidden(() => asRequest(cookies.lecturer, () => grades.exportGradeSheetPdf(foreign.id)));
  });

  test("cán bộ tải bảng điểm sinh viên trong phạm vi khoa; khoa khác bị chặn", async () => {
    const { text } = readPdf(await asRequest(cookies.secretary, () => grades.downloadStudentTranscriptPdf(student.id)));
    assert.ok(text.includes(student.fullName));
    readPdf(await asRequest(cookies.admin, () => grades.downloadStudentTranscriptPdf(otherFacultyStudent.id)));
    await expectForbidden(() => asRequest(cookies.secretary, () => grades.downloadStudentTranscriptPdf(otherFacultyStudent.id)));
  });

  test("báo cáo xuất PDF: đủ dòng của bảng dữ liệu; cán bộ theo khoa không tải được báo cáo toàn trường", async () => {
    const result = await asRequest(cookies.admin, () => settings.downloadReportExport(ids.reportJobId));
    assert.ok(result.ok && result.data.mimeType === "application/pdf" && result.data.fileName.endsWith(".pdf") && result.data.encoding === "base64");
    const { text } = readPdf(result);
    const [term] = await db.select({ id: terms.id, name: terms.name }).from(terms).where(eq(terms.isCurrent, true));
    const table = (await asRequest(cookies.admin, () => settingsQuery.getReportTable("registration", term.id, "all")))!;
    assert.ok(text.includes("TỈ LỆ ĐĂNG KÝ HỌC PHẦN"));
    assert.ok(text.includes(`${term.name} · Toàn trường`));
    assert.ok(table.rows.length > 0);
    for (const row of table.rows) assert.ok(text.includes(String(row[0])), `thiếu lớp ${String(row[0])}`);
    const denied = await asRequest(cookies.secretary, () => settings.downloadReportExport(ids.reportJobId));
    assert.ok(!denied.ok && denied.message.includes("khoa mình"));
  });

  test("quyết định PDF theo quyền quản lý quyết định", async () => {
    const [decision] = await db.select({ id: studentDecisions.id, number: studentDecisions.number, status: studentDecisions.status }).from(studentDecisions).where(eq(studentDecisions.status, "signed")).limit(1);
    const { text } = readPdf(await asRequest(cookies.admin, () => users.downloadDecisionPdf(decision.id)));
    assert.ok(text.includes("QUYẾT ĐỊNH"));
    assert.ok(text.includes(`Số: ${decision.number}`));
    assert.ok(text.includes("Điều 1."));
    assert.ok(!text.includes("không có giá trị thi hành"));
    const [draft] = await db.select({ id: studentDecisions.id }).from(studentDecisions).where(inArray(studentDecisions.status, ["draft", "pending-signature"])).limit(1);
    assert.ok(flat(pdfText(readPdf(await asRequest(cookies.admin, () => users.downloadDecisionPdf(draft.id))).bytes)).includes("không có giá trị thi hành"));
    await expectForbidden(() => asRequest(cookies.secretary, () => users.downloadDecisionPdf(decision.id)));
    await expectForbidden(() => asRequest(cookies.student, () => users.downloadDecisionPdf(decision.id)));
  });
});
