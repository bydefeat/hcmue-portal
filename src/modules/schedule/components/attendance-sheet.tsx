"use client";

import { useMemo, useState } from "react";
import { Alert, Button, message, Radio, Select, Table, type TableColumnsType } from "antd";
import { CalendarClock } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, formatDate, weekdayOf } from "@/shared/libs/date.lib";
import { ABSENCE_LIMIT_RATIO, ATTENDANCE_STATUS } from "../schedule.constant";
import type { AttendanceBook, AttendanceSession, AttendanceStatus } from "../schedule.type";

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
  return `Buổi ${index + 1} · ${weekdayLabel(weekdayOf(session.date))}, ${formatDate(session.date)} · ${periodLabel(session.startPeriod, session.endPeriod)}`;
}

export function AttendanceSheet({ book, students, absenceLimitPercent = ABSENCE_LIMIT_RATIO * 100 }: AttendanceSheetProps) {
  const limitRatio = absenceLimitPercent / 100;
  const [messageApi, contextHolder] = message.useMessage();
  const [records, setRecords] = useState(book.records);
  const [sessionId, setSessionId] = useState(() => defaultSessionId(book.sessions));
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const session = book.sessions.find((entry) => entry.id === sessionId);
  const editable = session ? isEditable(session) : false;
  const current = (sessionId && records[sessionId]) || {};
  const pastSessions = book.sessions.filter(isEditable);

  const absences = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of pastSessions) {
      for (const [studentId, status] of Object.entries(records[entry.id] ?? {})) {
        if (status === "absent" || status === "excused") counts[studentId] = (counts[studentId] ?? 0) + 1;
      }
    }
    return counts;
  }, [pastSessions, records]);

  if (book.sessions.length === 0 || !session) {
    return (
      <SectionCard flush>
        <EmptyState icon={CalendarClock} title="Chưa có buổi học" description="Lớp chưa có buổi học nào được xếp lịch trong học kỳ." />
      </SectionCard>
    );
  }

  const setStatus = (studentId: string, status: AttendanceStatus) =>
    setRecords((value) => ({ ...value, [session.id]: { ...value[session.id], [studentId]: status } }));

  const markAllPresent = () =>
    setRecords((value) => ({
      ...value,
      [session.id]: Object.fromEntries(students.map((student) => [student.studentId, value[session.id]?.[student.studentId] ?? "present"])),
    }));

  const missing = students.filter((student) => !current[student.studentId]).length;
  const counts = STATUS_KEYS.map((key) => ({ key, count: students.filter((student) => current[student.studentId] === key).length }));
  const banned = pastSessions.length > 0 ? students.filter((student) => (absences[student.studentId] ?? 0) / pastSessions.length > limitRatio).length : 0;

  const save = () => {
    if (missing > 0) {
      messageApi.error(`Còn ${missing} sinh viên chưa điểm danh. Chọn trạng thái cho từng em hoặc bấm "Tất cả có mặt" trước khi lưu.`);
      return;
    }
    setSavedIds((value) => [...new Set([...value, session.id])]);
    const absent = counts.filter((entry) => entry.key === "absent" || entry.key === "excused").reduce((sum, entry) => sum + entry.count, 0);
    messageApi.success(`Đã lưu điểm danh ngày ${formatDate(session.date)}: ${students.length - absent} có mặt, ${absent} vắng.`);
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
      render: (_, row) => (
        <Radio.Group
          size="small"
          optionType="button"
          buttonStyle="solid"
          disabled={!editable}
          value={current[row.studentId]}
          onChange={(event) => setStatus(row.studentId, event.target.value)}
          aria-label={`Trạng thái của ${row.fullName}`}
          options={STATUS_KEYS.map((key) => ({
            value: key,
            title: ATTENDANCE_STATUS[key].label,
            label: (
              <>
                <span className="md:hidden">{ATTENDANCE_STATUS[key].short}</span>
                <span className="hidden md:inline">{ATTENDANCE_STATUS[key].label}</span>
              </>
            ),
          }))}
        />
      ),
    },
    {
      title: "Đã vắng",
      key: "absences",
      width: 130,
      render: (_, row) => {
        const count = absences[row.studentId] ?? 0;
        const isOver = pastSessions.length > 0 && count / pastSessions.length > limitRatio;
        const isNear = !isOver && pastSessions.length > 0 && (count + 1) / pastSessions.length > limitRatio;
        return (
          <span className="flex flex-col text-xs tabular-nums">
            <span className={isOver ? "font-medium text-rose-700" : "text-muted"}>
              {count}/{pastSessions.length} buổi
            </span>
            {isOver && <span className="text-rose-700">Vượt {absenceLimitPercent}%, cấm thi</span>}
            {isNear && <span className="text-amber-700">Vắng thêm 1 buổi sẽ bị cấm thi</span>}
          </span>
        );
      },
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
        <div className="flex gap-2 md:ml-auto">
          <Button disabled={!editable} onClick={markAllPresent}>
            Tất cả có mặt
          </Button>
          <Button type="primary" disabled={!editable} onClick={save}>
            Lưu điểm danh
          </Button>
        </div>
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

      <Table
        rowKey="studentId"
        size="middle"
        columns={columns}
        dataSource={students}
        pagination={false}
        scroll={{ x: 720 }}
        rowClassName={(row) => (editable && !current[row.studentId] ? "[&>td]:bg-amber-50" : "")}
        locale={{ emptyText: <EmptyState title="Lớp chưa có sinh viên" description="Danh sách sẽ có sau khi sinh viên đăng ký học phần." /> }}
      />
    </div>
  );
}
