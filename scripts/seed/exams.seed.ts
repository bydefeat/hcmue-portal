import { and, asc, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { mockId, mockLecturerIdentity } from "@/shared/libs/mock.lib";
import { deleteFiles, listFiles, newStorageKey, putFile } from "@/shared/libs/storage.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { PROCTORS_PER_ROOM } from "@/modules/exams/exams.constant";
import { EXAM_DEFERRAL_SEED, EXAM_SESSIONS, EXAM_SWAP_SEED, type ExamSeed } from "@/modules/exams/exams.mock";
import { assignCandidates, byVietnameseName, slotsOverlap } from "@/modules/exams/exams.rule";
import { examCandidates, examDeferrals, examProctors, examProctorSwapRequests, examSessionRooms, examSessions } from "@/modules/exams/exams.schema";
import type { ExamPaperFileKind } from "@/modules/exams/exams.type";
import { lecturers, students } from "@/modules/users/users.schema";
import type { SeedContext } from "./context";
import { samplePdf } from "./sample-file";

function samplePaper(exam: ExamSeed, kind: ExamPaperFileKind) {
  const meta = exam.papers.find((paper) => paper.kind === kind);
  if (!meta) return null;
  return { fileName: meta.fileName, data: samplePdf(meta.fileName), key: newStorageKey("exams", mockId(`exam-paper:${exam.id}:${kind}`)) };
}

type Placed = { exam: ExamSeed; roomIds: string[]; proctorIds: string[] };

export async function seedExams(tx: Transaction, context: SeedContext) {
  const files = EXAM_SESSIONS.map((exam) => ({ paper: samplePaper(exam, "paper"), answerKey: samplePaper(exam, "answer-key") }));
  await deleteFiles((await listFiles("exams")).map((entry) => entry.key));
  await Promise.all(files.flatMap(({ paper, answerKey }) => [paper, answerKey]).filter((file) => file !== null).map((file) => putFile(file.key, file.data)));
  await tx.insert(examSessions).values(
    EXAM_SESSIONS.map((exam, index) => {
      const isSubmitted = exam.paperStatus !== "not-submitted";
      const deadline = dayjs(exam.paperDeadline);
      const { paper, answerKey } = files[index];
      const submittedAt = isSubmitted ? new Date(Math.min(deadline.subtract(2, "day").valueOf(), dayjs().subtract(1, "hour").valueOf())) : null;
      const reviewedAt = submittedAt && exam.paperReview ? new Date(Math.min(submittedAt.valueOf() + 24 * 60 * 60 * 1000, dayjs().subtract(10, "minute").valueOf())) : null;
      return {
        id: exam.id,
        termId: exam.termId,
        classSectionId: exam.classSectionId,
        kind: exam.kind,
        makeupOfId: exam.makeupOfId,
        format: exam.format,
        date: exam.date,
        startTime: exam.startTime,
        durationMinutes: exam.durationMinutes,
        status: exam.status,
        paperStatus: exam.paperStatus,
        paperDeadline: deadline.toDate(),
        paperStorageKey: paper?.key ?? null,
        paperFileName: paper?.fileName ?? null,
        paperContentType: paper ? "application/pdf" : null,
        paperSizeBytes: paper?.data.byteLength ?? null,
        answerKeyStorageKey: answerKey?.key ?? null,
        answerKeyFileName: answerKey?.fileName ?? null,
        answerKeyContentType: answerKey ? "application/pdf" : null,
        answerKeySizeBytes: answerKey?.data.byteLength ?? null,
        paperSubmittedAt: submittedAt,
        paperReviewedByUserId: reviewedAt ? context.adminUserId : null,
        paperReviewedAt: reviewedAt,
        paperReturnReason: exam.paperReview?.returnReason ?? null,
      };
    }),
  );

  const sectionIds = [...new Set(EXAM_SESSIONS.map((exam) => exam.classSectionId))];
  const roster = await tx
    .select({ enrollmentId: enrollments.id, classSectionId: enrollments.classSectionId, studentId: enrollments.studentId, fullName: students.fullName, code: students.code })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(inArray(enrollments.classSectionId, sectionIds), eq(enrollments.status, "enrolled")))
    .orderBy(asc(students.code));
  const deferredRow = roster.filter((row) => row.classSectionId === EXAM_DEFERRAL_SEED.classSectionId)[EXAM_DEFERRAL_SEED.rosterIndex];
  await tx.insert(examDeferrals).values({
    id: EXAM_DEFERRAL_SEED.id,
    enrollmentId: deferredRow.enrollmentId,
    kind: EXAM_DEFERRAL_SEED.kind,
    reason: EXAM_DEFERRAL_SEED.reason,
    decidedByUserId: context.adminUserId,
  });
  const candidatesOf = (exam: ExamSeed) => {
    if (exam.kind === "makeup") return [deferredRow];
    const own = roster.filter((row) => row.classSectionId === exam.classSectionId);
    return exam.kind === EXAM_DEFERRAL_SEED.kind && exam.classSectionId === EXAM_DEFERRAL_SEED.classSectionId ? own.filter((row) => row !== deferredRow) : own;
  };

  const sections = await tx
    .select({ id: classSections.id, lecturerId: classSections.lecturerId, facultyId: courses.facultyId })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(inArray(classSections.id, sectionIds));
  const sectionOf = new Map(sections.map((section) => [section.id, section]));
  const staff = (await tx.select({ id: lecturers.id, facultyId: lecturers.facultyId, status: lecturers.status }).from(lecturers).orderBy(asc(lecturers.code))).filter(
    (person) => person.status === "active",
  );
  const roomByCode = context.roomByCode;
  const usable = [...roomByCode.values()].filter((room) => room.status === "active").toSorted((a, b) => b.examCapacity - a.examCapacity);
  const currentLecturer = mockLecturerIdentity(0).id;
  const load = new Map<string, number>();
  const placed: Placed[] = [];
  const ordered = EXAM_SESSIONS.toSorted((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  for (const exam of ordered) {
    const overlapping = placed.filter((entry) => slotsOverlap(entry.exam, exam));
    const takenRooms = new Set(overlapping.flatMap((entry) => entry.roomIds));
    const takenPeople = new Set(overlapping.flatMap((entry) => entry.proctorIds));
    const needed = candidatesOf(exam).length;
    const preferred = exam.preferredRooms.map((code) => roomByCode.get(code)!).filter((room) => room.status === "active");
    const options = [...preferred, ...usable.filter((room) => !preferred.includes(room))].filter((room) => !takenRooms.has(room.id));
    const chosen: typeof options = [];
    for (const room of options) {
      if (chosen.reduce((sum, entry) => sum + entry.examCapacity, 0) >= Math.max(needed, 1)) break;
      chosen.push(room);
    }
    const section = sectionOf.get(exam.classSectionId)!;
    const pool = staff
      .filter((person) => person.id !== section.lecturerId && !takenPeople.has(person.id))
      .toSorted(
        (a, b) =>
          Number(b.id === currentLecturer && exam.featureCurrentLecturer) - Number(a.id === currentLecturer && exam.featureCurrentLecturer) ||
          Number(b.facultyId === section.facultyId) - Number(a.facultyId === section.facultyId) ||
          (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0),
      )
      .filter((person) => person.id !== currentLecturer || exam.featureCurrentLecturer);
    const proctorIds = pool.slice(0, chosen.length * PROCTORS_PER_ROOM).map((person) => person.id);
    for (const id of proctorIds) load.set(id, (load.get(id) ?? 0) + 1);
    placed.push({ exam, roomIds: chosen.map((room) => room.id), proctorIds });
  }

  const roomRows = placed.flatMap((entry) => entry.roomIds.map((roomId, index) => ({ id: mockId(`exam-room:${entry.exam.id}:${index + 1}`), examSessionId: entry.exam.id, roomId, position: index + 1 })));
  await tx.insert(examSessionRooms).values(roomRows);
  const proctorRows = placed.flatMap((entry) =>
    entry.proctorIds.map((lecturerId, index) => ({ examSessionId: entry.exam.id, lecturerId, examRoomId: mockId(`exam-room:${entry.exam.id}:${Math.floor(index / PROCTORS_PER_ROOM) + 1}`) })),
  );
  await tx.insert(examProctors).values(proctorRows);
  const candidateRows = placed.flatMap((entry) => {
    const roomsOfExam = entry.roomIds.map((roomId, index) => ({ id: mockId(`exam-room:${entry.exam.id}:${index + 1}`), examCapacity: [...roomByCode.values()].find((room) => room.id === roomId)!.examCapacity }));
    const plan = assignCandidates(candidatesOf(entry.exam).toSorted(byVietnameseName), roomsOfExam);
    if (!plan.ok) throw new Error(`Seed: ca ${entry.exam.classCode} thiếu chỗ ngồi thi`);
    return plan.assigned.map((seat) => ({ examSessionId: entry.exam.id, enrollmentId: seat.candidate.enrollmentId, examRoomId: seat.roomId, candidateNumber: seat.candidateNumber }));
  });
  for (let start = 0; start < candidateRows.length; start += 1000) await tx.insert(examCandidates).values(candidateRows.slice(start, start + 1000));

  const upcoming = placed.find((entry) => entry.proctorIds.includes(currentLecturer) && entry.exam.status === "published");
  if (upcoming) {
    const me = staff.find((person) => person.id === currentLecturer)!;
    const busy = new Set(placed.filter((entry) => slotsOverlap(entry.exam, upcoming.exam)).flatMap((entry) => entry.proctorIds));
    const colleague = staff.find((person) => person.facultyId === me.facultyId && person.id !== me.id && !busy.has(person.id));
    if (colleague) {
      await tx.insert(examProctorSwapRequests).values({ id: EXAM_SWAP_SEED.id, examSessionId: upcoming.exam.id, requesterId: me.id, substituteId: colleague.id, reason: EXAM_SWAP_SEED.reason });
    }
  }
  return { sessions: EXAM_SESSIONS.length, proctors: proctorRows.length, candidates: candidateRows.length };
}
