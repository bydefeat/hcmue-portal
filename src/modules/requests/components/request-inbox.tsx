"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Card, Descriptions, Drawer, Input, message, Modal, Segmented, Select, Table, type TableColumnsType } from "antd";
import { FileContent, Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { decideStep, REQUEST_KINDS, REQUEST_STATUS, requestView } from "@/modules/requests/requests.constant";
import type { AcademicRequest, RequestKind, RequestStatus, RequestView, StepRole } from "@/modules/requests/requests.type";
import { ApprovalSteps } from "@/modules/requests/components/approval-steps";
import { paginationItemRender } from "@/shared/constants/antd.constant";

type RequestInboxProps = {
  requests: RequestView[];
  mode: "process" | "own";
  actorName: string;
  actorId?: string;
  actorRoles?: StepRole[];
  initialStatus?: RequestStatus;
  showRequester?: boolean;
};

type Scope = "mine" | "all";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

function waitingText(request: RequestView) {
  if (!request.currentStep?.dueAt) return null;
  const hours = dayjs(request.currentStep.dueAt).diff(dayjs(), "hour");
  if (hours < 0) return { text: `Quá hạn ${Math.ceil(-hours / 24)} ngày`, className: "text-rose-700" };
  if (hours < 24) return { text: `Hạn còn ${Math.max(hours, 1)} giờ`, className: "text-amber-700" };
  return { text: `Hạn ${formatDate(request.currentStep.dueAt)}`, className: "text-muted" };
}

export function RequestInbox({
  requests,
  mode,
  actorName,
  actorId,
  actorRoles = [],
  initialStatus,
  showRequester = true,
}: RequestInboxProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState<RequestView[]>(requests);
  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<RequestKind>();
  const [status, setStatus] = useState<RequestStatus | undefined>(initialStatus);

  const canAct = (request: RequestView) =>
    mode === "process" &&
    request.currentStep !== null &&
    (request.status === "pending" || request.status === "in-review") &&
    actorRoles.includes(request.currentStep.role) &&
    (request.currentStep.assigneeId === null || request.currentStep.assigneeId === actorId || request.currentStep.role === "faculty");

  const actionable = rows.filter(canAct);
  const [scope, setScope] = useState<Scope>(mode === "process" && actionable.length > 0 && !initialStatus ? "mine" : "all");
  const kinds = useMemo(() => [...new Set(rows.map((row) => row.kind))], [rows]);
  const opened = rows.find((row) => row.id === openId) ?? null;

  const filtered = rows.filter((row) => {
    if (scope === "mine" && !canAct(row)) return false;
    const needle = normalize(query.trim());
    if (needle && !normalize(`${row.code} ${row.requesterName} ${row.requesterCode} ${row.subject}`).includes(needle)) return false;
    if (kind && row.kind !== kind) return false;
    if (status && row.status !== status) return false;
    return true;
  });

  const update = (next: AcademicRequest) => setRows((current) => current.map((row) => (row.id === next.id ? requestView(next) : row)));

  const decide = (decision: "approved" | "rejected") => {
    if (!opened) return;
    if (decision === "rejected" && !comment.trim()) {
      messageApi.warning("Ghi lý do không đồng ý để người gửi biết cần bổ sung gì");
      return;
    }
    update(decideStep(opened, decision, actorName, comment.trim()));
    messageApi.success(decision === "approved" ? `Đã đồng ý đơn ${opened.code}, chuyển bước tiếp theo` : `Đã từ chối đơn ${opened.code}`);
    setComment("");
    setOpenId(null);
  };

  const cancel = (request: RequestView) =>
    modal.confirm({
      title: `Hủy đơn ${request.code}?`,
      content: "Đơn đã hủy không xử lý tiếp. Muốn đề nghị lại phải gửi đơn mới.",
      okText: "Hủy đơn",
      okButtonProps: { danger: true },
      cancelText: "Giữ đơn",
      mask: { closable: false },
      onOk: () => {
        update({ ...request, cancelledAt: dayjs().toISOString() });
        messageApi.success(`Đã hủy đơn ${request.code}`);
        setOpenId(null);
      },
    });

  const emptyText =
    rows.length === 0 ? (
      <EmptyState title="Chưa có đơn nào" description={mode === "own" ? "Đơn bạn gửi sẽ hiện ở đây cùng tiến độ xử lý." : undefined} />
    ) : scope === "mine" && actionable.length === 0 ? (
      <EmptyState illustration="done" title="Không còn đơn chờ bạn xử lý" description="Chuyển sang Tất cả để xem đơn đã xử lý." />
    ) : (
      <EmptyState illustration="search" title="Không có đơn khớp bộ lọc" description="Thử bỏ bớt điều kiện lọc." />
    );

  const columns: TableColumnsType<RequestView> = [
    {
      title: "Mã đơn",
      dataIndex: "code",
      width: 140,
      render: (code: string, row) => (
        <Button type="link" size="small" onClick={() => setOpenId(row.id)} className="h-auto p-0 text-xs">
          {code}
        </Button>
      ),
    },
    { title: "Loại đơn", dataIndex: "kind", width: 150, render: (value: RequestKind) => REQUEST_KINDS[value].label },
    ...(showRequester
      ? [
          {
            title: "Người gửi",
            key: "requester",
            width: 200,
            render: (_: unknown, row: RequestView) => (
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{row.requesterName}</span>
                <span className="truncate text-xs text-muted">
                  {row.requesterCode} · {row.requesterUnit}
                </span>
              </span>
            ),
          },
        ]
      : []),
    { title: "Nội dung", dataIndex: "subject", width: 240, render: (value: string) => <span className="text-pretty">{value}</span> },
    {
      title: "Bước hiện tại",
      key: "step",
      width: 200,
      render: (_, row) => {
        if (!row.currentStep || row.status === "cancelled") return <span className="text-muted">Đã kết thúc</span>;
        const due = waitingText(row);
        return (
          <span className="flex flex-col">
            {row.currentStep.label}
            {due && <span className={`text-xs tabular-nums ${due.className}`}>{due.text}</span>}
          </span>
        );
      },
    },
    { title: "Trạng thái", dataIndex: "status", width: 120, render: (value: RequestStatus) => <StatusTag status={REQUEST_STATUS[value]} /> },
    {
      title: "Ngày gửi",
      dataIndex: "createdAt",
      width: 100,
      sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
      render: (value: string) => <span className="text-xs text-muted tabular-nums">{formatDate(value)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      {modalContextHolder}
      <div className="flex flex-wrap items-center gap-2">
        {mode === "process" && (
          <Segmented<Scope>
            value={scope}
            onChange={setScope}
            options={[
              { value: "mine", label: `Cần tôi xử lý (${actionable.length})` },
              { value: "all", label: "Tất cả" },
            ]}
          />
        )}
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Mã đơn, người gửi, nội dung"
          aria-label="Tìm đơn"
          className="w-full sm:w-64"
        />
        <Select
          allowClear
          value={kind}
          onChange={setKind}
          placeholder="Mọi loại đơn"
          aria-label="Loại đơn"
          options={kinds.map((value) => ({ value, label: REQUEST_KINDS[value].label }))}
          className="min-w-0 flex-1 sm:w-48 sm:flex-none"
        />
        <Select
          allowClear
          value={status}
          onChange={setStatus}
          placeholder="Mọi trạng thái"
          aria-label="Trạng thái"
          options={(Object.keys(REQUEST_STATUS) as RequestStatus[]).map((value) => ({ value, label: REQUEST_STATUS[value].label }))}
          className="min-w-0 flex-1 sm:w-44 sm:flex-none"
        />
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        onRow={(row) => ({ onClick: () => setOpenId(row.id), className: "cursor-pointer" })}
        rowClassName={(row) => (row.isOverdue ? "bg-rose-50/40" : "")}
        scroll={{ x: showRequester ? 1150 : 950 }}
        pagination={{ itemRender: paginationItemRender, pageSize: 15, hideOnSinglePage: true, showTotal: (total) => `${total} đơn` }}
        locale={{ emptyText }}
        className="hidden md:block"
      />
      {filtered.length === 0 ? (
        <Card size="small" className="md:hidden">
          {emptyText}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2 md:hidden">
          {filtered.map((row) => {
            const due = row.currentStep && row.status !== "cancelled" ? waitingText(row) : null;
            return (
              <li key={row.id}>
                <Card size="small" hoverable onClick={() => setOpenId(row.id)} classNames={{ body: "flex flex-col gap-1.5" }}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{REQUEST_KINDS[row.kind].label}</span>
                      <span className="text-xs text-muted tabular-nums">
                        {row.code} · {formatDate(row.createdAt)}
                      </span>
                    </span>
                    <StatusTag status={REQUEST_STATUS[row.status]} />
                  </span>
                  {showRequester && (
                    <span className="truncate text-xs text-muted">
                      {row.requesterName} · {row.requesterCode}
                    </span>
                  )}
                  <span className="text-sm text-pretty">{row.subject}</span>
                  <span className="text-xs text-muted">
                    {!row.currentStep || row.status === "cancelled" ? "Đã kết thúc" : row.currentStep.label}
                    {due && <span className={`tabular-nums ${due.className}`}> · {due.text}</span>}
                  </span>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={opened !== null}
        onClose={() => {
          setOpenId(null);
          setComment("");
        }}
        size={560}
        destroyOnHidden
        title={opened ? `${REQUEST_KINDS[opened.kind].label} · ${opened.code}` : ""}
        footer={
          opened && canAct(opened) ? (
            <div className="flex flex-col gap-2">
              <Input.TextArea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                autoSize={{ minRows: 2, maxRows: 5 }}
                maxLength={500}
                showCount
                placeholder="Ý kiến xử lý, bắt buộc khi không đồng ý"
                aria-label="Ý kiến xử lý"
                className="mb-5"
              />
              <div className="flex justify-end gap-2">
                <Button danger onClick={() => decide("rejected")}>
                  Không đồng ý
                </Button>
                <Button type="primary" onClick={() => decide("approved")}>
                  Đồng ý
                </Button>
              </div>
            </div>
          ) : opened && mode === "own" && opened.status === "pending" ? (
            <div className="flex justify-end">
              <Button danger onClick={() => cancel(opened)}>
                Hủy đơn
              </Button>
            </div>
          ) : null
        }
      >
        {opened && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag status={REQUEST_STATUS[opened.status]} />
              <span className="text-xs text-muted tabular-nums">Gửi lúc {formatDateTime(opened.createdAt)}</span>
            </div>
            {opened.isOverdue && (
              <Alert type="error" showIcon title="Đơn đã quá hạn xử lý ở bước hiện tại" description="Xử lý ngay hoặc báo người có thẩm quyền chuyển người xử lý." />
            )}
            <Descriptions
              size="small"
              column={1}
              items={[
                ...(showRequester
                  ? [{ key: "requester", label: "Người gửi", children: `${opened.requesterName} (${opened.requesterCode}), ${opened.requesterUnit}` }]
                  : []),
                { key: "subject", label: "Nội dung", children: opened.subject },
                ...opened.details.map((detail) => ({ key: detail.label, label: detail.label, children: detail.value })),
                { key: "reason", label: "Lý do", children: <span className="text-pretty">{opened.reason}</span> },
              ]}
            />
            {opened.attachments.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Minh chứng</span>
                {opened.attachments.map((file) => (
                  <span key={file} className="flex items-center gap-2 text-sm">
                    <FileContent size={16} aria-hidden className="text-muted" />
                    {file}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted">Tiến độ xử lý</span>
              <ApprovalSteps steps={opened.steps} submittedAt={opened.createdAt} requesterName={opened.requesterName} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
