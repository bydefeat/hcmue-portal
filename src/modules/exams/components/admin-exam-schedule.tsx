"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, DatePicker, Drawer, Form, Input, message, Modal, Segmented, Select, Table, Tooltip, type TableColumnsType } from "antd";
import type { Dayjs } from "dayjs";
import { Magnifier, Pen } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import {
  EXAM_FORMAT_LABEL,
  EXAM_FORMAT_OPTIONS,
  EXAM_KIND_LABEL,
  EXAM_PAPER_STATUS,
  EXAM_RETURN_REASON_MAX,
  EXAM_STATUS,
  examConflicts,
  PROCTORS_PER_ROOM,
} from "@/modules/exams/exams.constant";
import { paperReviewBlockedReason } from "@/modules/exams/exams.rule";
import type { ExamFormat, ExamKind, ExamPaperStatus, ExamSession } from "@/modules/exams/exams.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { toFormFields } from "@/shared/libs/form.lib";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { approveExamPaper, publishExamSessions, returnExamPaper, updateExamSession } from "@/modules/exams/exams.action";
import { ExamPaperLinks } from "@/modules/exams/components/exam-paper-links";

export type ExamRoomOption = { id: string; code: string; examCapacity: number; isAvailable: boolean };
export type ProctorOption = { id: string; name: string; faculty: string };

type AdminExamScheduleProps = {
  termId: string;
  sessions: ExamSession[];
  rooms: ExamRoomOption[];
  proctors: ProctorOption[];
  header: { title: string; description?: React.ReactNode };
};

type EditValues = { date: Dayjs; startTime: string; roomId: string; format: ExamFormat; proctorIds: string[] };

const START_TIMES = ["07:30", "09:30", "13:30", "15:30", "17:30"];

// Chỉ xét được đề của khoa trong phạm vi (server chỉ trả tệp đề cho các ca đó).
const canReview = (row: ExamSession) => row.papers.length > 0 && paperReviewBlockedReason(row) === null;

const paperLabel = (row: ExamSession) => `${EXAM_KIND_LABEL[row.kind].toLowerCase()} lớp ${row.classCode}`;

export function AdminExamSchedule({ termId, sessions, rooms, proctors, header }: AdminExamScheduleProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(sessions);
  const [kind, setKind] = useState<ExamKind>("final");
  const [query, setQuery] = useState("");
  const [paper, setPaper] = useState<ExamPaperStatus>();
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm<EditValues>();
  const [isSaving, startSaving] = useTransition();
  const editing = rows.find((row) => row.id === editingId) ?? null;
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnForm] = Form.useForm<{ reason: string }>();
  const [isReturning, startReturning] = useTransition();
  const returning = rows.find((row) => row.id === returningId) ?? null;

  useEffect(() => {
    if (!editing) return;
    form.setFieldsValue({
      date: dayjs(editing.date),
      startTime: editing.startTime,
      roomId: rooms.find((room) => room.code === editing.room)?.id,
      format: editing.format,
      proctorIds: editing.proctors.map((proctor) => proctor.id),
    });
  }, [editing, form, rooms]);

  const ofKind = rows.filter((row) => row.kind === kind);
  const conflicts = useMemo(() => examConflicts(ofKind), [ofKind]);
  const conflictsOf = (id: string) => conflicts.filter((conflict) => conflict.examId === id);
  const capacityOf = (code: string) => rooms.find((room) => room.code === code)?.examCapacity ?? 0;
  const drafts = ofKind.filter((row) => row.status === "draft");
  const missingPapers = ofKind.filter((row) => row.paperStatus === "not-submitted" && row.status !== "done").length;
  const awaitingReview = ofKind.filter(canReview).length;
  const replaceRow = (next: ExamSession) => setRows((current) => current.map((row) => (row.id === next.id ? next : row)));

  const visible = ofKind.filter(
    (row) =>
      (!paper || row.paperStatus === paper) &&
      (!onlyConflicts || conflictsOf(row.id).length > 0 || row.candidateCount > capacityOf(row.room)) &&
      (!query.trim() || normalizeSearch(`${row.classCode} ${row.courseName} ${row.room} ${row.proctors.map((proctor) => proctor.name).join(" ")}`).includes(normalizeSearch(query.trim()))),
  );

  const save = (values: EditValues) => {
    if (!editing) return;
    startSaving(async () => {
      const result = await updateExamSession({
        id: editing.id,
        date: values.date.format("YYYY-MM-DD"),
        startTime: values.startTime,
        roomId: values.roomId,
        format: values.format,
        proctorIds: values.proctorIds ?? [],
      }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      const next = result.data;
      const clash = examConflicts([...rows.filter((row) => row.kind === next.kind && row.id !== next.id), next]).filter((conflict) => conflict.examId === next.id);
      setRows((current) => current.map((row) => (row.id === next.id ? next : row)));
      setEditingId(null);
      if (clash.length > 0) messageApi.warning(`Đã lưu ${next.classCode} nhưng còn xung đột: ${clash[0].message}`);
      else messageApi.success(`Đã cập nhật lịch thi ${next.classCode}`);
    });
  };

  const publish = () =>
    modal.confirm({
      title: `Công bố lịch thi ${drafts.length} ca?`,
      content: `Sinh viên, giảng viên và cán bộ coi thi nhận thông báo ngay. ${conflicts.length > 0 ? `Lưu ý còn ${conflicts.length} xung đột chưa xử lý.` : "Không còn xung đột phòng hay cán bộ coi thi."}`,
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
          messageApi.error(result.message);
          return;
        }
        const published = new Set(result.data.ids);
        setRows((current) => current.map((row) => (published.has(row.id) ? { ...row, status: "published" } : row)));
        messageApi.success(`Đã công bố ${published.size} ca thi`);
      },
    });

  const approve = (row: ExamSession) =>
    modal.confirm({
      title: `Duyệt đề ${paperLabel(row)}?`,
      content: "Đề thi và đáp án sẽ bị khóa, giảng viên không nộp lại được nữa. Giảng viên nhận thông báo ngay.",
      okText: "Duyệt đề",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await approveExamPaper({ examSessionId: row.id }).catch(() => null);
        if (!result) {
          messageApi.error("Chưa duyệt được, kiểm tra kết nối rồi thử lại.");
          return;
        }
        if (!result.ok) {
          messageApi.error(result.message);
          return;
        }
        replaceRow(result.data);
        messageApi.success(`Đã duyệt đề ${paperLabel(row)}`);
      },
    });

  const submitReturn = (values: { reason: string }) => {
    if (!returning) return;
    const row = returning;
    startReturning(async () => {
      const result = await returnExamPaper({ examSessionId: row.id, reason: values.reason }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa trả lại được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        returnForm.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      replaceRow(result.data);
      setReturningId(null);
      messageApi.success(`Đã trả lại đề ${paperLabel(row)}, giảng viên nhận thông báo kèm lý do`);
    });
  };

  const paperReview = (row: ExamSession) => (
    <>
      {row.paperStatus === "returned" && row.paperReview?.returnReason && (
        <span className="max-w-56 text-xs text-pretty text-rose-700">Lý do trả lại: {row.paperReview.returnReason}</span>
      )}
      {row.paperStatus === "approved" && row.paperReview && (
        <span className="text-xs text-muted tabular-nums">
          {row.paperReview.reviewerName ?? "Phòng Khảo thí"} duyệt {formatDateTime(row.paperReview.reviewedAt)}
        </span>
      )}
      {canReview(row) && (
        <span className="flex gap-1">
          <Button size="small" onClick={() => approve(row)} aria-label={`Duyệt đề ${paperLabel(row)}`}>
            Duyệt
          </Button>
          <Button size="small" onClick={() => setReturningId(row.id)} aria-label={`Trả lại đề ${paperLabel(row)}`}>
            Trả lại
          </Button>
        </span>
      )}
    </>
  );

  const columns: TableColumnsType<ExamSession> = [
    {
      title: "Ngày thi",
      key: "when",
      width: 110,
      responsive: ["md"],
      sorter: (a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
      defaultSortOrder: "ascend",
      render: (_, row) => (
        <span className="flex flex-col tabular-nums">
          {formatDate(row.date)}
          <span className="text-xs text-muted">
            {row.startTime}, {row.durationMinutes} phút
          </span>
        </span>
      ),
    },
    {
      title: "Lớp học phần",
      key: "section",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-xs">{row.classCode}</span>
          <span className="truncate">{row.courseName}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted tabular-nums md:hidden">
            <StatusTag status={EXAM_STATUS[row.status]} />
            {formatDate(row.date)}, {row.startTime} · {row.room}
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
    {
      title: "Phòng",
      key: "room",
      width: 170,
      responsive: ["md"],
      render: (_, row) => {
        const capacity = capacityOf(row.room);
        const over = row.candidateCount > capacity;
        return (
          <span className="flex flex-col">
            <span className="text-xs">{row.room}</span>
            <span className={`text-xs tabular-nums ${over ? "text-rose-700" : "text-muted"}`}>
              {row.candidateCount} thí sinh / {capacity} chỗ{over ? `, cần ${Math.ceil(row.candidateCount / Math.max(capacity, 1))} phòng` : ""}
            </span>
          </span>
        );
      },
    },
    {
      title: "Cán bộ coi thi",
      key: "proctors",
      width: 190,
      responsive: ["lg"],
      render: (_, row) => (
        <span className="flex flex-col text-xs">
          {row.proctors.map((proctor) => (
            <span key={proctor.id}>{proctor.name}</span>
          ))}
          {row.proctors.length < PROCTORS_PER_ROOM && <span className="text-amber-700">Thiếu {PROCTORS_PER_ROOM - row.proctors.length} cán bộ</span>}
          {row.swapRequests.length > 0 && (
            <Tooltip title={row.swapRequests.map((swap) => `${swap.requesterName} đề nghị đổi cho ${swap.substituteName}: ${swap.reason}`).join("; ")}>
              <span className="cursor-help text-amber-700">{row.swapRequests.length} đề nghị đổi ca</span>
            </Tooltip>
          )}
        </span>
      ),
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
      width: 130,
      responsive: ["md"],
      render: (_, row) => {
        const issues = conflictsOf(row.id);
        return (
          <span className="flex flex-col items-start gap-1">
            <StatusTag status={EXAM_STATUS[row.status]} />
            {issues.length > 0 && (
              <Tooltip title={issues.map((issue) => issue.message).join("; ")}>
                <span className="cursor-help text-xs text-rose-700">{issues.length} xung đột</span>
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 72,
      align: "right",
      fixed: "right",
      render: (_, row) =>
        row.status === "done" ? null : (
          <Button size="small" type="text" icon={<Pen size={14} aria-hidden className="text-zinc-500" />} onClick={() => setEditingId(row.id)} aria-label={`Sửa ca thi ${row.classCode}`}>
            Sửa
          </Button>
        ),
    },
  ];

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <PageHeader
        {...header}
        actions={
          <Button type="primary" disabled={drafts.length === 0} onClick={publish}>
            Công bố lịch {drafts.length > 0 ? `(${drafts.length} ca)` : ""}
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          <Segmented<ExamKind>
            className="w-fit max-w-full"
            value={kind}
            onChange={setKind}
            options={[
              { value: "midterm", label: "Giữa kỳ" },
              { value: "final", label: "Cuối kỳ" },
            ]}
          />
          <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Lớp, phòng, cán bộ coi thi" aria-label="Tìm ca thi" className="col-span-2 w-full sm:w-60" />
          <Select allowClear value={paper} onChange={setPaper} placeholder="Mọi trạng thái đề" aria-label="Trạng thái đề thi" options={Object.entries(EXAM_PAPER_STATUS).map(([value, meta]) => ({ value, label: meta.label }))} className="min-w-0 sm:w-48" />
          <Segmented
            className="w-fit max-w-full"
            value={onlyConflicts ? "issues" : "all"}
            onChange={(value) => setOnlyConflicts(value === "issues")}
            options={[
              { value: "all", label: "Tất cả" },
              { value: "issues", label: "Có vấn đề" },
            ]}
          />
        </div>
        <p className="text-xs text-muted tabular-nums">
          {ofKind.length} ca thi · {conflicts.length} xung đột · {missingPapers} ca chưa có đề · {awaitingReview} đề chờ duyệt
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
        <Modal
          open={returning !== null}
          title={returning ? `Trả lại đề ${paperLabel(returning)}` : ""}
          okText="Trả lại đề"
          cancelText="Hủy"
          onOk={() => returnForm.submit()}
          confirmLoading={isReturning}
          onCancel={() => setReturningId(null)}
          mask={{ closable: false }}
          destroyOnHidden
        >
          {returning && (
            <Form form={returnForm} layout="vertical" onFinish={submitReturn}>
              <p className="mb-3 text-sm text-pretty text-muted">
                {returning.courseName}
                {returning.lecturerName ? `, ${returning.lecturerName}` : ""}. Giảng viên thấy lý do và nộp lại đề; đề quay về chờ duyệt.
              </p>
              <div className="mb-4">
                <ExamPaperLinks examSessionId={returning.id} papers={returning.papers} />
              </div>
              <Form.Item name="reason" label="Lý do trả lại" rules={[{ required: true, whitespace: true, message: "Chưa nhập lý do trả lại" }]}>
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={EXAM_RETURN_REASON_MAX} showCount placeholder="Ví dụ: đáp án câu 3 chưa có thang điểm chi tiết" />
              </Form.Item>
            </Form>
          )}
        </Modal>
        <Drawer
          open={editing !== null}
          onClose={() => setEditingId(null)}
          size={520}
          mask={{ closable: false }}
          destroyOnHidden
          title={editing ? `Ca thi ${editing.classCode}` : ""}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditingId(null)}>Hủy</Button>
              <Button type="primary" loading={isSaving} onClick={() => form.submit()}>
                Lưu
              </Button>
            </div>
          }
        >
          {editing && (
            <Form form={form} layout="vertical" onFinish={save}>
              <p className="mb-4 text-sm text-muted">
                {editing.courseName}, <span className="tabular-nums">{editing.candidateCount}</span> thí sinh
              </p>
              {editing.swapRequests.map((swap) => (
                <p key={swap.requesterId} className="mb-4 text-sm text-pretty text-amber-700">
                  {swap.requesterName} đề nghị đổi cho {swap.substituteName}: {swap.reason}. Đổi cán bộ coi thi bên dưới để xử lý.
                </p>
              ))}
              <div className="grid gap-x-3 sm:grid-cols-2">
                <Form.Item name="date" label="Ngày thi" rules={[{ required: true, message: "Chưa chọn ngày" }]}>
                  <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày" className="w-full" disabledDate={(date) => date.day() === 0} />
                </Form.Item>
                <Form.Item name="startTime" label="Giờ bắt đầu" rules={[{ required: true, message: "Chưa chọn giờ" }]}>
                  <Select options={START_TIMES.map((value) => ({ value, label: value }))} />
                </Form.Item>
              </div>
              <Form.Item name="format" label="Hình thức">
                <Select options={EXAM_FORMAT_OPTIONS} />
              </Form.Item>
              <Form.Item name="roomId" label="Phòng thi" rules={[{ required: true, message: "Chưa chọn phòng" }]} extra="Số trong ngoặc là số chỗ ngồi thi">
                <Select
                  showSearch={{ optionFilterProp: "label" }}
                  options={rooms.map((room) => ({ value: room.id, disabled: !room.isAvailable, label: `${room.code} (${room.examCapacity} chỗ)${room.isAvailable ? "" : ", đang bảo trì"}` }))}
                />
              </Form.Item>
              <Form.Item
                name="proctorIds"
                label="Cán bộ coi thi"
                rules={[{ validator: (_, value: string[] = []) => (value.length === PROCTORS_PER_ROOM ? Promise.resolve() : Promise.reject(new Error(`Mỗi phòng thi cần đúng ${PROCTORS_PER_ROOM} cán bộ coi thi`))) }]}
              >
                <Select mode="multiple" maxCount={PROCTORS_PER_ROOM} showSearch={{ optionFilterProp: "label" }} options={proctors.map((proctor) => ({ value: proctor.id, label: proctor.name }))} />
              </Form.Item>
            </Form>
          )}
        </Drawer>
      </div>
    </>
  );
}
