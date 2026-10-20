"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Form, Input, message, Modal, Select, Table, Upload, type TableColumnsType } from "antd";
import { ArrowsTransaction, FileArrowIn } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { PERIODS, periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, daysUntil, formatDate, formatDateTime, weekdayOf } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { acceptOf, formatFileSize, inspectFile } from "@/shared/libs/upload.lib";
import { requestProctorSwap, submitExamPaper } from "@/modules/exams/exams.action";
import { EXAM_FORMAT_LABEL, EXAM_KIND_LABEL, EXAM_PAPER_FILE_LABEL, EXAM_PAPER_LIMIT, EXAM_PAPER_STATUS, EXAM_STATUS } from "@/modules/exams/exams.constant";
import { canSubmitPaper } from "@/modules/exams/exams.rule";
import type { ExamPaperFile, ExamPaperFileKind, ExamPaperReview, ExamPaperStatus, ExamSession } from "@/modules/exams/exams.type";
import { ExamPaperLinks } from "@/modules/exams/components/exam-paper-links";

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
        {exam.classCode} · {EXAM_KIND_LABEL[exam.kind]}
      </span>
    </span>
  );
}

export function LecturerExamBoard({ lecturerId, teaching, proctoring, teachingSlots, colleagues }: LecturerExamBoardProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [papers, setPapers] = useState<Record<string, { status: ExamPaperStatus; files: ExamPaperFile[]; review: ExamPaperReview | null }>>({});
  const [uploading, setUploading] = useState<ExamSession | null>(null);
  const [files, setFiles] = useState<Record<ExamPaperFileKind, File | null>>({ paper: null, "answer-key": null });
  const [swapping, setSwapping] = useState<ExamSession | null>(null);
  const [swapRequested, setSwapRequested] = useState<string[]>(() =>
    proctoring.filter((exam) => exam.swapRequests.some((swap) => swap.requesterId === lecturerId)).map((exam) => exam.id),
  );
  const [swapForm] = Form.useForm<SwapValues>();
  const [isSubmitting, startSubmitting] = useTransition();
  const [isSwapping, startSwapping] = useTransition();

  const paperOf = (exam: ExamSession) => papers[exam.id]?.status ?? exam.paperStatus;
  const filesOf = (exam: ExamSession) => papers[exam.id]?.files ?? exam.papers;
  const reviewOf = (exam: ExamSession) => (papers[exam.id] ? papers[exam.id].review : exam.paperReview);
  const pendingPapers = teaching.filter((exam) => exam.status !== "done" && (paperOf(exam) === "not-submitted" || paperOf(exam) === "returned"));
  const conflicts = proctoring.map((exam) => ({ exam, slot: teachingConflict(exam, teachingSlots) })).filter((entry) => entry.slot);

  const closeUpload = () => {
    setUploading(null);
    setFiles({ paper: null, "answer-key": null });
  };

  const submitPaper = () => {
    if (!uploading) return;
    const paper = files.paper;
    const answerKey = files["answer-key"];
    if (!paper || !answerKey) {
      messageApi.error("Cần đủ 2 tệp: đề thi và đáp án, thang điểm. Tệp PDF, tối đa 20 MB.");
      return;
    }
    const exam = uploading;
    const formData = new FormData();
    formData.set("examSessionId", exam.id);
    formData.set("paper", paper);
    formData.set("answer-key", answerKey);
    startSubmitting(async () => {
      const result = await submitExamPaper(formData).catch(() => null);
      if (!result) {
        messageApi.error("Chưa nộp được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        messageApi.error(Object.values(result.fieldErrors ?? {})[0] ?? result.message);
        return;
      }
      setPapers((current) => ({ ...current, [result.data.id]: { status: result.data.paperStatus, files: result.data.papers, review: null } }));
      messageApi.success(`Đã nộp đề ${EXAM_KIND_LABEL[exam.kind].toLowerCase()} lớp ${exam.classCode}. Phòng Khảo thí sẽ duyệt đề.`);
      closeUpload();
    });
  };

  const pickPaper = async (kind: ExamPaperFileKind, file: File) => {
    const checked = await inspectFile(file, { kinds: EXAM_PAPER_LIMIT.kinds, maxBytes: EXAM_PAPER_LIMIT.bytes });
    if (!checked.ok) messageApi.error(checked.message);
    else setFiles((current) => ({ ...current, [kind]: file }));
    return Upload.LIST_IGNORE;
  };

  const submitSwap = (values: SwapValues) => {
    if (!swapping) return;
    const exam = swapping;
    startSwapping(async () => {
      const result = await requestProctorSwap({ examSessionId: exam.id, colleagueId: values.colleagueId, reason: values.reason }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa gửi được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        swapForm.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      setSwapRequested((current) => [...new Set([...current, result.data.examSessionId])]);
      const colleague = colleagues.find((entry) => entry.id === values.colleagueId);
      messageApi.success(`Đã gửi đề nghị đổi ca với ${colleague?.name ?? "đồng nghiệp"} tới Phòng Khảo thí`);
      setSwapping(null);
    });
  };

  const paperCell = (exam: ExamSession) => {
    if (exam.status === "done")
      return (
        <span className="flex flex-col items-start gap-1">
          <StatusTag status={EXAM_STATUS.done} />
          <ExamPaperLinks examSessionId={exam.id} papers={filesOf(exam)} />
        </span>
      );
    const status = paperOf(exam);
    const review = reviewOf(exam);
    const hint = status === "not-submitted" || status === "returned" ? deadlineHint(exam.paperDeadline) : null;
    return (
      <span className="flex flex-col items-start gap-1">
        <StatusTag status={EXAM_PAPER_STATUS[status]} />
        {status === "returned" && review?.returnReason && <span className="max-w-60 text-xs text-pretty text-rose-700">Lý do trả lại: {review.returnReason}</span>}
        {status === "approved" && <span className="text-xs text-muted">Đề đã khóa, không nộp lại được</span>}
        {hint && <span className={`text-xs tabular-nums ${hint.className}`}>{hint.text}</span>}
        <ExamPaperLinks examSessionId={exam.id} papers={filesOf(exam)} />
      </span>
    );
  };

  const paperAction = (exam: ExamSession) =>
    canSubmitPaper({ status: exam.status, paperStatus: paperOf(exam) }) ? (
      <Button size="small" icon={<FileArrowIn size={14} aria-hidden className="text-zinc-500" />} onClick={() => setUploading(exam)}>
        {paperOf(exam) === "not-submitted" ? "Nộp đề" : "Nộp lại"}
      </Button>
    ) : null;

  const partnersText = (exam: ExamSession) =>
    exam.proctors
      .filter((proctor) => proctor.id !== lecturerId)
      .map((proctor) => proctor.name)
      .join(", ") || "Chưa phân công";

  const noteCell = (exam: ExamSession) => {
    const slot = teachingConflict(exam, teachingSlots);
    if (swapRequested.includes(exam.id)) return <span className="text-xs text-amber-700">Đã gửi đề nghị đổi ca</span>;
    if (slot)
      return (
        <span className="text-xs text-amber-700">
          Trùng giờ dạy {slot.code} ({periodLabel(slot.startPeriod, slot.endPeriod)})
        </span>
      );
    return <span className="text-xs text-muted">{exam.status === "done" ? "Đã coi thi" : "Có mặt trước giờ thi 30 phút"}</span>;
  };

  const swapAction = (exam: ExamSession) =>
    exam.status !== "done" && !swapRequested.includes(exam.id) ? (
      <Button size="small" icon={<ArrowsTransaction size={14} aria-hidden className="text-zinc-500" />} onClick={() => setSwapping(exam)}>
        Đổi ca
      </Button>
    ) : null;

  const teachingEmpty = <EmptyState illustration="board" title="Chưa có lịch thi cho lớp bạn dạy" description="Phòng Khảo thí sẽ công bố lịch thi trước kỳ thi 2 tuần." />;
  const proctorEmpty = <EmptyState illustration="calendar" title="Không có ca coi thi" description="Bạn chưa được phân công coi thi trong học kỳ này." />;

  const teachingColumns: TableColumnsType<ExamSession> = [
    { title: "Lớp học phần", key: "class", width: 240, render: (_, exam) => <ClassCell exam={exam} /> },
    { title: "Lịch thi", key: "when", width: 200, render: (_, exam) => <WhenCell exam={exam} /> },
    {
      title: "Hình thức",
      key: "format",
      width: 170,
      render: (_, exam) => (
        <span className="flex flex-col">
          {EXAM_FORMAT_LABEL[exam.format]}
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
      render: (_, exam) => paperCell(exam),
    },
    {
      title: "",
      key: "action",
      width: 120,
      align: "right",
      render: (_, exam) => paperAction(exam),
    },
  ];

  const proctorColumns: TableColumnsType<ExamSession> = [
    { title: "Ca thi", key: "when", width: 200, render: (_, exam) => <WhenCell exam={exam} /> },
    { title: "Môn thi", key: "class", width: 240, render: (_, exam) => <ClassCell exam={exam} /> },
    {
      title: "Cùng coi thi",
      key: "partners",
      width: 200,
      render: (_, exam) => <span className="text-sm text-muted">{partnersText(exam)}</span>,
    },
    {
      title: "Ghi chú",
      key: "note",
      width: 220,
      render: (_, exam) => noteCell(exam),
    },
    {
      title: "",
      key: "action",
      width: 110,
      align: "right",
      render: (_, exam) => swapAction(exam),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {contextHolder}
      {conflicts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title={`${conflicts.length} ca coi thi trùng giờ dạy của bạn`}
          description="Gửi đề nghị đổi ca cho Phòng Khảo thí, hoặc đăng ký nghỉ dạy, dạy bù ở mục Đơn từ."
        />
      )}

      <SectionCard
        title="Lớp tôi dạy"
        extra={
          <span className={`text-sm ${pendingPapers.length > 0 ? "text-amber-700" : "text-muted"}`}>
            {pendingPapers.length > 0 ? `${pendingPapers.length} đề cần nộp` : "Đã nộp đủ đề thi"}
          </span>
        }
        flush
      >
        <Table
          rowKey="id"
          size="middle"
          columns={teachingColumns}
          dataSource={teaching}
          pagination={false}
          scroll={{ x: 950 }}
          locale={{ emptyText: teachingEmpty }}
          className="hidden md:block"
        />
        <div className="md:hidden">
          {teaching.length === 0 ? (
            teachingEmpty
          ) : (
            <ul className="flex flex-col divide-y divide-border-strong">
              {teaching.map((exam) => (
                <li key={exam.id} className="flex flex-col gap-2 px-4 sm:px-5 py-3">
                  <ClassCell exam={exam} />
                  <WhenCell exam={exam} />
                  <span className="text-xs text-muted tabular-nums">
                    {EXAM_FORMAT_LABEL[exam.format]} · {exam.durationMinutes} phút · {exam.candidateCount} thí sinh
                  </span>
                  <span className="flex items-start justify-between gap-2">
                    {paperCell(exam)}
                    {paperAction(exam)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Lịch coi thi" flush>
        <Table
          rowKey="id"
          size="middle"
          columns={proctorColumns}
          dataSource={proctoring}
          pagination={false}
          scroll={{ x: 970 }}
          locale={{ emptyText: proctorEmpty }}
          className="hidden md:block"
        />
        <div className="md:hidden">
          {proctoring.length === 0 ? (
            proctorEmpty
          ) : (
            <ul className="flex flex-col divide-y divide-border-strong">
              {proctoring.map((exam) => (
                <li key={exam.id} className="flex flex-col gap-2 px-4 sm:px-5 py-3">
                  <WhenCell exam={exam} />
                  <ClassCell exam={exam} />
                  <span className="text-xs text-muted">Cùng coi thi: {partnersText(exam)}</span>
                  <span className="flex items-start justify-between gap-2">
                    {noteCell(exam)}
                    {swapAction(exam)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      <Modal
        open={uploading !== null}
        title={uploading ? `Nộp đề ${EXAM_KIND_LABEL[uploading.kind].toLowerCase()} lớp ${uploading.classCode}` : ""}
        okText="Nộp đề"
        cancelText="Hủy"
        onOk={submitPaper}
        confirmLoading={isSubmitting}
        onCancel={closeUpload}
        mask={{ closable: false }}
        destroyOnHidden
        width={640}
      >
        {uploading && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-pretty text-muted">
              Hạn nộp {formatDateTime(uploading.paperDeadline)}. Chỉ bạn và Phòng Khảo thí tải được đề đã nộp. Nộp lại thì bản mới thay bản cũ.
            </p>
            {paperOf(uploading) === "returned" && reviewOf(uploading)?.returnReason && (
              <Alert type="error" showIcon title="Phòng Khảo thí trả lại đề" description={reviewOf(uploading)?.returnReason} />
            )}
            {(["paper", "answer-key"] as const).map((kind) => {
              const picked = files[kind];
              return (
                <div key={kind} className="flex flex-col gap-2">
                  <span className="text-sm font-medium">{EXAM_PAPER_FILE_LABEL[kind]}</span>
                  <Upload.Dragger
                    accept={acceptOf(EXAM_PAPER_LIMIT.kinds)}
                    maxCount={1}
                    fileList={picked ? [{ uid: kind, name: picked.name, size: picked.size, status: "done" }] : []}
                    beforeUpload={(file) => pickPaper(kind, file)}
                    onRemove={() => setFiles((current) => ({ ...current, [kind]: null }))}
                  >
                    <p className="text-sm">Kéo thả tệp PDF vào đây hoặc bấm để chọn</p>
                    <p className="text-xs text-muted">Tối đa {formatFileSize(EXAM_PAPER_LIMIT.bytes)}</p>
                  </Upload.Dragger>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={swapping !== null}
        title="Đề nghị đổi ca coi thi"
        okText="Gửi đề nghị"
        cancelText="Hủy"
        onOk={() => swapForm.submit()}
        confirmLoading={isSwapping}
        onCancel={() => setSwapping(null)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        {swapping && (
          <Form
            form={swapForm}
            layout="vertical"
            onFinish={submitSwap}
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
