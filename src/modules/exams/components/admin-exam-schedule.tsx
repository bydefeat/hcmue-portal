"use client";

import { useState, useTransition } from "react";
import { Button, DatePicker, Drawer, Form, Input, InputNumber, message, Modal, Segmented, Select, Table, Tooltip, type TableColumnsType } from "antd";
import type { Dayjs } from "dayjs";
import { Magnifier, Pen, Plus } from "defeat-icons-react";
import { DownloadPdfButton } from "@/shared/components/ui/download-pdf-button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { normalizeSearch } from "@/shared/libs/search.lib";
import {
  approveExamPaper,
  deleteExamSession,
  exportExamRosterPdf,
  generateFinalExams,
  loadExamRoster,
  publishExamSessions,
  returnExamPaper,
  unlockExamPaper,
} from "@/modules/exams/exams.action";
import { EXAM_FORMAT_LABEL, EXAM_FORMAT_OPTIONS, EXAM_KIND_LABEL, EXAM_PAPER_STATUS, EXAM_RETURN_REASON_MAX, EXAM_STATUS, PROCTORS_PER_ROOM } from "@/modules/exams/exams.constant";
import { paperReviewBlockedReason } from "@/modules/exams/exams.rule";
import type { ExamClassOption, ExamDeferralRow, ExamFormat, ExamKind, ExamPaperStatus, ExamRosterRow, ExamSession } from "@/modules/exams/exams.type";
import { ExamPaperLinks } from "@/modules/exams/components/exam-paper-links";
import { ExamSessionForm, type ExamRoomOption, type ProctorOption } from "@/modules/exams/components/exam-session-form";

export type { ExamRoomOption, ProctorOption };

type AdminExamScheduleProps = {
  termId: string;
  sessions: ExamSession[];
  rooms: ExamRoomOption[];
  proctors: ProctorOption[];
  classes: ExamClassOption[];
  deferrals: ExamDeferralRow[];
  canReview: boolean;
  header: { title: string; description?: React.ReactNode };
};

type GenerateValues = { range: [Dayjs, Dayjs]; durationMinutes: number; paperDaysBefore: number; defaultFormat: ExamFormat };

const capacityOf = (row: ExamSession) => row.rooms.reduce((sum, room) => sum + room.examCapacity, 0);

const refreshAll = () => window.location.reload();

const issuesOf = (row: ExamSession) => [
  ...row.conflicts.map((conflict) => conflict.message),
  ...(row.rooms.length === 0 ? ["Chưa có phòng thi"] : []),
  ...(row.rooms.some((room) => room.proctors.length < PROCTORS_PER_ROOM) ? ["Phòng thiếu cán bộ coi thi"] : []),
  ...(row.expectedCandidates > capacityOf(row) ? [`Thiếu ${row.expectedCandidates - capacityOf(row)} chỗ ngồi thi`] : []),
  ...(row.status !== "done" && row.expectedCandidates !== row.candidateCount ? ["Danh sách thi cần xếp lại (lưu ca để xếp lại)"] : []),
];

const roomsCell = (row: ExamSession) => (
  <span className="flex flex-col gap-0.5 text-xs">
    {row.rooms.length === 0 && <span className="text-rose-700">Chưa có phòng</span>}
    {row.rooms.map((room) => (
      <span key={room.id} className="tabular-nums">
        {room.code}{" "}
        <span className={room.candidates > room.examCapacity ? "text-rose-700" : "text-muted"}>
          ({room.candidates}/{room.examCapacity})
        </span>
      </span>
    ))}
    <span className={`tabular-nums ${row.expectedCandidates > capacityOf(row) ? "text-rose-700" : "text-muted"}`}>{row.expectedCandidates} thí sinh</span>
  </span>
);

const paperLabel = (row: ExamSession) => `${EXAM_KIND_LABEL[row.kind].toLowerCase()} lớp ${row.classCode}`;

export function AdminExamSchedule({ termId, sessions, rooms, proctors, classes, deferrals, canReview, header }: AdminExamScheduleProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(sessions);
  const [kind, setKind] = useState<ExamKind>("final");
  const [query, setQuery] = useState("");
  const [paper, setPaper] = useState<ExamPaperStatus>();
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [reasonFor, setReasonFor] = useState<{ row: ExamSession; mode: "return" | "unlock" | "delete" } | null>(null);
  const [reasonForm] = Form.useForm<{ reason: string }>();
  const [isSaving, startSaving] = useTransition();
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [generateForm] = Form.useForm<GenerateValues>();
  const [roster, setRoster] = useState<{ row: ExamSession; entries: ExamRosterRow[] } | null>(null);
  const editing = rows.find((row) => row.id === editingId) ?? null;

  const ofKind = rows.filter((row) => row.kind === kind);
  const canReviewRow = (row: ExamSession) => canReview && row.papers.length > 0 && paperReviewBlockedReason(row) === null;
  const drafts = ofKind.filter((row) => row.status === "draft");
  const conflictCount = ofKind.reduce((sum, row) => sum + row.conflicts.length, 0);
  const missingPapers = ofKind.filter((row) => row.paperStatus === "not-submitted" && row.status !== "done").length;
  const awaitingReview = ofKind.filter((row) => row.paperStatus === "submitted" && !row.hasStarted).length;
  const replaceRow = (next: ExamSession) => setRows((current) => (current.some((row) => row.id === next.id) ? current.map((row) => (row.id === next.id ? next : row)) : [...current, next]));

  const visible = ofKind.filter(
    (row) =>
      (!paper || row.paperStatus === paper) &&
      (!onlyIssues || issuesOf(row).length > 0) &&
      (!query.trim() ||
        normalizeSearch(`${row.classCode} ${row.courseName} ${row.rooms.map((room) => room.code).join(" ")} ${row.proctors.map((proctor) => proctor.name).join(" ")}`).includes(normalizeSearch(query.trim()))),
  );


  const publish = () =>
    modal.confirm({
      title: `Công bố lịch thi ${drafts.length} ca?`,
      content: `Sinh viên nhận thông báo kèm ngày giờ thi; giảng viên dạy lớp và cán bộ coi thi nhận thông báo kèm phòng. ${conflictCount > 0 ? `Còn ${conflictCount} cảnh báo xung đột.` : ""}`,
      okText: "Công bố",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await publishExamSessions({ termId, kind }).catch(() => null);
        if (!result) {
          messageApi.error("Chưa công bố được, kiểm tra kết nối rồi thử lại.");
          return;
        }
        if (!result.ok) {
          messageApi.error(result.message, 8);
          return;
        }
        const published = new Set(result.data.ids);
        setRows((current) => current.map((row) => (published.has(row.id) ? { ...row, status: "published" } : row)));
        messageApi.success(`Đã công bố ${published.size} ca thi, ${result.data.notifiedStudents} lượt báo sinh viên`);
      },
    });

  const approve = (row: ExamSession) =>
    modal.confirm({
      title: `Duyệt đề ${paperLabel(row)}?`,
      content: `Duyệt bản nộp lúc ${row.paperSubmittedAt ? formatDateTime(row.paperSubmittedAt) : ""}. Đề và đáp án bị khóa, giảng viên nhận thông báo ngay.`,
      okText: "Duyệt đề",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await approveExamPaper({ examSessionId: row.id, paperSubmittedAt: row.paperSubmittedAt ?? "" }).catch(() => null);
        if (!result) {
          messageApi.error("Chưa duyệt được, kiểm tra kết nối rồi thử lại.");
          return;
        }
        if (!result.ok) {
          messageApi.error(result.message, 8);
          return;
        }
        replaceRow(result.data);
        messageApi.success(`Đã duyệt đề ${paperLabel(row)}`);
      },
    });

  const submitReason = (values: { reason: string }) => {
    if (!reasonFor) return;
    const { row, mode } = reasonFor;
    startSaving(async () => {
      const result = await (mode === "return"
        ? returnExamPaper({ examSessionId: row.id, reason: values.reason, paperSubmittedAt: row.paperSubmittedAt ?? undefined })
        : mode === "unlock"
          ? unlockExamPaper({ examSessionId: row.id, reason: values.reason })
          : deleteExamSession({ id: row.id, reason: values.reason })
      ).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        reasonForm.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      setReasonFor(null);
      if (mode === "delete") {
        setRows((current) => current.filter((entry) => entry.id !== row.id));
        messageApi.success(`Đã xóa ca thi ${paperLabel(row)}`);
        return;
      }
      replaceRow(result.data as ExamSession);
      messageApi.success(mode === "return" ? `Đã trả lại đề ${paperLabel(row)}, giảng viên nhận thông báo kèm lý do` : `Đã mở khóa đề ${paperLabel(row)}, giảng viên được nộp lại`);
    });
  };

  const remove = (row: ExamSession) => {
    if (row.status === "published") {
      setReasonFor({ row, mode: "delete" });
      return;
    }
    modal.confirm({
      title: `Xóa ca thi ${paperLabel(row)}?`,
      content: "Ca dự kiến chưa công bố nên không ai nhận thông báo.",
      okText: "Xóa ca",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await deleteExamSession({ id: row.id }).catch(() => null);
        if (!result?.ok) {
          messageApi.error(result?.message ?? "Chưa xóa được, kiểm tra kết nối rồi thử lại.");
          return;
        }
        setRows((current) => current.filter((entry) => entry.id !== row.id));
        messageApi.success(`Đã xóa ca thi ${paperLabel(row)}`);
      },
    });
  };

  const openRoster = (row: ExamSession) =>
    startSaving(async () => {
      const result = await loadExamRoster(row.id).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? "Chưa tải được danh sách, thử lại.");
        return;
      }
      setRoster({ row, entries: result.data });
    });

  const generate = (values: GenerateValues) =>
    startSaving(async () => {
      const result = await generateFinalExams({
        termId,
        fromDate: values.range[0].format("YYYY-MM-DD"),
        toDate: values.range[1].format("YYYY-MM-DD"),
        durationMinutes: values.durationMinutes,
        paperDaysBefore: values.paperDaysBefore,
        defaultFormat: values.defaultFormat,
      }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa sinh được lịch, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        const { fromDate, toDate, ...rest } = result.fieldErrors ?? {};
        generateForm.setFields(toFormFields({ ...rest, ...(fromDate || toDate ? { range: fromDate ?? toDate } : {}) }));
        messageApi.error(result.message);
        return;
      }
      setIsGenerateOpen(false);
      messageApi.success(`Đã sinh ${result.data.created} ca cuối kỳ dự kiến (${result.data.fromSyllabus} ca theo hình thức trong đề cương)${result.data.skipped.length > 0 ? `; chưa xếp được ${result.data.skipped.join(", ")}` : ""}. Đang tải lại lịch.`, 6);
      refreshAll();
    });

  const paperReview = (row: ExamSession) => (
    <>
      {row.paperStatus === "returned" && row.paperReview?.returnReason && <span className="max-w-56 text-xs text-pretty text-rose-700">Lý do trả lại: {row.paperReview.returnReason}</span>}
      {row.paperStatus === "approved" && row.paperReview && (
        <span className="text-xs text-muted tabular-nums">
          {row.paperReview.reviewerName ?? "Phòng Khảo thí"} duyệt {formatDateTime(row.paperReview.reviewedAt)}
        </span>
      )}
      {row.paperStatus === "submitted" && row.paperSubmittedAt && row.papers.length > 0 && <span className="text-xs text-muted tabular-nums">Bản nộp {formatDateTime(row.paperSubmittedAt)}</span>}
      {canReviewRow(row) && (
        <span className="flex gap-1">
          <Button size="small" onClick={() => approve(row)} aria-label={`Duyệt đề ${paperLabel(row)}`}>
            Duyệt
          </Button>
          <Button size="small" onClick={() => setReasonFor({ row, mode: "return" })} aria-label={`Trả lại đề ${paperLabel(row)}`}>
            Trả lại
          </Button>
        </span>
      )}
      {canReview && row.paperStatus === "approved" && !row.hasStarted && row.papers.length > 0 && (
        <Button size="small" type="link" className="h-auto p-0" onClick={() => setReasonFor({ row, mode: "unlock" })} aria-label={`Mở khóa đề ${paperLabel(row)}`}>
          Mở khóa để sửa
        </Button>
      )}
    </>
  );

  const columns: TableColumnsType<ExamSession> = [
    {
      title: "Ngày thi",
      key: "when",
      width: 120,
      responsive: ["md"],
      sorter: (a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
      defaultSortOrder: "ascend",
      render: (_, row) => (
        <span className="flex flex-col tabular-nums">
          {formatDate(row.date)}
          <span className="text-xs text-muted">
            {row.startTime}, {row.durationMinutes} phút
          </span>
          <span className="text-xs text-muted">Hạn đề {formatDate(row.paperDeadline)}</span>
        </span>
      ),
    },
    {
      title: "Lớp học phần",
      key: "section",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-xs">
            {row.classCode}
            {row.makeupOfKind ? ` · bù ${EXAM_KIND_LABEL[row.makeupOfKind].toLowerCase()}` : ""}
          </span>
          <span className="truncate">{row.courseName}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted tabular-nums md:hidden">
            <StatusTag status={EXAM_STATUS[row.status]} />
            {formatDate(row.date)}, {row.startTime} · {row.rooms.map((room) => room.code).join(", ") || "chưa có phòng"}
          </span>
          <span className="mt-1 flex flex-col items-start gap-1 md:hidden">
            <StatusTag status={EXAM_PAPER_STATUS[row.paperStatus]} />
            <ExamPaperLinks examSessionId={row.id} papers={row.papers} />
            {paperReview(row)}
          </span>
        </span>
      ),
    },
    { title: "Hình thức", dataIndex: "format", width: 110, responsive: ["xl"], render: (value: ExamFormat) => EXAM_FORMAT_LABEL[value] },
    { title: "Phòng", key: "rooms", width: 150, responsive: ["md"], render: (_, row) => roomsCell(row) },
    {
      title: "Cán bộ coi thi",
      key: "proctors",
      width: 200,
      responsive: ["lg"],
      render: (_, row) => {
        const pending = row.swapRequests.filter((swap) => swap.decision === null);
        return (
          <span className="flex flex-col text-xs">
            {row.proctors.map((proctor) => (
              <span key={proctor.id}>
                {proctor.name} <span className="text-muted">({proctor.room})</span>
              </span>
            ))}
            {row.rooms.some((room) => room.proctors.length < PROCTORS_PER_ROOM) && <span className="text-amber-700">Phòng thiếu cán bộ</span>}
            {pending.length > 0 && (
              <Tooltip title={pending.map((swap) => `${swap.requesterName} đề nghị đổi cho ${swap.substituteName}: ${swap.reason}`).join("; ")}>
                <span className="cursor-help text-amber-700">{pending.length} đề nghị đổi ca chờ xử lý</span>
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      title: "Đề thi",
      key: "paperStatus",
      width: 200,
      responsive: ["md"],
      render: (_, row) => (
        <span className="flex flex-col items-start gap-1">
          <StatusTag status={EXAM_PAPER_STATUS[row.paperStatus]} />
          <ExamPaperLinks examSessionId={row.id} papers={row.papers} />
          {paperReview(row)}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 140,
      responsive: ["md"],
      render: (_, row) => {
        const issues = issuesOf(row);
        return (
          <span className="flex flex-col items-start gap-1">
            <StatusTag status={EXAM_STATUS[row.status]} />
            {issues.length > 0 && (
              <Tooltip title={issues.join("; ")}>
                <span className="cursor-help text-xs text-rose-700">{issues.length} vấn đề</span>
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 120,
      align: "right",
      fixed: "right",
      render: (_, row) => (
        <span className="flex flex-col items-end gap-1">
          {row.status !== "done" && !row.hasStarted && (
            <Button size="small" type="text" icon={<Pen size={14} aria-hidden className="text-zinc-500" />} onClick={() => setEditingId(row.id)} aria-label={`Sửa ca thi ${row.classCode}`}>
              Sửa
            </Button>
          )}
          <Button size="small" type="text" onClick={() => openRoster(row)} aria-label={`Danh sách thi ${row.classCode}`}>
            Danh sách
          </Button>
          {row.status !== "done" && !row.hasStarted && row.paperStatus === "not-submitted" && (
            <Button size="small" type="text" danger onClick={() => remove(row)} aria-label={`Xóa ca thi ${row.classCode}`}>
              Xóa
            </Button>
          )}
        </span>
      ),
    },
  ];

  const reasonTitle = reasonFor ? { return: `Trả lại đề ${paperLabel(reasonFor.row)}`, unlock: `Mở khóa đề ${paperLabel(reasonFor.row)}`, delete: `Xóa ca thi ${paperLabel(reasonFor.row)}` }[reasonFor.mode] : "";

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <PageHeader
        {...header}
        actions={
          <span className="flex flex-wrap gap-2">
            <Button icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => setIsCreating(true)}>
              Thêm ca thi
            </Button>
            <Button onClick={() => setIsGenerateOpen(true)}>Sinh ca cuối kỳ</Button>
            <Button type="primary" disabled={drafts.length === 0} onClick={publish}>
              Công bố lịch {drafts.length > 0 ? `(${drafts.length} ca)` : ""}
            </Button>
          </span>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          <Segmented<ExamKind>
            className="w-fit max-w-full"
            value={kind}
            onChange={setKind}
            options={(["midterm", "final", "makeup"] as const).map((value) => ({ value, label: EXAM_KIND_LABEL[value] }))}
          />
          <Input
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
            placeholder="Lớp, phòng, cán bộ coi thi"
            aria-label="Tìm ca thi"
            className="col-span-2 w-full sm:w-60"
          />
          <Select
            allowClear
            value={paper}
            onChange={setPaper}
            placeholder="Mọi trạng thái đề"
            aria-label="Trạng thái đề thi"
            options={Object.entries(EXAM_PAPER_STATUS).map(([value, meta]) => ({ value, label: meta.label }))}
            className="min-w-0 sm:w-48"
          />
          <Segmented
            className="w-fit max-w-full"
            value={onlyIssues ? "issues" : "all"}
            onChange={(value) => setOnlyIssues(value === "issues")}
            options={[
              { value: "all", label: "Tất cả" },
              { value: "issues", label: "Có vấn đề" },
            ]}
          />
        </div>
        <p className="text-xs text-muted tabular-nums">
          {ofKind.length} ca thi · {conflictCount} xung đột (tính trên toàn học kỳ) · {missingPapers} ca chưa có đề · {awaitingReview} đề chờ duyệt
        </p>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={visible}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 25, hideOnSinglePage: true }}
          locale={{ emptyText: <EmptyState illustration="search" title="Không có ca thi khớp bộ lọc" /> }}
        />
      </div>

      <ExamSessionForm
        key={editingId ?? (isCreating ? "new" : "closed")}
        open={editing !== null || isCreating}
        editing={editing}
        sessions={rows}
        classes={classes}
        deferrals={deferrals}
        rooms={rooms}
        proctors={proctors}
        onClose={() => {
          setEditingId(null);
          setIsCreating(false);
        }}
        onSaved={(exam, isNew) => {
          replaceRow(exam);
          setEditingId(null);
          setIsCreating(false);
          setKind(exam.kind);
          const warnings = exam.conflicts.filter((conflict) => !conflict.isHard);
          if (warnings.length > 0) messageApi.warning(`Đã lưu ${exam.classCode} kèm cảnh báo: ${warnings[0].message}`);
          else messageApi.success(isNew ? `Đã tạo ca thi ${paperLabel(exam)}` : `Đã cập nhật ca thi ${paperLabel(exam)}`);
        }}
      />

      <Modal
        open={reasonFor !== null}
        title={reasonTitle}
        okText={reasonFor?.mode === "delete" ? "Xóa ca" : reasonFor?.mode === "unlock" ? "Mở khóa đề" : "Trả lại đề"}
        okButtonProps={{ danger: reasonFor?.mode !== "return" }}
        cancelText="Hủy"
        onOk={() => reasonForm.submit()}
        confirmLoading={isSaving}
        onCancel={() => setReasonFor(null)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        {reasonFor && (
          <Form form={reasonForm} layout="vertical" onFinish={submitReason}>
            <p className="mb-3 text-sm text-pretty text-muted">
              {reasonFor.mode === "delete"
                ? "Ca đã công bố: sinh viên, giảng viên và cán bộ coi thi nhận thông báo hủy kèm lý do."
                : reasonFor.mode === "unlock"
                  ? "Đề đã duyệt chuyển sang bị trả lại, giảng viên thấy lý do và nộp lại trước giờ thi. Ghi vào nhật ký."
                  : "Giảng viên thấy lý do và nộp lại đề; đề quay về chờ duyệt."}
            </p>
            {reasonFor.mode !== "delete" && (
              <div className="mb-4">
                <ExamPaperLinks examSessionId={reasonFor.row.id} papers={reasonFor.row.papers} />
              </div>
            )}
            <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Chưa nhập lý do" }]}>
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={reasonFor.mode === "delete" ? 300 : EXAM_RETURN_REASON_MAX} showCount />
            </Form.Item>
          </Form>
        )}
      </Modal>

      <Modal
        open={isGenerateOpen}
        title="Sinh ca thi cuối kỳ"
        okText="Sinh lịch dự kiến"
        cancelText="Hủy"
        onOk={() => generateForm.submit()}
        confirmLoading={isSaving}
        onCancel={() => setIsGenerateOpen(false)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Form form={generateForm} layout="vertical" onFinish={generate} initialValues={{ durationMinutes: 90, paperDaysBefore: 7, defaultFormat: "written" }}>
          <p className="mb-3 text-sm text-pretty text-muted">
            Tạo ca dự kiến cho mọi lớp mở chưa có ca cuối kỳ: lớp đông xếp trước, đủ chỗ ngồi thi, 2 cán bộ cùng khoa mỗi phòng, không trùng lịch thi của sinh viên. Kiểm lại rồi công bố.
          </p>
          <Form.Item name="range" label="Đợt thi" rules={[{ required: true, message: "Chọn khoảng ngày thi" }]}>
            <DatePicker.RangePicker format="DD/MM/YYYY" className="w-full" />
          </Form.Item>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Form.Item name="durationMinutes" label="Thời lượng (phút)">
              <InputNumber min={15} max={240} step={15} className="w-full" />
            </Form.Item>
            <Form.Item name="paperDaysBefore" label="Hạn nộp đề trước ngày thi (ngày)">
              <InputNumber min={1} max={30} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item
            name="defaultFormat"
            label="Hình thức thi mặc định"
            extra="Lớp có đề cương đã công bố thì theo hình thức của bài cuối kỳ trong đề cương; lớp chưa có hoặc đề cương không ghi rõ thì theo hình thức này."
          >
            <Select options={EXAM_FORMAT_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer open={roster !== null} onClose={() => setRoster(null)} size={640} destroyOnHidden title={roster ? `Danh sách thi ${paperLabel(roster.row)}` : ""} extra={roster && <DownloadPdfButton action={() => exportExamRosterPdf(roster.row.id)} label="Tải PDF" />}>
        {roster && (
          <Table
            rowKey="enrollmentId"
            size="small"
            pagination={false}
            dataSource={roster.entries}
            locale={{ emptyText: <EmptyState illustration="search" title="Chưa xếp thí sinh" description="Chọn phòng thi rồi lưu ca để xếp thí sinh." /> }}
            columns={[
              { title: "SBD", dataIndex: "candidateNumber", width: 60, render: (value: number) => <span className="tabular-nums">{value}</span> },
              { title: "Phòng", dataIndex: "room", width: 120 },
              { title: "MSSV", dataIndex: "studentCode", width: 130 },
              { title: "Họ và tên", dataIndex: "fullName" },
            ]}
          />
        )}
      </Drawer>
    </>
  );
}
