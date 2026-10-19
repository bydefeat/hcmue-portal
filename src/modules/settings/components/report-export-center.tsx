"use client";

import { useState } from "react";
import { Button, Card, Drawer, Form, message, Radio, Select, Table, type TableColumnsType } from "antd";
import { AlertWarning, ChartColumn, ClipboardCheck, Download, FileExport, GraduationCap, PresentationScreenChartCols, Users, type IconProps } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";

export type ReportDefinition = { id: string; name: string; description: string; audience: string };

type ExportJob = { id: string; reportId: string; reportName: string; params: string; format: string; createdAt: string; createdBy: string; status: "running" | "ready" | "failed"; rows: number | null };

const REPORT_ICON: Record<string, React.ComponentType<IconProps>> = {
  moet: Users,
  warnings: AlertWarning,
  registration: ClipboardCheck,
  surveys: PresentationScreenChartCols,
  standing: ChartColumn,
  graduation: GraduationCap,
};

type ExportValues = { termId: string; faculty: string; format: "xlsx" | "pdf" | "csv" };

const JOB_STATUS: Record<ExportJob["status"], StatusMeta> = {
  running: { label: "Đang tạo", tone: "neutral" },
  ready: { label: "Sẵn sàng tải", tone: "success" },
  failed: { label: "Lỗi", tone: "danger" },
};

type ReportExportCenterProps = {
  reports: ReportDefinition[];
  terms: { id: string; name: string }[];
  faculties: string[];
  defaultTermId: string;
  userName: string;
};

export function ReportExportCenter({ reports, terms, faculties, defaultTermId, userName }: ReportExportCenterProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ExportValues>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ExportJob[]>([
    { id: "job-2", reportId: "warnings", reportName: "Danh sách cảnh báo học vụ", params: "HK2 2025-2026, toàn trường", format: "XLSX", createdAt: dayjs().subtract(1, "day").hour(16).toISOString(), createdBy: "Phạm Quốc Bảo", status: "ready", rows: 27 },
    { id: "job-1", reportId: "moet", reportName: "Báo cáo thống kê sinh viên theo ngành", params: "HK1 2026-2027, toàn trường", format: "PDF", createdAt: dayjs().subtract(3, "day").hour(9).toISOString(), createdBy: "Trần Minh Khoa", status: "ready", rows: 600 },
  ]);
  const opened = reports.find((report) => report.id === openId) ?? null;

  const create = (values: ExportValues) => {
    if (!opened) return;
    const id = `job-${jobs.length + 1}`;
    const termName = terms.find((term) => term.id === values.termId)?.name ?? "";
    setJobs((current) => [
      { id, reportId: opened.id, reportName: opened.name, params: `${termName}, ${values.faculty === "all" ? "toàn trường" : values.faculty}`, format: values.format.toUpperCase(), createdAt: dayjs().toISOString(), createdBy: userName, status: "running", rows: null },
      ...current,
    ]);
    setOpenId(null);
    messageApi.info(`Đang tạo ${opened.name}, tệp sẽ có trong mục Lịch sử xuất sau vài giây`);
    setTimeout(() => {
      setJobs((current) => current.map((job) => (job.id === id ? { ...job, status: "ready", rows: 40 + Math.round(Math.random() * 500) } : job)));
    }, 2500);
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
        <Button size="small" type="text" icon={<Download size={14} aria-hidden className="text-zinc-500" />} disabled={job.status !== "ready"} onClick={() => messageApi.success(`Đã tải ${job.reportName}.${job.format.toLowerCase()}`)}>
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
                    <p className="text-xs text-muted">Nơi nhận: {report.audience}</p>
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
            <Button type="primary" onClick={() => form.submit()}>
              Tạo tệp
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" onFinish={create} initialValues={{ termId: defaultTermId, faculty: "all", format: "xlsx" }}>
          <Form.Item name="termId" label="Học kỳ">
            <Select options={terms.map((term) => ({ value: term.id, label: term.name }))} />
          </Form.Item>
          <Form.Item name="faculty" label="Phạm vi">
            <Select options={[{ value: "all", label: "Toàn trường" }, ...faculties.map((value) => ({ value, label: value }))]} />
          </Form.Item>
          <Form.Item name="format" label="Định dạng">
            <Radio.Group
              options={[
                { value: "xlsx", label: "Excel" },
                { value: "pdf", label: "PDF" },
                { value: "csv", label: "CSV" },
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
