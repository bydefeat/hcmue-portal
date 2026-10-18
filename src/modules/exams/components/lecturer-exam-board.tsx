"use client";

import { useState } from "react";
import { Alert, Button, Form, Input, message, Modal, Select, Table, Upload, type TableColumnsType } from "antd";
import { ArrowsTransaction, CalendarCheck, FileArrowIn, PresentationScreen } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { PERIODS, periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, daysUntil, formatDate, formatDateTime, weekdayOf } from "@/shared/libs/date.lib";
import { EXAM_FORMAT_LABEL, EXAM_KIND_LABEL, EXAM_PAPER_STATUS, EXAM_STATUS } from "../exams.constant";
import type { ExamPaperStatus, ExamSession } from "../exams.type";

export type TeachingSlot = {
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  code: string;
};

type LecturerExamBoardProps = {
  lecturerId: string;
  teaching: ExamSession[];
  proctoring: ExamSession[];
  teachingSlots: TeachingSlot[];
  colleagues: { id: string; name: string }[];
};

type SwapValues = { colleagueId: string; reason: string };

function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function teachingConflict(exam: ExamSession, slots: TeachingSlot[]) {
  const day = weekdayOf(exam.date);
  const start = toMinutes(exam.startTime);
  const end = start + exam.durationMinutes;
  return slots.find((slot) => {
    if (slot.dayOfWeek !== day) return false;
    const slotStart = toMinutes(PERIODS.find((period) => period.period === slot.startPeriod)!.start);
    const slotEnd = toMinutes(PERIODS.find((period) => period.period === slot.endPeriod)!.end);
    return start < slotEnd && slotStart < end;
  });
}

function endTime(exam: ExamSession) {
  return dayjs(`2000-01-01T${exam.startTime}`).add(exam.durationMinutes, "minute").format("HH:mm");
}

function deadlineHint(deadline: string) {
  const days = daysUntil(deadline);
  if (dayjs().isAfter(deadline)) return { text: `Quá hạn ${Math.max(1, -days)} ngày`, className: "text-rose-700" };
  if (days <= 3) return { text: days === 0 ? "Hạn hôm nay" : `Còn ${days} ngày`, className: "text-amber-700" };
  return { text: `Hạn ${formatDate(deadline)}`, className: "text-muted" };
}

function WhenCell({ exam }: { exam: ExamSession }) {
  return (
    <span className="flex flex-col tabular-nums">
      <span className="font-medium">
        {weekdayLabel(weekdayOf(exam.date))}, {formatDate(exam.date)}
      </span>
      <span className="text-xs text-muted">
        {exam.startTime} - {endTime(exam)} · phòng {exam.room}
      </span>
    </span>
  );
}

function ClassCell({ exam }: { exam: ExamSession }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{exam.courseName}</span>
      <span className="text-xs text-muted">
        <span className="font-mono">{exam.classCode}</span> · {EXAM_KIND_LABEL[exam.kind]}
      </span>
    </span>
  );
}

export function LecturerExamBoard({ lecturerId, teaching, proctoring, teachingSlots, colleagues }: LecturerExamBoardProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [papers, setPapers] = useState<Record<string, ExamPaperStatus>>({});
  const [uploading, setUploading] = useState<ExamSession | null>(null);
  const [files, setFiles] = useState<{ paper: string | null; key: string | null }>({ paper: null, key: null });
  const [swapping, setSwapping] = useState<ExamSession | null>(null);
  const [swapRequested, setSwapRequested] = useState<string[]>([]);
  const [swapForm] = Form.useForm<SwapValues>();

  const paperOf = (exam: ExamSession) => papers[exam.id] ?? exam.paperStatus;
  const pendingPapers = teaching.filter((exam) => exam.status !== "done" && paperOf(exam) === "not-submitted");
  const conflicts = proctoring.map((exam) => ({ exam, slot: teachingConflict(exam, teachingSlots) })).filter((entry) => entry.slot);

  const submitPaper = () => {
    if (!uploading) return;
    if (!files.paper || !files.key) {
      messageApi.error("Cần đủ 2 tệp: đề thi và đáp án, thang điểm. Tệp PDF, tối đa 20 MB.");
      return;
    }
    setPapers((current) => ({ ...current, [uploading.id]: "submitted" }));
    messageApi.success(`Đã nộp đề ${EXAM_KIND_LABEL[uploading.kind].toLowerCase()} lớp ${uploading.classCode}. Phòng Khảo thí sẽ duyệt đề.`);
    setUploading(null);
    setFiles({ paper: null, key: null });
  };

  const teachingColumns: TableColumnsType<ExamSession> = [
    { title: "Lớp học phần", key: "class", width: 240, render: (_, exam) => <ClassCell exam={exam} /> },
    { title: "Lịch thi", key: "when", width: 200, render: (_, exam) => <WhenCell exam={exam} /> },
    {
      title: "Hình thức",
      key: "format",
      width: 170,
      render: (_, exam) => (
        <span className="flex flex-col">
          <span>{EXAM_FORMAT_LABEL[exam.format]}</span>
          <span className="text-xs text-muted tabular-nums">
            {exam.durationMinutes} phút · {exam.candidateCount} thí sinh
          </span>
        </span>
      ),
    },
    {
      title: "Đề thi",
      key: "paper",
      width: 220,
      render: (_, exam) => {
        if (exam.status === "done") return <StatusTag status={EXAM_STATUS.done} />;
        const status = paperOf(exam);
        const hint = status === "not-submitted" ? deadlineHint(exam.paperDeadline) : null;
        return (
          <span className="flex flex-col items-start gap-1">
            <StatusTag status={EXAM_PAPER_STATUS[status]} />
            {hint && <span className={`text-xs tabular-nums ${hint.className}`}>{hint.text}</span>}
          </span>
        );
      },
    },
    {
      title: "",
      key: "action",
      width: 120,
      align: "right",
      render: (_, exam) =>
        exam.status !== "done" && paperOf(exam) !== "approved" ? (
          <Button size="small" icon={<FileArrowIn size={14} aria-hidden />} onClick={() => setUploading(exam)}>
            {paperOf(exam) === "submitted" ? "Nộp lại" : "Nộp đề"}
          </Button>
        ) : null,
    },
  ];

  const proctorColumns: TableColumnsType<ExamSession> = [
    { title: "Ca thi", key: "when", width: 200, render: (_, exam) => <WhenCell exam={exam} /> },
    { title: "Môn thi", key: "class", width: 240, render: (_, exam) => <ClassCell exam={exam} /> },
    {
      title: "Cùng coi thi",
      key: "partners",
      width: 200,
      render: (_, exam) => (
        <span className="text-sm text-muted">
          {exam.proctors
            .filter((proctor) => proctor.id !== lecturerId)
            .map((proctor) => proctor.name)
            .join(", ") || "Chưa phân công"}
        </span>
      ),
    },
    {
      title: "Ghi chú",
      key: "note",
      width: 220,
      render: (_, exam) => {
        const slot = teachingConflict(exam, teachingSlots);
        if (slot)
          return (
            <span className="text-xs text-rose-700">
              Trùng giờ dạy {slot.code} ({periodLabel(slot.startPeriod, slot.endPeriod)})
            </span>
          );
        if (swapRequested.includes(exam.id)) return <span className="text-xs text-amber-700">Đã gửi đề nghị đổi ca</span>;
        return <span className="text-xs text-muted">{exam.status === "done" ? "Đã coi thi" : "Có mặt trước giờ thi 30 phút"}</span>;
      },
    },
    {
      title: "",
      key: "action",
      width: 110,
      align: "right",
      render: (_, exam) =>
        exam.status !== "done" && !swapRequested.includes(exam.id) ? (
          <Button size="small" icon={<ArrowsTransaction size={14} aria-hidden />} onClick={() => setSwapping(exam)}>
            Đổi ca
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {contextHolder}
      {conflicts.length > 0 && (
        <Alert
          type="error"
          showIcon
          title={`${conflicts.length} ca coi thi trùng giờ dạy của bạn`}
          description="Gửi đề nghị đổi ca cho Phòng Khảo thí, hoặc đăng ký nghỉ dạy, dạy bù ở mục Đơn từ."
        />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Lớp tôi dạy</h2>
          <span className={`text-sm ${pendingPapers.length > 0 ? "text-amber-700" : "text-muted"}`}>
            {pendingPapers.length > 0 ? `${pendingPapers.length} đề chưa nộp` : "Đã nộp đủ đề thi"}
          </span>
        </div>
        <Table
          rowKey="id"
          size="middle"
          columns={teachingColumns}
          dataSource={teaching}
          pagination={false}
          scroll={{ x: 950 }}
          locale={{ emptyText: <EmptyState icon={PresentationScreen} title="Chưa có lịch thi cho lớp bạn dạy" description="Phòng Khảo thí sẽ công bố lịch thi trước kỳ thi 2 tuần." /> }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Lịch coi thi</h2>
        <Table
          rowKey="id"
          size="middle"
          columns={proctorColumns}
          dataSource={proctoring}
          pagination={false}
          scroll={{ x: 970 }}
          locale={{ emptyText: <EmptyState icon={CalendarCheck} title="Không có ca coi thi" description="Bạn chưa được phân công coi thi trong học kỳ này." /> }}
        />
      </section>

      <Modal
        open={uploading !== null}
        title={uploading ? `Nộp đề ${EXAM_KIND_LABEL[uploading.kind].toLowerCase()} lớp ${uploading.classCode}` : ""}
        okText="Nộp đề"
        cancelText="Hủy"
        onOk={submitPaper}
        onCancel={() => {
          setUploading(null);
          setFiles({ paper: null, key: null });
        }}
        mask={{ closable: false }}
        destroyOnHidden
        width={640}
      >
        {uploading && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-pretty text-muted">
              Hạn nộp {formatDateTime(uploading.paperDeadline)}. Đề được mã hóa và chỉ Phòng Khảo thí mở được trước giờ thi.
            </p>
            {(["paper", "key"] as const).map((kind) => (
              <div key={kind} className="flex flex-col gap-2">
                <span className="text-sm font-medium">{kind === "paper" ? "Đề thi" : "Đáp án, thang điểm"}</span>
                <Upload.Dragger
                  accept=".pdf"
                  maxCount={1}
                  beforeUpload={(file) => {
                    setFiles((current) => ({ ...current, [kind]: file.name }));
                    return false;
                  }}
                  onRemove={() => setFiles((current) => ({ ...current, [kind]: null }))}
                >
                  <p className="text-sm">Kéo thả tệp PDF vào đây hoặc bấm để chọn</p>
                  <p className="text-xs text-muted">Tối đa 20 MB</p>
                </Upload.Dragger>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={swapping !== null}
        title="Đề nghị đổi ca coi thi"
        okText="Gửi đề nghị"
        cancelText="Hủy"
        onOk={() => swapForm.submit()}
        onCancel={() => setSwapping(null)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        {swapping && (
          <Form
            form={swapForm}
            layout="vertical"
            onFinish={(values: SwapValues) => {
              setSwapRequested((current) => [...current, swapping.id]);
              const colleague = colleagues.find((entry) => entry.id === values.colleagueId);
              messageApi.success(`Đã gửi đề nghị đổi ca với ${colleague?.name ?? "đồng nghiệp"} tới Phòng Khảo thí`);
              setSwapping(null);
            }}
          >
            <p className="mb-4 text-sm text-muted">
              {swapping.courseName}, {formatDate(swapping.date)} lúc {swapping.startTime}, phòng {swapping.room}
            </p>
            <Form.Item name="colleagueId" label="Người coi thay" rules={[{ required: true, message: "Chọn người coi thay" }]}>
              <Select showSearch={{ optionFilterProp: "label" }} options={colleagues.map((entry) => ({ value: entry.id, label: entry.name }))} />
            </Form.Item>
            <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Chưa nhập lý do" }]}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={300} showCount />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
