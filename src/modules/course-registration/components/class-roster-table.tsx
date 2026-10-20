"use client";

import { useState } from "react";
import { Button, Input, message, Table, type TableColumnsType } from "antd";
import { Download, Envelope, Magnifier } from "defeat-icons-react";
import { DownloadPdfButton } from "@/shared/components/ui/download-pdf-button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { formatDate } from "@/shared/libs/date.lib";
import { downloadFile, toCsv } from "@/shared/libs/download.lib";
import { exportClassRosterPdf } from "@/modules/course-registration/course-registration.action";
import type { RosterEntry } from "@/modules/course-registration/course-registration.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { studentEmailOf } from "@/shared/libs/student-code.lib";

function emailOf(studentCode: string) {
  return studentEmailOf(studentCode);
}

export function ClassRosterTable({ roster, classCode, classSectionId }: { roster: RosterEntry[]; classCode: string; classSectionId: string }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [query, setQuery] = useState("");
  const needle = normalizeSearch(query.trim());
  const filtered = needle
    ? roster.filter((entry) => normalizeSearch(`${entry.fullName} ${entry.studentCode} ${entry.className}`).includes(needle))
    : roster;

  const columns: TableColumnsType<RosterEntry> = [
    { title: "STT", key: "index", width: 56, align: "right", render: (_, __, index) => <span className="text-muted tabular-nums">{index + 1}</span> },
    { title: "Mã SV", dataIndex: "studentCode", width: 120, render: (value: string) => <span className="text-xs">{value}</span> },
    { title: "Họ và tên", dataIndex: "fullName", width: 220, render: (value: string) => <span className="font-medium">{value}</span> },
    { title: "Lớp sinh hoạt", dataIndex: "className", width: 140, render: (value: string) => <span className="text-xs">{value}</span> },
    {
      title: "Email",
      key: "email",
      width: 260,
      render: (_, row) => (
        <a href={`mailto:${emailOf(row.studentCode)}`} className="text-sm">
          {emailOf(row.studentCode)}
        </a>
      ),
    },
    {
      title: "Ngày đăng ký",
      dataIndex: "registeredAt",
      width: 120,
      render: (value: string) => <span className="text-xs text-muted tabular-nums">{formatDate(value)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Tên, mã sinh viên hoặc lớp"
          aria-label="Tìm sinh viên trong lớp"
          className="w-full sm:w-72"
        />
        <span className="text-sm text-muted tabular-nums">
          {filtered.length === roster.length ? `${roster.length} sinh viên` : `${filtered.length}/${roster.length} sinh viên`}
        </span>
        <div className="flex gap-2 sm:ml-auto">
          <Button icon={<Envelope size={16} aria-hidden className="text-zinc-500" />} href={`mailto:?bcc=${roster.map((entry) => emailOf(entry.studentCode)).join(",")}&subject=${encodeURIComponent(`[${classCode}] `)}`}>
            Email cả lớp
          </Button>
          <Button icon={<Download size={16} aria-hidden className="text-zinc-500" />} onClick={() => {
              downloadFile(
                `danh-sach-${classCode}.csv`,
                toCsv([
                  ["STT", "Mã sinh viên", "Họ và tên", "Lớp sinh hoạt", "Email", "Ngày đăng ký"],
                  ...roster.map((entry, index) => [index + 1, entry.studentCode, entry.fullName, entry.className, emailOf(entry.studentCode), formatDate(entry.registeredAt)]),
                ]),
              );
              messageApi.success(`Đã tải danh sách ${roster.length} sinh viên lớp ${classCode}`);
            }}>
            Xuất danh sách
          </Button>
          <DownloadPdfButton action={() => exportClassRosterPdf(classSectionId)} />
        </div>
      </div>
      <Table
        rowKey="enrollmentId"
        size="middle"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 920 }}
        pagination={{ itemRender: paginationItemRender, pageSize: 50, hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <EmptyState
              illustration="search"
              title={roster.length === 0 ? "Lớp chưa có sinh viên" : "Không tìm thấy sinh viên"}
              description={roster.length === 0 ? "Danh sách sẽ có sau khi sinh viên đăng ký học phần." : `Không có sinh viên nào khớp “${query}”.`}
            />
          ),
        }}
      />
    </div>
  );
}
