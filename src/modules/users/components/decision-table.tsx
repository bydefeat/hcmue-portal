"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, DatePicker, Drawer, Form, Input, message, Modal, Select, Table, Tooltip, type TableColumnsType } from "antd";
import type { Dayjs } from "dayjs";
import { Magnifier, Plus } from "defeat-icons-react";
import { DownloadPdfButton } from "@/shared/components/ui/download-pdf-button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { DECISION_KIND_LABEL, DECISION_KIND_OPTIONS, DECISION_STATUS, DISCIPLINE_LEVEL_LABEL, DISCIPLINE_LEVEL_OPTIONS, STUDENT_STATUS } from "@/modules/users/users.constant";
import { decisionBlockedReason } from "@/modules/users/users.rule";
import type { DecisionKind, DecisionStatus, DisciplineLevel, StudentDecision, StudentStatus } from "@/modules/users/users.type";
import { DecisionPreview } from "@/modules/users/components/decision-preview";
import { createDecision, deleteDecision, downloadDecisionPdf, returnDecision, revokeDecision, signDecision, submitDecision, updateDecision } from "@/modules/users/users.action";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";

export type DecisionStudentOption = { id: string; code: string; fullName: string; className: string; faculty: string; majorCode: string; cohort: number; status: StudentStatus };

export type DecisionClassOption = { code: string; majorCode: string; majorName: string; cohort: number };

type DecisionTableProps = {
  decisions: StudentDecision[];
  students: DecisionStudentOption[];
  classes: DecisionClassOption[];
  header: { title: string; description?: React.ReactNode };
  canManage: boolean;
  canSign: boolean;
  currentUserId: string;
};

type FormValues = {
  studentId: string;
  kind: DecisionKind;
  title: string;
  effectiveDate: Dayjs;
  basis: string;
  disciplineLevel?: DisciplineLevel;
  targetClassName?: string;
};

type ReasonStep = { row: StudentDecision; step: "return" | "revoke" };

const NETWORK_ERROR = "Chưa lưu được, kiểm tra kết nối rồi thử lại.";
const CREATABLE_KINDS = DECISION_KIND_OPTIONS.filter((option) => option.value !== "graduate");

function StatusCell({ row }: { row: StudentDecision }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusTag status={DECISION_STATUS[row.status]} />
      {row.status === "signed" && !row.appliedAt && <span className="text-xs text-muted">Chờ tới ngày hiệu lực</span>}
      {row.status === "draft" && row.returnReason && <span className="text-xs text-muted">Bị trả lại: {row.returnReason}</span>}
    </span>
  );
}

export function DecisionTable({ decisions, students, classes, header, canManage, canSign, currentUserId }: DecisionTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(decisions);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DecisionKind>();
  const [status, setStatus] = useState<DecisionStatus>();
  const [editing, setEditing] = useState<StudentDecision | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [reasonStep, setReasonStep] = useState<ReasonStep | null>(null);
  const [form] = Form.useForm<FormValues>();
  const [reasonForm] = Form.useForm<{ reason: string }>();
  const [isSaving, startSaving] = useTransition();
  const preview = rows.find((row) => row.id === previewId) ?? null;
  const chosenKind = Form.useWatch("kind", form);
  const chosenStudentId = Form.useWatch("studentId", form);
  const chosenLevel = Form.useWatch("disciplineLevel", form);
  const chosenStudent = students.find((student) => student.id === chosenStudentId);
  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const blocked = chosenStudent && chosenKind ? decisionBlockedReason(chosenKind, chosenStudent.status, chosenLevel ?? null) : null;
  const targetClasses = chosenStudent ? classes.filter((entry) => entry.majorCode !== chosenStudent.majorCode).toSorted((a, b) => Number(b.cohort === chosenStudent.cohort) - Number(a.cohort === chosenStudent.cohort) || a.code.localeCompare(b.code)) : [];

  useEffect(() => {
    if (!isDrawerOpen) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue({
        studentId: editing.studentId,
        kind: editing.kind,
        title: editing.title,
        basis: editing.basis,
        effectiveDate: dayjs(editing.effectiveDate),
        disciplineLevel: editing.disciplineLevel ?? undefined,
        targetClassName: editing.targetClassName ?? undefined,
      });
    }
  }, [isDrawerOpen, editing, form]);

  useEffect(() => {
    if (reasonStep) reasonForm.resetFields();
  }, [reasonStep, reasonForm]);

  const visible = rows.filter(
    (row) =>
      (!kind || row.kind === kind) &&
      (!status || row.status === status) &&
      (!query.trim() || normalizeSearch(`${row.studentName} ${row.studentCode} ${row.number ?? ""} ${row.title}`).includes(normalizeSearch(query.trim()))),
  );

  const replace = (saved: StudentDecision) => setRows((current) => current.map((row) => (row.id === saved.id ? saved : row)));

  const openCreate = () => {
    setEditing(null);
    setIsDrawerOpen(true);
  };

  const openEdit = (row: StudentDecision) => {
    setEditing(row);
    setIsDrawerOpen(true);
  };

  const save = (values: FormValues) =>
    startSaving(async () => {
      const input = { ...values, effectiveDate: values.effectiveDate.format("YYYY-MM-DD"), disciplineLevel: values.disciplineLevel ?? null, targetClassName: values.targetClassName ?? null };
      const result = await (editing ? updateDecision(editing.id, input) : createDecision(input)).catch(() => null);
      if (!result) {
        messageApi.error(NETWORK_ERROR);
        return;
      }
      if (!result.ok) {
        form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      if (editing) replace(result.data);
      else setRows((current) => [result.data, ...current]);
      setIsDrawerOpen(false);
      messageApi.success(editing ? `Đã lưu dự thảo quyết định của ${result.data.studentName}` : `Đã lập dự thảo quyết định cho ${result.data.studentName}`);
    });

  const submit = (row: StudentDecision) =>
    startSaving(async () => {
      const result = await submitDecision(row.id).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      replace(result.data);
      messageApi.success(`Đã trình ký quyết định ${result.data.number} cho ${row.studentName}`);
    });

  const cancelDraft = (row: StudentDecision) =>
    modal.confirm({
      title: "Hủy dự thảo quyết định?",
      content: `Dự thảo "${row.title}" của ${row.studentName} bị xóa. Nhật ký thao tác vẫn giữ dấu vết.`,
      okText: "Hủy dự thảo",
      okButtonProps: { danger: true },
      cancelText: "Giữ lại",
      mask: { closable: false },
      onOk: async () => {
        const result = await deleteDecision(row.id).catch(() => null);
        if (!result?.ok) {
          messageApi.error(result?.message ?? NETWORK_ERROR);
          return;
        }
        setRows((current) => current.filter((entry) => entry.id !== row.id));
        messageApi.success(`Đã hủy dự thảo quyết định của ${row.studentName}`);
      },
    });

  const sign = (row: StudentDecision) => {
    const future = dayjs(row.effectiveDate).isAfter(dayjs(), "day");
    modal.confirm({
      title: `Ký quyết định ${row.number}?`,
      content: future
        ? `Quyết định có hiệu lực từ ${formatDate(row.effectiveDate)}. Tới ngày đó hồ sơ của sinh viên mới được cập nhật theo quyết định.`
        : `Quyết định có hiệu lực từ ${formatDate(row.effectiveDate)}. Hồ sơ của sinh viên được cập nhật ngay theo quyết định.`,
      okText: "Ký",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await signDecision(row.id).catch(() => null);
        if (!result?.ok) {
          messageApi.error(result?.message ?? NETWORK_ERROR);
          return;
        }
        replace(result.data);
        messageApi.success(`Đã ký quyết định ${row.number}`);
      },
    });
  };

  const finishReason = ({ reason }: { reason: string }) =>
    startSaving(async () => {
      if (!reasonStep) return;
      const { row, step } = reasonStep;
      const result = await (step === "return" ? returnDecision(row.id, reason) : revokeDecision(row.id, reason)).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      replace(result.data);
      setReasonStep(null);
      messageApi.success(step === "return" ? `Đã trả lại quyết định của ${row.studentName} cho người lập` : `Đã thu hồi quyết định ${row.number}`);
    });

  const numberLink = (row: StudentDecision) => (
    <Button type="link" size="small" onClick={() => setPreviewId(row.id)} className="h-auto p-0 text-xs">
      {row.number ?? "Xem dự thảo"}
    </Button>
  );

  const actions = (row: StudentDecision) => {
    const own = row.createdByUserId === currentUserId;
    return (
      <div className="flex flex-wrap justify-end gap-1">
        {row.status === "draft" && canManage && (
          <>
            <Button size="small" type="text" onClick={() => openEdit(row)}>
              Sửa
            </Button>
            <Button size="small" type="text" disabled={isSaving} onClick={() => submit(row)}>
              Trình ký
            </Button>
            <Button size="small" type="text" danger onClick={() => cancelDraft(row)}>
              Hủy
            </Button>
          </>
        )}
        {row.status === "pending-signature" && canSign && (
          <>
            <Tooltip title={own ? "Bạn lập dự thảo này nên không tự ký được" : undefined}>
              <Button size="small" type="text" disabled={own} onClick={() => sign(row)}>
                Ký
              </Button>
            </Tooltip>
            <Button size="small" type="text" onClick={() => setReasonStep({ row, step: "return" })}>
              Trả lại
            </Button>
          </>
        )}
        {row.status === "signed" && canSign && (
          <Button size="small" type="text" danger onClick={() => setReasonStep({ row, step: "revoke" })}>
            Thu hồi
          </Button>
        )}
      </div>
    );
  };

  const columns: TableColumnsType<StudentDecision> = [
    { title: "Số quyết định", key: "number", width: 130, responsive: ["md"], render: (_, row) => numberLink(row) },
    {
      title: "Sinh viên",
      key: "student",
      width: 210,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.studentName}</span>
          <span className="truncate text-xs text-muted">
            {row.studentCode} · {row.className}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:hidden">
            <StatusTag status={DECISION_STATUS[row.status]} />
            {DECISION_KIND_LABEL[row.kind]}
            {numberLink(row)}
          </span>
        </span>
      ),
    },
    {
      title: "Loại",
      key: "kind",
      width: 170,
      responsive: ["md"],
      render: (_, row) => (
        <span className="flex flex-col">
          {DECISION_KIND_LABEL[row.kind]}
          {row.disciplineLevel && <span className="text-xs text-muted">{DISCIPLINE_LEVEL_LABEL[row.disciplineLevel]}</span>}
          {row.targetClassName && <span className="text-xs text-muted">Sang lớp {row.targetClassName}</span>}
        </span>
      ),
    },
    { title: "Nội dung", dataIndex: "title", width: 280, responsive: ["md"], render: (value: string) => <span className="text-pretty">{value}</span> },
    { title: "Hiệu lực", dataIndex: "effectiveDate", width: 100, responsive: ["md"], render: (value: string) => <span className="text-xs tabular-nums">{formatDate(value)}</span> },
    { title: "Trạng thái", key: "status", width: 160, responsive: ["md"], render: (_, row) => <StatusCell row={row} /> },
    { title: "", key: "actions", width: 170, align: "right", fixed: "right", render: (_, row) => actions(row) },
  ];

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <PageHeader
        {...header}
        actions={
          canManage ? (
            <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={openCreate}>
              Lập quyết định
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Số quyết định, sinh viên, nội dung" aria-label="Tìm quyết định" className="col-span-2 w-full sm:w-64" />
          <Select allowClear value={kind} onChange={setKind} placeholder="Mọi loại" aria-label="Loại quyết định" options={DECISION_KIND_OPTIONS} className="min-w-0 sm:w-56" />
          <Select allowClear value={status} onChange={setStatus} placeholder="Mọi trạng thái" aria-label="Trạng thái" options={Object.entries(DECISION_STATUS).map(([value, meta]) => ({ value, label: meta.label }))} className="min-w-0 sm:w-40" />
        </div>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={visible}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <EmptyState illustration="search" title="Không có quyết định khớp bộ lọc" /> }}
        />
        <Drawer
          open={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          size={560}
          mask={{ closable: false }}
          destroyOnHidden
          title={editing ? "Sửa dự thảo quyết định" : "Lập quyết định sinh viên"}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsDrawerOpen(false)}>Hủy</Button>
              <Button type="primary" loading={isSaving} onClick={() => form.submit()}>
                Lưu dự thảo
              </Button>
            </div>
          }
        >
          <Form form={form} layout="vertical" onFinish={save}>
            <Form.Item
              name="studentId"
              label="Sinh viên"
              rules={[{ required: true, message: "Chưa chọn sinh viên" }]}
              extra={chosenStudent ? `Tình trạng hiện tại: ${STUDENT_STATUS[chosenStudent.status].label}` : undefined}
            >
              <Select
                disabled={editing !== null}
                showSearch={{ optionFilterProp: "label" }}
                placeholder="Gõ tên hoặc mã sinh viên"
                options={students.map((student) => ({ value: student.id, label: `${student.fullName} ${student.code} ${student.className}` }))}
              />
            </Form.Item>
            <Form.Item
              name="kind"
              label="Loại quyết định"
              rules={[{ required: true, message: "Chưa chọn loại" }]}
              validateStatus={blocked ? "error" : undefined}
              help={blocked ?? undefined}
              extra="Quyết định công nhận tốt nghiệp lập ở trang Xét tốt nghiệp."
            >
              <Select
                disabled={editing !== null}
                placeholder="Chọn loại quyết định"
                options={editing?.kind === "graduate" ? DECISION_KIND_OPTIONS : CREATABLE_KINDS}
                onChange={(value: DecisionKind) => {
                  if (!form.getFieldValue("title")) form.setFieldValue("title", DECISION_KIND_LABEL[value]);
                }}
              />
            </Form.Item>
            {chosenKind === "discipline" && (
              <Form.Item name="disciplineLevel" label="Hình thức kỷ luật" rules={[{ required: true, message: "Chưa chọn hình thức kỷ luật" }]} extra="Đình chỉ học tập đưa sinh viên về tình trạng tạm ngừng học khi quyết định có hiệu lực.">
                <Select options={DISCIPLINE_LEVEL_OPTIONS} />
              </Form.Item>
            )}
            {chosenKind === "major-change" && (
              <Form.Item name="targetClassName" label="Lớp sinh hoạt của ngành mới" rules={[{ required: true, message: "Chưa chọn lớp của ngành mới" }]} extra="Khi quyết định có hiệu lực, sinh viên chuyển sang lớp này.">
                <Select
                  showSearch={{ optionFilterProp: "label" }}
                  disabled={!chosenStudent}
                  placeholder={chosenStudent ? "Chọn lớp" : "Chọn sinh viên trước"}
                  options={targetClasses.map((entry) => ({ value: entry.code, label: `${entry.code} · ${entry.majorName}` }))}
                />
              </Form.Item>
            )}
            <Form.Item name="title" label="Nội dung quyết định" rules={[{ required: true, whitespace: true, message: "Chưa nhập nội dung" }]}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={300} showCount />
            </Form.Item>
            <Form.Item name="basis" label="Căn cứ" rules={[{ required: true, whitespace: true, message: "Chưa nhập căn cứ" }]} extra="Ví dụ: đơn của sinh viên, biên bản họp hội đồng">
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} showCount />
            </Form.Item>
            <Form.Item name="effectiveDate" label="Có hiệu lực từ" rules={[{ required: true, message: "Chưa chọn ngày" }]} extra="Ký trước ngày này thì hồ sơ sinh viên được cập nhật đúng ngày hiệu lực.">
              <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày" className="w-full" />
            </Form.Item>
          </Form>
        </Drawer>
        <Modal
          open={reasonStep !== null}
          onCancel={() => setReasonStep(null)}
          title={reasonStep?.step === "return" ? `Trả lại quyết định ${reasonStep.row.number}` : `Thu hồi quyết định ${reasonStep?.row.number ?? ""}`}
          mask={{ closable: false }}
          destroyOnHidden
          okText={reasonStep?.step === "return" ? "Trả lại" : "Thu hồi"}
          okButtonProps={{ danger: reasonStep?.step === "revoke", loading: isSaving }}
          cancelText="Hủy"
          onOk={() => reasonForm.submit()}
        >
          <p className="mb-4 text-sm text-pretty text-muted">
            {reasonStep?.step === "return"
              ? "Quyết định về dự thảo để người lập sửa, số quyết định đã cấp được bỏ."
              : `Quyết định hết hiệu lực. ${reasonStep?.row.appliedAt ? "Hồ sơ của sinh viên trở về đúng tình trạng, lớp trước khi quyết định có hiệu lực." : "Quyết định chưa có hiệu lực nên hồ sơ sinh viên không đổi."}`}
          </p>
          <Form form={reasonForm} layout="vertical" onFinish={finishReason}>
            <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Chưa ghi lý do" }]}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} showCount />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          open={preview !== null}
          onCancel={() => setPreviewId(null)}
          title={preview ? `Quyết định ${preview.number ?? "dự thảo"}` : ""}
          width={720}
          destroyOnHidden
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPreviewId(null)}>Đóng</Button>
              {preview && <DownloadPdfButton action={() => downloadDecisionPdf(preview.id)} />}
              <Button onClick={() => window.print()}>In quyết định</Button>
            </div>
          }
        >
          {preview && (
            <div className="flex flex-col gap-3">
              {preview.status === "revoked" && (
                <p className="text-sm text-pretty">
                  Đã thu hồi lúc {formatDate(preview.revokedAt ?? "")} bởi {preview.revokedBy}. Lý do: {preview.revokeReason}
                </p>
              )}
              {preview.status === "signed" && (
                <p className="text-sm text-muted">{preview.appliedAt ? `Đã cập nhật hồ sơ sinh viên ngày ${formatDate(preview.appliedAt)}.` : `Hồ sơ sinh viên sẽ được cập nhật ngày ${formatDate(preview.effectiveDate)}.`}</p>
              )}
              {studentById.get(preview.studentId) && <p className="text-xs text-muted">Tình trạng hiện tại: {STUDENT_STATUS[studentById.get(preview.studentId)!.status].label}</p>}
              <DecisionPreview decision={preview} />
            </div>
          )}
        </Modal>
      </div>
    </>
  );
}
