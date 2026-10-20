"use client";

import { useState, useTransition } from "react";
import { Button, message, Table, type TableColumnsType } from "antd";
import { ArrowRotateClockwise } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { formatDateTime } from "@/shared/libs/date.lib";
import { retryMail } from "@/modules/mail/mail.action";
import { MAIL_KIND_LABEL, MAIL_STATUS } from "@/modules/mail/mail.constant";
import type { MailProblem } from "@/modules/mail/mail.type";

const NETWORK_ERROR = "Chưa gửi lại được, kiểm tra kết nối rồi thử lại.";

export function MailProblemTable({ problems }: { problems: MailProblem[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [isRetrying, startRetrying] = useTransition();
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const retryable = problems.filter((problem) => problem.status !== "sending");

  const retry = (ids: string[]) => {
    setPendingIds(ids);
    startRetrying(async () => {
      const result = await retryMail({ ids }).catch(() => null);
      setPendingIds([]);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      messageApi.success(`Đã đưa ${result.data.retried} thư vào hàng gửi lại, thư đi trong vài giây.`, 6);
    });
  };

  const columns: TableColumnsType<MailProblem> = [
    {
      title: "Người nhận",
      key: "recipient",
      width: 240,
      render: (_, problem) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{problem.recipient}</span>
          <span className="truncate text-xs text-muted">{problem.subject}</span>
        </span>
      ),
    },
    {
      title: "Lỗi lần cuối",
      key: "error",
      width: 280,
      render: (_, problem) => (
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-pretty break-words">{problem.lastError ?? "Không rõ lỗi"}</span>
          <span className="text-xs text-muted">
            {MAIL_KIND_LABEL[problem.kind]}, xếp hàng lúc {formatDateTime(problem.createdAt)}
          </span>
        </span>
      ),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 190,
      render: (_, problem) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <StatusTag status={MAIL_STATUS[problem.status]} />
          <span className="text-xs text-muted tabular-nums">
            {problem.attempts} lần thử{problem.nextAttemptAt ? `, gửi lại lúc ${formatDateTime(problem.nextAttemptAt)}` : ""}
          </span>
        </span>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 110,
      align: "right",
      render: (_, problem) =>
        problem.status === "sending" ? null : (
          <Button size="small" loading={isRetrying && pendingIds.includes(problem.id)} disabled={isRetrying} onClick={() => retry([problem.id])}>
            Gửi lại
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      {retryable.length > 1 && (
        <div className="flex justify-end">
          <Button icon={<ArrowRotateClockwise size={16} aria-hidden className="text-zinc-500" />} loading={isRetrying && pendingIds.length > 1} disabled={isRetrying} onClick={() => retry(retryable.map((problem) => problem.id))}>
            Gửi lại tất cả ({retryable.length})
          </Button>
        </div>
      )}
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={problems}
        scroll={{ x: "max-content" }}
        pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} thư` }}
        locale={{ emptyText: <EmptyState illustration="done" title="Không có thư lỗi" description="Mọi thư đã gửi được hoặc đang chờ gửi lần đầu." /> }}
      />
    </div>
  );
}
