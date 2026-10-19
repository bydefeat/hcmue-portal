import { mockDelay } from "@/shared/libs/mock-request.lib";
import { ADVISOR_ASSIGNMENTS, CURRENT_LECTURER_ID, CURRENT_STUDENT_ID, DECISIONS, LECTURERS, STUDENTS } from "@/modules/users/users.mock";

export async function getStudents() {
  await mockDelay();
  return STUDENTS;
}

export async function getStudent(id: string) {
  await mockDelay();
  return STUDENTS.find((student) => student.id === id) ?? null;
}

export async function getStudentsByIds(ids: string[]) {
  const wanted = new Set(ids);
  return STUDENTS.filter((student) => wanted.has(student.id));
}

export async function getLecturers() {
  await mockDelay();
  return LECTURERS;
}

export async function getLecturer(id: string) {
  return LECTURERS.find((lecturer) => lecturer.id === id) ?? null;
}

export async function getCurrentLecturer() {
  return LECTURERS.find((lecturer) => lecturer.id === CURRENT_LECTURER_ID)!;
}

export async function getAdvisorAssignments() {
  await mockDelay();
  return ADVISOR_ASSIGNMENTS;
}

export async function getAdvisees(lecturerId: string) {
  await mockDelay();
  const classNames = new Set(
    ADVISOR_ASSIGNMENTS.filter((assignment) => assignment.advisorId === lecturerId).map((assignment) => assignment.className),
  );
  return STUDENTS.filter((student) => classNames.has(student.className) && student.status !== "graduated");
}

export async function getAdvisedClasses(lecturerId: string) {
  return ADVISOR_ASSIGNMENTS.filter((assignment) => assignment.advisorId === lecturerId);
}

export async function getCurrentStudent() {
  return STUDENTS.find((student) => student.id === CURRENT_STUDENT_ID)!;
}

export async function getAdvisorOf(studentId: string) {
  const student = STUDENTS.find((entry) => entry.id === studentId);
  const assignment = ADVISOR_ASSIGNMENTS.find((entry) => entry.className === student?.className);
  return LECTURERS.find((lecturer) => lecturer.id === assignment?.advisorId) ?? null;
}

export async function getDecisions(studentId?: string) {
  await mockDelay();
  return DECISIONS.filter((decision) => !studentId || decision.studentId === studentId);
}
