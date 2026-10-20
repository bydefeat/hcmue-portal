"use client";

import { useState, useTransition } from "react";
import { Button, Form, Input, message, Modal, Segmented, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { formatDate } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { allowExamDespiteAbsence, deferExam, listSectionStudents, revokeExamOverride } from "@/modules/exams/exams.action";
import { EXAM_KIND_LABEL } from "@/modules/exams/exams.constant";
import type { ExamClassOption, ExamDeferralRow, ExamEligibilityRow as EligibilityRow } from "@/modules/exams/exams.type";

type Props = { rows: EligibilityRow[]; deferrals: ExamDeferralRow[]; classes: ExamClassOption[]; limitPercent: number };

type View = "banned" | "deferred";

type DeferValues = { classSectionId: string; enrollmentId: string; kind: "midterm" | "final"; reason: string };

export function AdminExamEligibility({ rows: initialRows, deferrals: initialDeferrals, classes, limitPercent }: Props) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(initialRows);
  const [deferrals, setDeferrals] = useState(initialDeferrals);
  const [view, setView] = useState<View>("banned");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string>();
  const [target, setTarget] = useState<{ row: EligibilityRow; mode: "allow" | "revoke" } | null>(null);
  const [reasonForm] = Form.useForm<{ reason: string }>();
  const [isDeferOpen, setIsDeferOpen] = useState(false);
  const [deferForm] = Form.useForm<DeferValues>();
  const [students, setStudents] = useState<{ enrollmentId: string; code: string; fullName: string }[]>([]);
  const [isSaving, startSaving] = useTransition();
  const sections = [...new Set(rows.map((row) => row.sectionCode))].toSorted();
  const matches = (text: string) => !query.trim() || normalizeSearch(text).includes(normalizeSearch(query.trim()));
  const visible = rows.filter((row) => (!section || row.sectionCode === section) && matches(`${row.fullName} ${row.studentCode} ${row.sectionCode}`));
  const visibleDeferrals = deferrals.filter((row) => matches(`${row.fullName} ${row.studentCode} ${row.sectionCode}`));

  const decide = (values: { reason: string }) => {
    if (!target) return;
    const { row, mode } = target;
    startSaving(async () => {
      const result = await (mode === "allow" ? allowExamDespiteAbsence({ enrollmentId: row.enrollmentId, reason: values.reason }) : revokeExamOverride({ enrollmentId: row.enrollmentId, reason: values.reason })).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        reasonForm.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      setRows((current) => current.map((entry) => (entry.enrollmentId === row.enrollmentId ? { ...entry, overrideReason: mode === "allow" ? values.reason.trim() : null } : entry)));
      messageApi.success(mode === "allow" ? `Đã cho ${row.fullName} dự thi ${row.sectionCode}, sinh viên nhận thông báo` : `Đã thu hồi quyết định cho ${row.fullName} dự thi, sinh viên nhận thông báo`);
      setTarget(null);
    });
  };

  const pickClass = (classSectionId: string) => {
    deferForm.setFieldValue("enrollmentId", undefined);
    setStudents([]);
    void listSectionStudents(classSectionId).then((result) => {
      if (result.ok) setStudents(result.data);
    });
  };

  const defer = (values: DeferValues) =>
    startSaving(async () => {
      const result = await deferExam({ enrollmentId: values.enrollmentId, kind: values.kind, reason: values.reason }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        deferForm.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      const student = students.find((entry) => entry.enrollmentId === values.enrollmentId);
      const klass = classes.find((entry) => entry.id === values.classSectionId);
      setDeferrals((current) => [
        {
          id: result.data.id,
          enrollmentId: values.enrollmentId,
          classSectionId: values.classSectionId,
          kind: values.kind,
          studentCode: student?.code ?? "",
          fullName: student?.fullName ?? "",
          sectionCode: klass?.code ?? "",
          courseName: klass?.courseName ?? "",
          faculty: klass?.faculty ?? "",
          reason: values.reason.trim(),
          decidedAt: new Date().toISOString(),
          hasMakeup: false,
        },
        ...current,
      ]);
      setIsDeferOpen(false);
      messageApi.success(`Đã ghi nhận ${student?.fullName ?? "sinh viên"} hoãn thi, sinh viên rời danh sách thi của ca ${EXAM_KIND_LABEL[values.kind].toLowerCase()}`);
    });

  const columns: TableColumnsType<EligibilityRow> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 230,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="truncate text-xs text-muted">
            {row.studentCode} · {row.className}
          </span>
          <span className="mt-1 text-xs text-muted tabular-nums md:hidden">
            {row.sectionCode} · vắng {row.absentPeriods}/{row.plannedPeriods} tiết
          </span>
        </span>
      ),
    },
    {
      title: "Lớp học phần",
      key: "section",
      width: 240,
      responsive: ["md"],
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-xs">{row.sectionCode}</span>
          <span className="truncate">{row.courseName}</span>
        </span>
      ),
    },
    {
      title: "Tiết vắng / kế hoạch",
      key: "absences",
      width: 170,
      responsive: ["md"],
      sorter: (a, b) => a.ratio - b.ratio,
      render: (_, row) => (
        <span className="tabular-nums">
          {row.absentPeriods}/{row.plannedPeriods} tiết, <span className="text-rose-700">{Math.round(row.ratio * 100)}%</span>
        </span>
      ),
    },
    {
      title: "Kết quả",
      key: "result",
      width: 260,
      responsive: ["md"],
      render: (_, row) =>
        row.overrideReason ? (
          <span className="flex flex-col items-start gap-1">
            <StatusTag status={{ label: "Được dự thi", tone: "success" }} />
            <span className="text-xs text-pretty text-muted">{row.overrideReason}</span>
          </span>
        ) : (
          <span className="text-muted">Cấm thi</span>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 110,
      align: "right",
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="text" danger={row.overrideReason !== null} onClick={() => setTarget({ row, mode: row.overrideReason ? "revoke" : "allow" })}>
          {row.overrideReason ? "Thu hồi" : "Cho dự thi"}
        </Button>
      ),
    },
  ];

  const deferralColumns: TableColumnsType<ExamDeferralRow> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 230,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="text-xs text-muted">{row.studentCode}</span>
        </span>
      ),
    },
    {
      title: "Kỳ thi",
      key: "kind",
      width: 240,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-xs">
            {EXAM_KIND_LABEL[row.kind]} · {row.sectionCode}
          </span>
          <span className="truncate">{row.courseName}</span>
        </span>
      ),
    },
    { title: "Lý do", dataIndex: "reason", width: 260, responsive: ["md"], render: (value: string) => <span className="text-pretty">{value}</span> },
    { title: "Ngày ghi nhận", dataIndex: "decidedAt", width: 120, responsive: ["md"], render: (value: string) => <span className="tabular-nums">{formatDate(value)}</span> },
    {
      title: "Thi bù",
      dataIndex: "hasMakeup",
      width: 140,
      render: (value: boolean) => (value ? <StatusTag status={{ label: "Đã xếp ca bù", tone: "success" }} /> : <StatusTag status={{ label: "Chờ xếp ca bù", tone: "warning" }} />),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "banned", label: `Vắng quá ngưỡng (${rows.length})` },
            { value: "deferred", label: `Hoãn thi (${deferrals.length})` },
          ]}
        />
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Tên, mã sinh viên, mã lớp" aria-label="Tìm" className="w-full sm:w-64" />
        {view === "banned" ? (
          <Select allowClear showSearch={{ optionFilterProp: "label" }} value={section} onChange={setSection} placeholder="Mọi lớp học phần" aria-label="Lớp học phần" options={sections.map((value) => ({ value, label: value }))} className="w-full sm:w-52" />
        ) : (
          <Button icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => setIsDeferOpen(true)} className="sm:ml-auto">
            Ghi nhận hoãn thi
          </Button>
        )}
      </div>
      {view === "banned" ? (
        <Table
          rowKey="key"
          size="small"
          columns={columns}
          dataSource={visible}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 25, hideOnSinglePage: true, showTotal: (total) => `${total} trường hợp` }}
          locale={{ emptyText: <EmptyState illustration="done" title="Không có sinh viên bị cấm thi" description={`Không sinh viên nào vắng quá ${limitPercent}% tổng số tiết của học phần.`} /> }}
        />
      ) : (
        <Table
          rowKey="id"
          size="small"
          columns={deferralColumns}
          dataSource={visibleDeferrals}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 25, hideOnSinglePage: true }}
          locale={{ emptyText: <EmptyState illustration="done" title="Chưa có sinh viên hoãn thi" description="Sinh viên được hoãn thi rời danh sách thi của ca đó và chờ xếp ca thi bù ở trang Lịch thi." /> }}
        />
      )}
      <Modal
        open={target !== null}
        onCancel={() => setTarget(null)}
        title={target ? (target.mode === "allow" ? `Cho ${target.row.fullName} dự thi ${target.row.sectionCode}` : `Thu hồi quyết định cho ${target.row.fullName} dự thi`) : ""}
        okText={target?.mode === "revoke" ? "Thu hồi" : "Cho dự thi"}
        okButtonProps={{ danger: target?.mode === "revoke" }}
        cancelText="Hủy"
        onOk={() => reasonForm.submit()}
        confirmLoading={isSaving}
        mask={{ closable: false }}
        destroyOnHidden
        width={480}
      >
        <Form form={reasonForm} layout="vertical" onFinish={decide}>
          <p className="mb-3 text-sm text-pretty text-muted">
            {target?.mode === "revoke" ? "Sinh viên trở lại diện cấm thi và nhận thông báo kèm lý do. Quyết định cũ vẫn lưu trong nhật ký." : "Chỉ áp dụng khi có minh chứng vắng hợp lệ. Lý do được lưu cùng người quyết định, sinh viên nhận thông báo."}
          </p>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Chưa nhập lý do" }]}>
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={isDeferOpen}
        onCancel={() => setIsDeferOpen(false)}
        title="Ghi nhận hoãn thi"
        okText="Ghi nhận"
        cancelText="Hủy"
        onOk={() => deferForm.submit()}
        confirmLoading={isSaving}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Form form={deferForm} layout="vertical" onFinish={defer} initialValues={{ kind: "final" }}>
          <Form.Item name="classSectionId" label="Lớp học phần" rules={[{ required: true, message: "Chọn lớp" }]}>
            <Select showSearch={{ optionFilterProp: "label" }} options={classes.map((entry) => ({ value: entry.id, label: `${entry.code} ${entry.courseName}` }))} onChange={pickClass} />
          </Form.Item>
          <Form.Item name="enrollmentId" label="Sinh viên" rules={[{ required: true, message: "Chọn sinh viên" }]}>
            <Select showSearch={{ optionFilterProp: "label" }} options={students.map((entry) => ({ value: entry.enrollmentId, label: `${entry.fullName} (${entry.code})` }))} />
          </Form.Item>
          <Form.Item name="kind" label="Kỳ thi">
            <Select options={(["midterm", "final"] as const).map((value) => ({ value, label: EXAM_KIND_LABEL[value] }))} />
          </Form.Item>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: "Chưa nhập lý do" }]} extra="Đợt sau nối với đơn hoãn thi của sinh viên">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
