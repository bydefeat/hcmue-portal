"use client";

import { useState, useTransition } from "react";
import { Button, Card, Drawer, Form, message, Radio, Select, Table, type TableColumnsType } from "antd";
import { AlertWarning, ChartColumn, ClipboardCheck, Download, FileExport, GraduationCap, PresentationScreenChartCols, Users, type IconProps } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { formatDateTime } from "@/shared/libs/date.lib";
import { downloadFile } from "@/shared/libs/download.lib";
import { base64ToBytes } from "@/shared/libs/spreadsheet.lib";
import { REPORT_FACULTY_BASIS_LABEL, REPORT_FORMAT_LABEL, REPORT_FORMATS } from "@/modules/settings/settings.constant";
import { downloadReportExport, requestReportExport } from "@/modules/settings/settings.action";
import type { ReportDefinition, ReportExportJob as ExportJob, ReportFormat } from "@/modules/settings/settings.type";

const REPORT_ICON: Record<string, React.ComponentType<IconProps>> = {
  moet: Users,
  warnings: AlertWarning,
  registration: ClipboardCheck,
  surveys: PresentationScreenChartCols,
  standing: ChartColumn,
  graduation: GraduationCap,
};

type ExportValues = { termId: string; faculty: string; format: ReportFormat };

const JOB_STATUS: Record<ExportJob["status"], StatusMeta> = {
  running: { label: "Đang tạo", tone: "neutral" },
  ready: { label: "Sẵn sàng tải", tone: "success" },
  failed: { label: "Lỗi", tone: "danger" },
};

type ReportExportCenterProps = {
  reports: ReportDefinition[];
  terms: { id: string; name: string }[];
  faculties: string[];
  // Cán bộ theo khoa không chọn được toàn trường.
  allowAllFaculties: boolean;
  defaultTermId: string;
  jobs: ExportJob[];
};

export function ReportExportCenter({ reports, terms, faculties, allowAllFaculties, defaultTermId, jobs: initialJobs }: ReportExportCenterProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ExportValues>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [jobs, setJobs] = useState(initialJobs);
  const [isPending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState<string | null>(null);
  const opened = reports.find((report) => report.id === openId) ?? null;

  const create = (values: ExportValues) =>
    startTransition(async () => {
      if (!opened) return;
      const result = await requestReportExport({ reportKey: opened.id, ...values }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa tạo được báo cáo, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        form.setFields(Object.entries(result.fieldErrors ?? {}).map(([name, error]) => ({ name: name as keyof ExportValues, errors: [error] })));
        messageApi.error(result.message);
        return;
      }
      const job = result.data;
      setJobs((current) => [job, ...current.filter((entry) => entry.id !== job.id)]);
      setOpenId(null);
      messageApi.success(`Đã tạo ${opened.name}, ${job.rows ?? 0} dòng. Tệp có trong mục Lịch sử xuất.`);
    });

  const download = async (job: ExportJob) => {
    setDownloading(job.id);
    const result = await downloadReportExport(job.id).catch(() => null);
    setDownloading(null);
    if (!result) {
      messageApi.error("Chưa tải được báo cáo, kiểm tra kết nối rồi thử lại.");
      return;
    }
    if (!result.ok) {
      messageApi.error(result.message);
      return;
    }
    const { fileName, content, encoding, mimeType } = result.data;
    downloadFile(fileName, encoding === "base64" ? base64ToBytes(content) : content, mimeType);
  };

  const columns: TableColumnsType<ExportJob> = [
    {
      title: "Báo cáo",
      key: "report",
      width: 240,
      render: (_, job) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{job.reportName}</span>
          <span className="truncate text-xs text-muted">{job.params}</span>
        </span>
      ),
    },
    { title: <span className="whitespace-nowrap">Định dạng</span>, dataIndex: "format", width: 100, responsive: ["md"], render: (value: string) => <span className="text-xs">{value}</span> },
    { title: <span className="whitespace-nowrap">Số dòng</span>, dataIndex: "rows", width: 90, align: "right", responsive: ["md"], render: (value: number | null) => <span className="tabular-nums">{value ?? ""}</span> },
    {
      title: "Người tạo",
      key: "by",
      width: 200,
      responsive: ["md"],
      render: (_, job) => (
        <span className="flex flex-col text-xs">
          {job.createdBy}
          <span className="text-muted tabular-nums">{formatDateTime(job.createdAt)}</span>
        </span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      width: 120,
      responsive: ["sm"],
      render: (value: ExportJob["status"]) => (value === "ready" ? <span className="text-xs text-muted">{JOB_STATUS.ready.label}</span> : <StatusTag status={JOB_STATUS[value]} />),
    },
    {
      title: "",
      key: "download",
      width: 100,
      align: "right",
      fixed: "right",
      render: (_, job) => (
        <Button size="small" type="text" icon={<Download size={14} aria-hidden className="text-zinc-500" />} disabled={job.status !== "ready"} loading={downloading === job.id} onClick={() => void download(job)}>
          Tải về
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {contextHolder}
      <ul className="grid gap-3 md:grid-cols-2">
        {reports.map((report) => {
          const Icon = REPORT_ICON[report.id] ?? FileExport;
          return (
            <li key={report.id}>
              <Card size="small" className="h-full" classNames={{ body: "flex flex-col gap-2" }}>
                <div className="flex items-start gap-3">
                  <Icon size={20} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="text-base font-medium text-pretty">{report.name}</h3>
                    <p className="text-sm text-pretty text-muted">{report.description}</p>
                    <p className="text-xs text-muted">
                      Nơi nhận: {report.audience} · {REPORT_FACULTY_BASIS_LABEL[report.facultyBasis]}
                      {report.usesTerm ? "" : " · số liệu tại thời điểm xuất"}
                    </p>
                  </div>
                </div>
                <Button
                  className="self-end"
                  onClick={() => {
                    form.resetFields();
                    setOpenId(report.id);
                  }}
                >
                  Tạo báo cáo
                </Button>
              </Card>
            </li>
          );
        })}
      </ul>
      <SectionCard title="Lịch sử xuất" flush>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={jobs}
          scroll={{ x: "max-content" }}
          pagination={false}
          locale={{ emptyText: <EmptyState illustration="document" title="Chưa xuất báo cáo nào" /> }}
        />
      </SectionCard>
      <Drawer
        open={opened !== null}
        onClose={() => setOpenId(null)}
        size={440}
        destroyOnHidden
        title={opened?.name ?? ""}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpenId(null)}>Hủy</Button>
            <Button type="primary" loading={isPending} onClick={() => form.submit()}>
              Tạo tệp
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" onFinish={create} initialValues={{ termId: defaultTermId, faculty: allowAllFaculties ? "all" : faculties[0], format: "xlsx" }}>
          {/* Báo cáo số liệu hiện tại không theo học kỳ: giữ học kỳ mặc định ở form để action nhận đủ tham số. */}
          <Form.Item name="termId" label="Học kỳ" hidden={opened ? !opened.usesTerm : false}>
            <Select options={terms.map((term) => ({ value: term.id, label: term.name }))} />
          </Form.Item>
          <Form.Item name="faculty" label="Phạm vi" extra={opened ? REPORT_FACULTY_BASIS_LABEL[opened.facultyBasis] : undefined}>
            <Select options={[...(allowAllFaculties ? [{ value: "all", label: "Toàn trường" }] : []), ...faculties.map((value) => ({ value, label: value }))]} />
          </Form.Item>
          <Form.Item
            name="format"
            label="Định dạng"
            extra="Excel giữ ô số là số, cố định hàng tiêu đề. PDF để in hoặc gửi kèm văn bản. CSV dùng để nhập vào phần mềm khác."
          >
            <Radio.Group options={REPORT_FORMATS.map((value) => ({ value, label: REPORT_FORMAT_LABEL[value] }))} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
