import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { courses, majors, programs } from "@/modules/curriculum/curriculum.schema";
import { buildTranscript, computeStanding, type TranscriptTermInput } from "@/modules/grades/grades.rule";
import { courseResults } from "@/modules/grades/grades.schema";
import type { LetterGrade } from "@/modules/grades/grades.type";
import { GRADUATING_COHORT, GRADUATION_CONSTRAINT_MESSAGE, GRADUATION_MAX_REQUIRED_CREDITS } from "@/modules/graduation/graduation.constant";
import { evaluateGraduation, GRADUATION_APPROVE_SCHEMA } from "@/modules/graduation/graduation.rule";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import { administrativeClasses, students } from "@/modules/users/users.schema";
import type { GraduationInput } from "@/modules/graduation/graduation.type";

after(() => db.$client.end());

const eligible: GraduationInput = {
  studentId: "0192f3a4-0000-7000-8000-000000000000",
  languageCertificate: "VSTEP B1",
  itCertificate: "IC3",
  tuitionCleared: true,
  disciplineFree: true,
  code: "48.01.104.007",
  fullName: "Sinh viên mẫu",
  className: "48.01.CNTT.A",
  faculty: "Khoa Công nghệ Thông tin",
  majorName: "Công nghệ thông tin",
  earnedCredits: 130,
  requiredCredits: 130,
  cpa4: 3.25,
  failedCredits: 0,
  alreadyGraduated: false,
  isApproved: false,
};

describe("graduation: xét điều kiện", () => {
  test("đủ mọi điều kiện thì đủ điều kiện, xếp loại theo CPA", () => {
    const candidate = evaluateGraduation(eligible);
    assert.equal(candidate.status, "eligible");
    assert.equal(candidate.classification, "Giỏi");
    assert.ok(candidate.checks.every((check) => check.passed));
  });

  test("thiếu một điều kiện là chưa đủ, ghi rõ điều kiện chưa đạt", () => {
    const candidate = evaluateGraduation({ ...eligible, earnedCredits: 126, languageCertificate: null, tuitionCleared: false });
    assert.equal(candidate.status, "missing");
    assert.deepEqual(
      candidate.checks.filter((check) => !check.passed).map((check) => check.key),
      ["credits", "language", "tuition"],
    );
    assert.equal(evaluateGraduation({ ...eligible, cpa4: 1.99 }).status, "missing");
    assert.equal(evaluateGraduation({ ...eligible, failedCredits: 3 }).status, "missing");
  });

  test("đã được hội đồng công nhận hoặc đã tốt nghiệp thì giữ trạng thái đó", () => {
    assert.equal(evaluateGraduation({ ...eligible, isApproved: true }).status, "approved");
    assert.equal(evaluateGraduation({ ...eligible, alreadyGraduated: true, isApproved: true }).status, "graduated");
  });

  test("danh sách trình hội đồng phải có sinh viên, id hợp lệ, bỏ trùng", () => {
    assert.ok(!parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds: [] }).ok);
    assert.ok(!parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds: ["sv-1"] }).ok);
    const parsed = parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds: [eligible.studentId, eligible.studentId] });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.studentIds.length, 1);
  });
});

describe("graduation: ràng buộc ở DB", () => {
  test("hồ sơ đã công nhận phải có thời điểm quyết định", async () => {
    const [record] = await db.select().from(graduationRecords).where(eq(graduationRecords.status, "pending")).limit(1);
    const error = await db
      .update(graduationRecords)
      .set({ status: "approved" })
      .where(eq(graduationRecords.id, record.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, GRADUATION_CONSTRAINT_MESSAGE), GRADUATION_CONSTRAINT_MESSAGE.graduation_records_decided_fields);
  });
});

describe("graduation: dữ liệu mẫu khóa 48", () => {
  // Cùng cách tính với loadGraduationCandidates: CPA, tín chỉ, nợ từ course_results; tín chỉ yêu cầu theo chương trình đang áp dụng.
  test("mỗi ngành có sinh viên đủ điều kiện tốt nghiệp, khung đủ tín chỉ yêu cầu", async () => {
    const cohort = await db
      .select({ id: students.id, major: majors.name, majorId: majors.id, record: graduationRecords })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(graduationRecords, eq(graduationRecords.studentId, students.id))
      .where(and(eq(administrativeClasses.cohort, GRADUATING_COHORT), eq(students.status, "studying")));
    const rows = await db
      .select({
        studentId: courseResults.studentId,
        termId: courseResults.termId,
        termName: terms.name,
        isCurrent: terms.isCurrent,
        courseCode: courses.code,
        courseName: courses.name,
        credits: courses.credits,
        score10: courseResults.score10,
        letter: courseResults.letter,
        point4: courseResults.point4,
      })
      .from(courseResults)
      .innerJoin(courses, eq(courses.id, courseResults.courseId))
      .innerJoin(terms, eq(terms.id, courseResults.termId))
      .innerJoin(students, eq(students.id, courseResults.studentId))
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .where(eq(administrativeClasses.cohort, GRADUATING_COHORT))
      .orderBy(asc(terms.startDate));
    const active = await db.select({ majorId: programs.majorId, totalCredits: programs.totalCredits }).from(programs).where(eq(programs.status, "active"));
    const eligibleByMajor = new Map<string, number>();
    for (const student of cohort) {
      const byTerm = new Map<string, TranscriptTermInput>();
      for (const { studentId: _studentId, termId, termName, isCurrent, ...course } of rows.filter((row) => row.studentId === student.id)) {
        const term = byTerm.get(termId) ?? { termId, termName, isInProgress: isCurrent, courses: [] };
        byTerm.set(termId, term);
        term.courses.push({ ...course, letter: course.letter as LetterGrade | null });
      }
      const standing = computeStanding(student.id, buildTranscript([...byTerm.values()]));
      const program = active.find((entry) => entry.majorId === student.majorId)!;
      const candidate = evaluateGraduation({
        ...eligible,
        studentId: student.id,
        languageCertificate: student.record.languageCertificate,
        itCertificate: student.record.itCertificate,
        tuitionCleared: student.record.tuitionCleared,
        disciplineFree: student.record.disciplineFree,
        earnedCredits: standing.earnedCredits,
        requiredCredits: Math.min(program.totalCredits, GRADUATION_MAX_REQUIRED_CREDITS),
        cpa4: standing.cpa4,
        failedCredits: standing.failedCredits,
      });
      eligibleByMajor.set(student.major, (eligibleByMajor.get(student.major) ?? 0) + (candidate.status === "eligible" ? 1 : 0));
    }
    assert.equal(eligibleByMajor.size, 6);
    for (const [major, total] of eligibleByMajor) assert.ok(total > 0, `${major} không có sinh viên đủ điều kiện`);
  });
});
