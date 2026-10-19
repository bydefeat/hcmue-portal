"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, DatePicker, Drawer, Form, Input, message, Modal, Segmented, Select, Table, Tooltip, type TableColumnsType } from "antd";
import type { Dayjs } from "dayjs";
import { Magnifier, Pen } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import { EXAM_FORMAT_LABEL, EXAM_FORMAT_OPTIONS, EXAM_PAPER_STATUS, EXAM_STATUS, examConflicts, PROCTORS_PER_ROOM } from "@/modules/exams/exams.constant";
import type { ExamFormat, ExamKind, ExamPaperStatus, ExamSession } from "@/modules/exams/exams.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";

export type ExamRoomOption = { code: string; examCapacity: number; isAvailable: boolean };
export type ProctorOption = { id: string; name: string; faculty: string };

type AdminExamScheduleProps = {
  sessions: ExamSession[];
  rooms: ExamRoomOption[];
  proctors: ProctorOption[];
  header: { title: string; description?: React.ReactNode };
};

type EditValues = { date: Dayjs; startTime: string; room: string; format: ExamFormat; proctorIds: string[] };

const START_TIMES = ["07:30", "09:30", "13:30", "15:30", "17:30"];

export function AdminExamSchedule({ sessions, rooms, proctors, header }: AdminExamScheduleProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(sessions);
  const [kind, setKind] = useState<ExamKind>("final");
  const [query, setQuery] = useState("");
  const [paper, setPaper] = useState<ExamPaperStatus>();
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm<EditValues>();
  const editing = rows.find((row) => row.id === editingId) ?? null;

  useEffect(() => {
    if (!editing) return;
    form.setFieldsValue({ date: dayjs(editing.date), startTime: editing.startTime, room: editing.room, format: editing.format, proctorIds: editing.proctors.map((proctor) => proctor.id) });
  }, [editing, form]);

  const ofKind = rows.filter((row) => row.kind === kind);
  const conflicts = useMemo(() => examConflicts(ofKind), [ofKind]);
  const conflictsOf = (id: string) => conflicts.filter((conflict) => conflict.examId === id);
  const capacityOf = (code: string) => rooms.find((room) => room.code === code)?.examCapacity ?? 0;
  const drafts = ofKind.filter((row) => row.status === "draft");
  const missingPapers = ofKind.filter((row) => row.paperStatus === "not-submitted" && row.status !== "done").length;

  const visible = ofKind.filter(
    (row) =>
      (!paper || row.paperStatus === paper) &&
      (!onlyConflicts || conflictsOf(row.id).length > 0 || row.candidateCount > capacityOf(row.room)) &&
      (!query.trim() || normalizeSearch(`${row.classCode} ${row.courseName} ${row.room} ${row.proctors.map((proctor) => proctor.name).join(" ")}`).includes(normalizeSearch(query.trim()))),
  );

  const save = (values: EditValues) => {
    if (!editing) return;
    const next: ExamSession = {
      ...editing,
      date: values.date.format("YYYY-MM-DD"),
      startTime: values.startTime,
      room: values.room,
      format: values.format,
      proctors: values.proctorIds.map((id) => ({ id, name: proctors.find((proctor) => proctor.id === id)?.name ?? id })),
    };
    const clash = examConflicts([...rows.filter((row) => row.kind === kind && row.id !== next.id), next]).filter((conflict) => conflict.examId === next.id);
    setRows((current) => current.map((row) => (row.id === next.id ? next : row)));
    setEditingId(null);
    if (clash.length > 0) messageApi.warning(`Đã lưu ${next.classCode} nhưng còn xung đột: ${clash[0].message}`);
    else messageApi.success(`Đã cập nhật lịch thi ${next.classCode}`);
  };

  const publish = () =>
    modal.confirm({
      title: `Công bố lịch thi ${drafts.length} ca?`,
      content: `Sinh viên, giảng viên và cán bộ coi thi nhận thông báo ngay. ${conflicts.length > 0 ? `Lưu ý còn ${conflicts.length} xung đột chưa xử lý.` : "Không còn xung đột phòng hay cán bộ coi thi."}`,
      okText: "Công bố",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: () => {
        setRows((current) => current.map((row) => (row.kind === kind && row.status === "draft" ? { ...row, status: "published" } : row)));
        messageApi.success(`Đã công bố ${drafts.length} ca thi`);
      },
    });

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
      render: (_, row) =>
        row.proctors.length < PROCTORS_PER_ROOM ? (
          <span className="flex flex-col text-xs">
            {row.proctors.map((proctor) => (
              <span key={proctor.id}>{proctor.name}</span>
            ))}
            <span className="text-amber-700">Thiếu {PROCTORS_PER_ROOM - row.proctors.length} cán bộ</span>
          </span>
        ) : (
          <span className="flex flex-col text-xs">
            {row.proctors.map((proctor) => (
              <span key={proctor.id}>{proctor.name}</span>
            ))}
          </span>
        ),
    },
    { title: "Đề thi", dataIndex: "paperStatus", width: 130, responsive: ["md"], render: (value: ExamPaperStatus) => <StatusTag status={EXAM_PAPER_STATUS[value]} /> },
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
          {ofKind.length} ca thi · {conflicts.length} xung đột · {missingPapers} ca chưa có đề
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
              <Button type="primary" onClick={() => form.submit()}>
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
              <Form.Item name="room" label="Phòng thi" rules={[{ required: true, message: "Chưa chọn phòng" }]} extra="Số trong ngoặc là số chỗ ngồi thi">
                <Select
                  showSearch={{ optionFilterProp: "label" }}
                  options={rooms.map((room) => ({ value: room.code, disabled: !room.isAvailable, label: `${room.code} (${room.examCapacity} chỗ)${room.isAvailable ? "" : ", đang bảo trì"}` }))}
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
