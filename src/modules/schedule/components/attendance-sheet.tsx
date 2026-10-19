"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, Button, Card, message, Radio, Select, Table, type TableColumnsType } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, formatDate, weekdayOf } from "@/shared/libs/date.lib";
import { saveAttendance } from "@/modules/schedule/schedule.action";
import { ABSENCE_LIMIT_RATIO, ATTENDANCE_STATUS } from "@/modules/schedule/schedule.constant";
import { isAbsence, isNearAbsenceLimit, isOverAbsenceLimit } from "@/modules/schedule/schedule.rule";
import type { AttendanceBook, AttendanceSession, AttendanceStatus } from "@/modules/schedule/schedule.type";

export type AttendanceStudent = {
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
};

type AttendanceSheetProps = {
  book: AttendanceBook;
  students: AttendanceStudent[];
  absenceLimitPercent?: number;
};

const STATUS_KEYS = Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[];

function isEditable(session: AttendanceSession) {
  return !dayjs(session.date).isAfter(dayjs(), "day");
}

function defaultSessionId(sessions: AttendanceSession[]) {
  const today = sessions.find((session) => dayjs(session.date).isSame(dayjs(), "day"));
  if (today) return today.id;
  const past = sessions.filter(isEditable);
  return (past.at(-1) ?? sessions[0])?.id;
}

function sessionLabel(session: AttendanceSession, index: number) {
  const group = session.labGroupCode ? ` · Thực hành ${session.labGroupCode}` : "";
  return `Buổi ${index + 1} · ${weekdayLabel(weekdayOf(session.date))}, ${formatDate(session.date)} · ${periodLabel(session.startPeriod, session.endPeriod)}${group}`;
}

export function AttendanceSheet({ book, students, absenceLimitPercent = ABSENCE_LIMIT_RATIO * 100 }: AttendanceSheetProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [records, setRecords] = useState(book.records);
  const [sessionId, setSessionId] = useState(() => defaultSessionId(book.sessions));
  const [takenIds, setTakenIds] = useState(() => book.sessions.filter((entry) => entry.isTaken).map((entry) => entry.id));
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [isSaving, startSaving] = useTransition();

  const session = book.sessions.find((entry) => entry.id === sessionId);
  const editable = session ? isEditable(session) : false;
  const current = (sessionId && records[sessionId]) || {};
  // Buổi thực hành chỉ gồm sinh viên của nhóm; buổi đã học là buổi đã lưu điểm danh.
  const attends = (entry: AttendanceSession, studentId: string) => entry.labGroupId === null || book.labGroupOf[studentId] === entry.labGroupId;
  const sessionStudents = session ? students.filter((student) => attends(session, student.studentId)) : [];

  const tally = useMemo(() => {
    const result: Record<string, { absences: number; held: number }> = {};
    const taken = book.sessions.filter((entry) => takenIds.includes(entry.id));
    for (const student of students) {
      const held = taken.filter((entry) => entry.labGroupId === null || book.labGroupOf[student.studentId] === entry.labGroupId);
      result[student.studentId] = { held: held.length, absences: held.filter((entry) => isAbsence(records[entry.id]?.[student.studentId])).length };
    }
    return result;
  }, [book, students, takenIds, records]);

  if (book.sessions.length === 0 || !session) {
    return (
      <SectionCard flush>
        <EmptyState illustration="calendar" title="Chưa có buổi học" description="Lớp chưa có buổi học nào được xếp lịch trong học kỳ." />
      </SectionCard>
    );
  }

  const setStatus = (studentId: string, status: AttendanceStatus) =>
    setRecords((value) => ({ ...value, [session.id]: { ...value[session.id], [studentId]: status } }));

  const markAllPresent = () =>
    setRecords((value) => ({
      ...value,
      [session.id]: Object.fromEntries(sessionStudents.map((student) => [student.studentId, value[session.id]?.[student.studentId] ?? "present"])),
    }));

  const missing = sessionStudents.filter((student) => !current[student.studentId]).length;
  const counts = STATUS_KEYS.map((key) => ({ key, count: sessionStudents.filter((student) => current[student.studentId] === key).length }));
  const banned = students.filter((student) => isOverAbsenceLimit(tally[student.studentId].absences, tally[student.studentId].held, absenceLimitPercent)).length;

  const save = () => {
    if (missing > 0) {
      messageApi.error(`Còn ${missing} sinh viên chưa điểm danh. Chọn trạng thái cho từng sinh viên hoặc bấm "Tất cả có mặt" trước khi lưu.`);
      return;
    }
    const target = session;
    startSaving(async () => {
      const result = await saveAttendance({
        classSessionId: target.id,
        records: sessionStudents.map((student) => ({ studentId: student.studentId, status: current[student.studentId] })),
      }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      setRecords((value) => ({ ...value, [result.data.sessionId]: result.data.records }));
      setTakenIds((value) => [...new Set([...value, result.data.sessionId])]);
      setSavedIds((value) => [...new Set([...value, result.data.sessionId])]);
      const absent = Object.values(result.data.records).filter((status) => isAbsence(status)).length;
      messageApi.success(`Đã lưu điểm danh ngày ${formatDate(target.date)}: ${Object.keys(result.data.records).length - absent} có mặt, ${absent} vắng.`);
    });
  };

  const statusGroup = (row: AttendanceStudent, className?: string) => (
    <Radio.Group
      size="small"
      optionType="button"
      buttonStyle="solid"
      disabled={!editable}
      value={current[row.studentId]}
      onChange={(event) => setStatus(row.studentId, event.target.value)}
      aria-label={`Trạng thái của ${row.fullName}`}
      className={className}
      options={STATUS_KEYS.map((key) => ({ value: key, label: ATTENDANCE_STATUS[key].label }))}
    />
  );

  const absenceText = (row: AttendanceStudent) => {
    const { absences: count, held } = tally[row.studentId];
    const isOver = isOverAbsenceLimit(count, held, absenceLimitPercent);
    const isNear = isNearAbsenceLimit(count, held, absenceLimitPercent);
    return (
      <span className="flex flex-col text-xs tabular-nums">
        <span className={isOver ? "font-medium text-rose-700" : "text-muted"}>
          Đã vắng {count}/{held} buổi
        </span>
        {isOver && <span className="text-rose-700">Vắng từ {absenceLimitPercent}%, cấm thi</span>}
        {isNear && <span className="text-amber-700">Vắng thêm 1 buổi sẽ bị cấm thi</span>}
      </span>
    );
  };

  const columns: TableColumnsType<AttendanceStudent> = [
    { title: "STT", key: "index", width: 56, align: "right", render: (_, __, index) => <span className="text-muted tabular-nums">{index + 1}</span> },
    {
      title: "Sinh viên",
      key: "student",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="text-xs text-muted">{row.studentCode}</span>
        </span>
      ),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 360,
      render: (_, row) => statusGroup(row),
    },
    {
      title: "Đã vắng",
      key: "absences",
      width: 150,
      render: (_, row) => absenceText(row),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Select
          value={sessionId}
          onChange={setSessionId}
          aria-label="Chọn buổi học"
          className="w-full md:w-96"
          options={book.sessions.map((entry, index) => ({ value: entry.id, label: sessionLabel(entry, index) }))}
        />
        <span className="text-sm text-muted">Phòng {session.room}</span>
      </div>

      {!editable ? (
        <Alert
          type="info"
          showIcon
          title={`Buổi ngày ${formatDate(session.date)} chưa diễn ra`}
          description="Chỉ điểm danh được từ ngày học trở về trước. Chọn buổi hôm nay hoặc một buổi đã qua."
        />
      ) : (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted tabular-nums">
          {counts.map((entry) => (
            <span key={entry.key}>
              {ATTENDANCE_STATUS[entry.key].label} <span className="font-medium text-foreground">{entry.count}</span>
            </span>
          ))}
          <span>
            Chưa điểm danh <span className="font-medium text-foreground">{missing}</span>
          </span>
          {banned > 0 && (
            <span className="text-rose-700">
              Cấm thi <span className="font-medium">{banned}</span> sinh viên
            </span>
          )}
          {savedIds.includes(session.id) && <span className="text-green-700">Đã lưu</span>}
        </p>
      )}

      {sessionStudents.length === 0 ? (
        <SectionCard flush>
          <EmptyState illustration="seats" title="Lớp chưa có sinh viên" description="Danh sách sẽ có sau khi sinh viên đăng ký học phần." />
        </SectionCard>
      ) : (
        <>
          <Table rowKey="studentId" size="middle" columns={columns} dataSource={sessionStudents} pagination={false} className="hidden md:block" />
          <ul className="flex flex-col gap-2 md:hidden">
            {sessionStudents.map((student, index) => (
              <li key={student.studentId}>
                <Card size="small" classNames={{ body: "flex flex-col gap-2" }}>
                  <span className="flex items-start gap-2">
                    <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">{index + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{student.fullName}</span>
                      <span className="text-xs text-muted">{student.studentCode}</span>
                    </span>
                    {absenceText(student)}
                  </span>
                  {statusGroup(student, "grid grid-cols-2 gap-1 [&_.ant-radio-button-wrapper]:rounded-md [&_.ant-radio-button-wrapper]:border-s [&_.ant-radio-button-wrapper]:text-center")}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {editable && (
        <Card size="small" className="sticky bottom-[calc(74px+env(safe-area-inset-bottom))] z-10 md:bottom-4" classNames={{ body: "flex flex-wrap items-center gap-2" }}>
          <span className="text-sm text-muted tabular-nums">
            Chưa điểm danh <span className="font-medium text-foreground">{missing}</span>/{sessionStudents.length}
          </span>
          <div className="ml-auto flex gap-2">
            <Button onClick={markAllPresent}>Tất cả có mặt</Button>
            <Button type="primary" loading={isSaving} onClick={save}>
              Lưu điểm danh
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
