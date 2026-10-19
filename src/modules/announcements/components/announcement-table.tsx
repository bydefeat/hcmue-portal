"use client";

import { useMemo, useState } from "react";
import { Button, Input, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Megaphone, Pen, Pin, Plus, Trash } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { daysUntil, dayjs, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { STATUS_TONE_TEXT } from "@/shared/constants/status.constant";
import {
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_CATEGORY_OPTIONS,
  ANNOUNCEMENT_STATUS,
  ANNOUNCEMENT_STATUS_OPTIONS,
} from "../announcements.constant";
import type { Announcement, AnnouncementFormValues, AnnouncementStatus } from "../announcements.type";
import { AnnouncementFormDrawer } from "./announcement-form-drawer";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

function slugify(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function DeadlineCell({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span className="text-muted">Không có</span>;
  const days = daysUntil(deadline);
  const isPast = dayjs().isAfter(deadline);
  const hint = isPast ? "Đã hết hạn" : days === 0 ? "Hết hạn hôm nay" : `Còn ${days} ngày`;
  const tone = isPast ? "neutral" : days <= 2 ? "warning" : "neutral";
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatDate(deadline)}</span>
      <span className={`text-xs ${STATUS_TONE_TEXT[tone]}`}>{hint}</span>
    </span>
  );
}

function sortRows(rows: Announcement[]) {
  return [...rows].sort(
    (a, b) =>
      Number(b.isPinned) - Number(a.isPinned) ||
      dayjs(b.publishedAt ?? "2100-01-01").valueOf() - dayjs(a.publishedAt ?? "2100-01-01").valueOf(),
  );
}

export function AnnouncementTable({ announcements, header }: { announcements: Announcement[]; header: { title: string; description?: React.ReactNode } }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(announcements);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>();
  const [status, setStatus] = useState<AnnouncementStatus>();
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return sortRows(rows).filter((row) => {
      if (needle && !normalize(`${row.title} ${row.summary}`).includes(needle)) return false;
      if (category && row.category !== category) return false;
      if (status && row.status !== status) return false;
      return true;
    });
  }, [rows, query, category, status]);

  const handleSubmit = (values: AnnouncementFormValues) => {
    const nextStatus: AnnouncementStatus = values.publishMode === "draft" ? "draft" : values.publishMode === "schedule" ? "scheduled" : "published";
    const publishedAt = values.publishMode === "now" ? (editing?.status === "published" ? editing.publishedAt : dayjs().toISOString()) : (values.publishedAt ?? null);
    const next: Announcement = {
      id: editing?.id ?? `tb-${Date.now()}`,
      slug: editing?.slug ?? slugify(values.title),
      author: editing?.author ?? "Phòng Đào tạo",
      views: editing?.views ?? 0,
      title: values.title,
      category: values.category,
      audiences: values.audiences,
      summary: values.summary ?? "",
      content: values.content,
      isPinned: values.isPinned,
      deadline: values.deadline ?? null,
      status: nextStatus,
      publishedAt: values.publishMode === "draft" ? null : publishedAt,
    };
    setRows((current) => (editing ? current.map((row) => (row.id === editing.id ? next : row)) : [next, ...current]));
    const feedback = {
      draft: "Đã lưu nháp, thông báo chưa hiện với sinh viên",
      scheduled: `Thông báo sẽ tự đăng lúc ${next.publishedAt ? formatDateTime(next.publishedAt) : ""}`,
      published: "Đã đăng thông báo lên trang chủ",
      archived: "",
    }[nextStatus];
    messageApi.success(feedback);
    setIsDrawerOpen(false);
  };

  const confirmArchive = (row: Announcement) => {
    modal.confirm({
      title: "Gỡ thông báo này?",
      content: `"${row.title}" sẽ không còn hiện trên trang chủ. Bạn vẫn xem lại được trong mục Đã gỡ.`,
      okText: "Gỡ thông báo",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: () => {
        setRows((current) => current.map((entry) => (entry.id === row.id ? { ...entry, status: "archived", isPinned: false } : entry)));
        messageApi.success("Đã gỡ thông báo");
      },
    });
  };

  const statusOf = (value: AnnouncementStatus) =>
    value === "published" ? <span className="text-xs text-muted">{ANNOUNCEMENT_STATUS.published.label}</span> : <StatusTag status={ANNOUNCEMENT_STATUS[value]} />;

  const columns: TableColumnsType<Announcement> = [
    {
      title: "Thông báo",
      key: "title",
      width: 260,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-start gap-1.5 font-medium text-pretty">
            {row.isPinned && <Pin size={14} aria-label="Đã ghim" className="mt-0.5 shrink-0 text-primary" />}
            {row.title}
          </span>
          <span className="line-clamp-1 text-xs text-muted">{row.audiences.join(", ")}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted md:hidden">
            {statusOf(row.status)}
            {row.publishedAt && <span className="tabular-nums">{formatDate(row.publishedAt)}</span>}
          </span>
        </span>
      ),
    },
    { title: "Loại", dataIndex: "category", width: 140, responsive: ["lg"], render: (value: Announcement["category"]) => ANNOUNCEMENT_CATEGORY_LABEL[value] },
    {
      title: "Trạng thái",
      dataIndex: "status",
      width: 120,
      responsive: ["md"],
      render: (value: AnnouncementStatus) => statusOf(value),
    },
    {
      title: "Ngày đăng",
      dataIndex: "publishedAt",
      width: 150,
      responsive: ["md"],
      render: (value: string | null) =>
        value ? <span className="text-sm tabular-nums">{formatDateTime(value)}</span> : <span className="text-muted">Chưa đăng</span>,
    },
    { title: "Hạn chót", dataIndex: "deadline", width: 120, responsive: ["md"], render: (value: string | null) => <DeadlineCell deadline={value} /> },
    {
      title: "Lượt xem",
      dataIndex: "views",
      width: 100,
      responsive: ["lg"],
      align: "right",
      sorter: (a, b) => a.views - b.views,
      render: (value: number) => <span className="tabular-nums">{value.toLocaleString("vi-VN")}</span>,
    },
    {
      title: "",
      key: "actions",
      width: 88,
      align: "right",
      fixed: "right",
      render: (_, row) => (
        <span className="flex flex-col items-end gap-1">
          <Button
            size="small"
            type="text"
            aria-label={`Sửa ${row.title}`}
            icon={<Pen size={14} aria-hidden className="text-zinc-500" />}
            onClick={() => {
              setEditing(row);
              setIsDrawerOpen(true);
            }}
          >
            Sửa
          </Button>
          {row.status !== "archived" && (
            <Button size="small" type="text" danger aria-label={`Gỡ ${row.title}`} icon={<Trash size={14} aria-hidden />} onClick={() => confirmArchive(row)}>
              Gỡ
            </Button>
          )}
        </span>
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
          <Button
            type="primary"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => {
              setEditing(null);
              setIsDrawerOpen(true);
            }}
          >
            Soạn thông báo
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Input
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
            placeholder="Tiêu đề hoặc nội dung"
            aria-label="Tìm thông báo"
            className="col-span-2 w-full sm:w-72"
          />
          <Select allowClear value={category} onChange={setCategory} placeholder="Mọi loại" aria-label="Loại" options={ANNOUNCEMENT_CATEGORY_OPTIONS} className="min-w-0 sm:w-48" />
          <Select allowClear value={status} onChange={setStatus} placeholder="Mọi trạng thái" aria-label="Trạng thái" options={ANNOUNCEMENT_STATUS_OPTIONS} className="min-w-0 sm:w-44" />
        </div>
        <Table
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <EmptyState
                icon={Megaphone}
                title={rows.length === 0 ? "Chưa có thông báo" : "Không có thông báo khớp bộ lọc"}
                description={rows.length === 0 ? "Thông báo đăng ở đây sẽ hiện trên trang chủ cho sinh viên." : "Thử bỏ bớt điều kiện lọc."}
              />
            ),
          }}
        />
        <AnnouncementFormDrawer open={isDrawerOpen} announcement={editing} onClose={() => setIsDrawerOpen(false)} onSubmit={handleSubmit} />
      </div>
    </>
  );
}
