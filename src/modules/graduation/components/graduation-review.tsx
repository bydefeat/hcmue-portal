"use client";

import { useState, useTransition } from "react";
import { Button, Form, Input, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { CircleCheck, CircleXmark, Magnifier, TableDownload } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { approveGraduation, exportGraduationCandidates, saveGraduationCertificates } from "@/modules/graduation/graduation.action";
import { GRADUATION_STATUS } from "@/modules/graduation/graduation.constant";
import type { GraduationCandidate, GraduationStatus } from "@/modules/graduation/graduation.type";
import { CEFR_LEVELS } from "@/modules/settings/settings.constant";
import type { CefrLevel } from "@/modules/settings/settings.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { formatDateTime } from "@/shared/libs/date.lib";
import { downloadBase64 } from "@/shared/libs/download.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { normalizeSearch } from "@/shared/libs/search.lib";

type CertificateValues = { languageCertificate: string | null; languageLevel: CefrLevel | null; itCertificate: string | null };

function CertificateModal({ candidate, onClose, onSaved }: { candidate: GraduationCandidate | null; onClose: () => void; onSaved: (candidate: GraduationCandidate | null) => void }) {
  const [form] = Form.useForm<CertificateValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [isSaving, startSaving] = useTransition();
  const save = (values: CertificateValues) =>
    startSaving(async () => {
      if (!candidate) return;
      const result = await saveGraduationCertificates({ studentId: candidate.studentId, ...values }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        if (result.fieldErrors) form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      onSaved(result.data);
    });
  return (
    <Modal
      open={candidate !== null}
      onCancel={onClose}
      title={candidate ? `Chứng chỉ của ${candidate.fullName}` : ""}
      okText="Xác nhận chứng chỉ"
      cancelText="Hủy"
      okButtonProps={{ loading: isSaving }}
      onOk={() => form.submit()}
      mask={{ closable: false }}
      destroyOnHidden
      width={480}
    >
      {contextHolder}
      <p className="mb-4 text-sm text-pretty text-muted">Nhập theo bản chứng chỉ sinh viên nộp và đã đối chiếu. Bậc ngoại ngữ so với chuẩn tối thiểu của quy chế khi xét.</p>
      {candidate && (
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          initialValues={{ languageCertificate: candidate.languageCertificate, languageLevel: candidate.languageLevel, itCertificate: candidate.itCertificate }}
        >
          <div className="grid gap-x-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Form.Item name="languageCertificate" label="Chứng chỉ ngoại ngữ">
              <Input maxLength={120} placeholder="Ví dụ: VSTEP B1, IELTS 5.5" allowClear />
            </Form.Item>
            <Form.Item name="languageLevel" label="Bậc">
              <Select allowClear options={CEFR_LEVELS.map((level) => ({ value: level, label: level }))} placeholder="Chọn" />
            </Form.Item>
          </div>
          <Form.Item name="itCertificate" label="Chứng chỉ tin học">
            <Input maxLength={120} placeholder="Ví dụ: Ứng dụng CNTT cơ bản" allowClear />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

export function GraduationReview({ candidates, canApprove = true }: { candidates: GraduationCandidate[]; canApprove?: boolean }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(candidates);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<GraduationStatus>();
  const [faculty, setFaculty] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [editing, setEditing] = useState<GraduationCandidate | null>(null);
  const faculties = [...new Set(rows.map((row) => row.faculty))];
  const visible = rows.filter(
    (row) =>
      (!status || row.status === status) &&
      (!faculty || row.faculty === faculty) &&
      (!query.trim() || normalizeSearch(`${row.fullName} ${row.code} ${row.className}`).includes(normalizeSearch(query.trim()))),
  );
  const chosen = rows.filter((row) => selected.includes(row.studentId) && row.status === "eligible");

  const exportList = async () => {
    setIsExporting(true);
    const result = await exportGraduationCandidates(visible.map((row) => row.studentId));
    setIsExporting(false);
    if (!result.ok) {
      messageApi.error(result.message);
      return;
    }
    downloadBase64(result.data.fileName, result.data.base64, result.data.mimeType);
  };

  const approve = () =>
    modal.confirm({
      title: `Trình hội đồng công nhận ${chosen.length} sinh viên?`,
      content: "Hệ thống lập dự thảo quyết định công nhận tốt nghiệp (kèm hạng tốt nghiệp) cho từng sinh viên ở mục Quyết định sinh viên. Danh sách không sửa được sau khi hội đồng công nhận.",
      okText: "Công nhận",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await approveGraduation(chosen.map((row) => row.studentId));
        if (!result.ok) {
          messageApi.error(result.message);
          return;
        }
        const ids = result.data.studentIds;
        setRows((current) => current.map((row) => (ids.includes(row.studentId) ? { ...row, status: "approved", isApproved: true } : row)));
        setSelected([]);
        messageApi.success(`Hội đồng đã công nhận ${ids.length} sinh viên, đã lập ${ids.length} dự thảo quyết định`);
      },
    });

  const columns: TableColumnsType<GraduationCandidate> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="truncate text-xs text-muted">
            {row.code} · {row.className}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted tabular-nums md:hidden">
            <StatusTag status={GRADUATION_STATUS[row.status]} />
            {row.earnedCredits}/{row.requiredCredits} tín chỉ
          </span>
        </span>
      ),
    },
    { title: "Ngành", dataIndex: "majorName", width: 160, responsive: ["lg"] },
    {
      title: <span className="whitespace-nowrap">Tín chỉ</span>,
      key: "credits",
      width: 96,
      responsive: ["md"],
      align: "right",
      render: (_, row) => (
        <span className={`tabular-nums ${row.earnedCredits < row.requiredCredits ? "text-rose-700" : ""}`}>
          {row.earnedCredits}/{row.requiredCredits || "?"}
        </span>
      ),
    },
    {
      title: "CPA",
      dataIndex: "cpa4",
      width: 70,
      align: "right",
      responsive: ["md"],
      render: (value: number | null) => <span className="tabular-nums">{value === null ? "–" : value.toFixed(2).replace(".", ",")}</span>,
    },
    {
      title: "Hạng tốt nghiệp",
      key: "rank",
      width: 130,
      responsive: ["xl"],
      render: (_, row) => (
        <span className="flex flex-col">
          {row.classification}
          {row.downgradeReasons.length > 0 && <span className="text-xs text-amber-700">Đã giảm một hạng</span>}
        </span>
      ),
    },
    {
      title: "Điều kiện chưa đạt",
      key: "missing",
      width: 220,
      responsive: ["md"],
      render: (_, row) => {
        const failed = row.checks.filter((check) => !check.passed);
        return failed.length === 0 ? <span className="text-muted">Không có</span> : <span className="text-xs text-pretty text-rose-700">{failed.map((check) => check.label).join(", ")}</span>;
      },
    },
    { title: "Trạng thái", dataIndex: "status", width: 150, responsive: ["md"], render: (value: GraduationStatus) => <StatusTag status={GRADUATION_STATUS[value]} /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      {modalContextHolder}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Tên, mã, lớp" aria-label="Tìm sinh viên" className="col-span-2 w-full sm:w-56" />
        <Select allowClear value={status} onChange={setStatus} placeholder="Mọi trạng thái" aria-label="Trạng thái" options={Object.entries(GRADUATION_STATUS).map(([value, meta]) => ({ value, label: meta.label }))} className="min-w-0 sm:w-52" />
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={faculties.map((value) => ({ value, label: value }))} className="min-w-0 sm:w-56" />
        <div className="col-span-2 flex flex-wrap gap-2 sm:ml-auto">
          <Button icon={<TableDownload size={16} aria-hidden className="text-zinc-500" />} disabled={visible.length === 0} loading={isExporting} onClick={() => void exportList()}>
            Xuất danh sách
          </Button>
          {canApprove && (
            <Button type="primary" disabled={chosen.length === 0} onClick={approve}>
              Trình hội đồng {chosen.length > 0 ? `(${chosen.length})` : ""}
            </Button>
          )}
        </div>
      </div>
      <Table
        rowKey="studentId"
        size="small"
        columns={columns}
        dataSource={visible}
        rowSelection={canApprove ? { selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]), getCheckboxProps: (row) => ({ disabled: row.status !== "eligible" }) } : undefined}
        expandable={{
          expandedRowRender: (row) => (
            <div className="flex flex-col gap-3 py-1">
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {row.checks.map((check) => (
                  <li key={check.key} className="flex items-start gap-2 text-sm">
                    {check.passed ? <CircleCheck size={16} aria-label="Đạt" className="mt-0.5 shrink-0 text-green-700" /> : <CircleXmark size={16} aria-label="Chưa đạt" className="mt-0.5 shrink-0 text-rose-700" />}
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{check.label}</span>
                      <span className="text-xs text-pretty text-muted">{check.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {row.downgradeReasons.length > 0 && (
                <p className="text-sm text-pretty text-amber-700">
                  Giảm hạng tốt nghiệp: {row.downgradeReasons.join("; ")}.
                </p>
              )}
              {(row.status === "eligible" || row.status === "missing") && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="small" onClick={() => setEditing(row)}>
                    Cập nhật chứng chỉ
                  </Button>
                  <span className="text-xs text-muted">{row.certificatesVerifiedAt ? `Đã xác nhận lúc ${formatDateTime(row.certificatesVerifiedAt)}` : "Chưa xác nhận chứng chỉ"}</span>
                </div>
              )}
            </div>
          ),
        }}
        scroll={{ x: "max-content" }}
        pagination={{ itemRender: paginationItemRender, pageSize: 25, hideOnSinglePage: true, showTotal: (total) => `${total} sinh viên` }}
        locale={{ emptyText: <EmptyState illustration="document" title="Không có sinh viên ở trạng thái này" /> }}
      />
      <CertificateModal
        candidate={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          if (updated) setRows((current) => current.map((row) => (row.studentId === updated.studentId ? updated : row)));
          setEditing(null);
          messageApi.success("Đã xác nhận chứng chỉ, kết quả xét đã cập nhật");
        }}
      />
    </div>
  );
}
