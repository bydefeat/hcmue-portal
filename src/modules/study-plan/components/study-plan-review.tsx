"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Drawer, Form, Input, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Route } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";
import { PENDING_TOO_LONG_DAYS, STUDY_PLAN_CREDIT_LIMIT, STUDY_PLAN_STATUS } from "../study-plan.constant";
import type { StudyPlan, StudyPlanStatus } from "../study-plan.type";

const STATUS_ORDER: Record<StudyPlanStatus, number> = { pending: 0, returned: 1, draft: 2, approved: 3 };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

function waitingDays(plan: StudyPlan) {
  return plan.submittedAt ? dayjs().diff(plan.submittedAt, "day") : 0;
}

function isCreditOutOfRange(credits: number) {
  return credits < STUDY_PLAN_CREDIT_LIMIT.min || credits > STUDY_PLAN_CREDIT_LIMIT.max;
}

export function StudyPlanReview({ plans }: { plans: StudyPlan[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [updates, setUpdates] = useState<Record<string, Partial<StudyPlan>>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StudyPlanStatus>();
  const [className, setClassName] = useState<string>();
  const [form] = Form.useForm<{ comment: string }>();

  const rows = useMemo(
    () =>
      plans
        .map((plan) => ({ ...plan, ...updates[plan.id] }))
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            dayjs(a.submittedAt ?? "2100-01-01").valueOf() - dayjs(b.submittedAt ?? "2100-01-01").valueOf(),
        ),
    [plans, updates],
  );
  const classNames = useMemo(() => [...new Set(plans.map((plan) => plan.className))].sort(), [plans]);
  const needle = normalize(query.trim());
  const filtered = rows.filter(
    (row) =>
      (!needle || normalize(`${row.fullName} ${row.studentCode}`).includes(needle)) &&
      (!status || row.status === status) &&
      (!className || row.className === className),
  );
  const openPlan = rows.find((row) => row.id === openId) ?? null;

  const review = (plan: StudyPlan, next: StudyPlanStatus, comment: string | null) => {
    setUpdates((current) => ({ ...current, [plan.id]: { status: next, advisorComment: comment, reviewedAt: new Date().toISOString() } }));
    messageApi.success(next === "approved" ? `Đã duyệt kế hoạch của ${plan.fullName}` : `Đã trả lại kế hoạch cho ${plan.fullName}, sinh viên nhận email kèm nhận xét`);
  };

  const columns: TableColumnsType<StudyPlan> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="font-mono text-xs text-muted">{row.studentCode}</span>
        </span>
      ),
    },
    { title: "Lớp", dataIndex: "className", width: 130, render: (value: string) => <span className="font-mono text-xs">{value}</span> },
    {
      title: "Tín chỉ kỳ tới",
      dataIndex: "totalCredits",
      width: 110,
      align: "right",
      render: (value: number) => (
        <span className={`tabular-nums ${isCreditOutOfRange(value) ? "font-medium text-amber-700" : ""}`}>{value}</span>
      ),
    },
    {
      title: "Nộp lúc",
      key: "submittedAt",
      width: 180,
      render: (_, row) => {
        if (!row.submittedAt) return <span className="text-xs text-muted">Chưa nộp</span>;
        const days = waitingDays(row);
        return (
          <span className="flex flex-col text-xs tabular-nums">
            <span className="text-muted">{formatDateTime(row.submittedAt)}</span>
            {row.status === "pending" && days > PENDING_TOO_LONG_DAYS && <span className="font-medium text-amber-700">Chờ {days} ngày</span>}
          </span>
        );
      },
    },
    { title: "Trạng thái", dataIndex: "status", width: 120, render: (value: StudyPlanStatus) => <StatusTag status={STUDY_PLAN_STATUS[value]} /> },
    {
      title: "",
      key: "action",
      width: 96,
      align: "right",
      render: (_, row) => (
        <Button size="small" type={row.status === "pending" ? "default" : "text"} disabled={row.status === "draft"} onClick={() => setOpenId(row.id)}>
          {row.status === "pending" ? "Xét duyệt" : "Xem"}
        </Button>
      ),
    },
  ];

  const nextTermCredits = openPlan?.terms[0]?.courses.reduce((sum, course) => sum + course.credits, 0) ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap gap-2">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Tên hoặc mã sinh viên"
          aria-label="Tìm sinh viên"
          className="w-full sm:w-64"
        />
        <Select
          allowClear
          value={status}
          onChange={setStatus}
          placeholder="Mọi trạng thái"
          aria-label="Trạng thái kế hoạch"
          options={(Object.keys(STUDY_PLAN_STATUS) as StudyPlanStatus[]).map((value) => ({ value, label: STUDY_PLAN_STATUS[value].label }))}
          className="min-w-0 flex-1 sm:w-44 sm:flex-none"
        />
        <Select
          allowClear
          value={className}
          onChange={setClassName}
          placeholder="Mọi lớp"
          aria-label="Lớp"
          options={classNames.map((value) => ({ value, label: value }))}
          className="min-w-0 flex-1 sm:w-44 sm:flex-none"
        />
      </div>

      <Table
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 860 }}
        pagination={{ pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} kế hoạch` }}
        locale={{
          emptyText: (
            <EmptyState
              icon={Route}
              title={plans.length === 0 ? "Chưa có kế hoạch học tập" : "Không có kế hoạch khớp bộ lọc"}
              description={plans.length === 0 ? "Sinh viên được cố vấn chưa nộp kế hoạch nào." : "Thử bỏ bớt điều kiện lọc."}
            />
          ),
        }}
      />

      <Drawer
        open={Boolean(openPlan)}
        onClose={() => setOpenId(null)}
        size={560}
        title={openPlan ? `Kế hoạch học tập của ${openPlan.fullName}` : ""}
        footer={
          openPlan?.status === "pending" ? (
            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsReturning(true)}>Trả lại</Button>
              <Button
                type="primary"
                onClick={() => {
                  review(openPlan, "approved", "Kế hoạch hợp lý.");
                  setOpenId(null);
                }}
              >
                Duyệt
              </Button>
            </div>
          ) : null
        }
      >
        {openPlan && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="font-mono">{openPlan.studentCode}</span>
              <span className="font-mono">{openPlan.className}</span>
              <StatusTag status={STUDY_PLAN_STATUS[openPlan.status]} />
            </div>
            {isCreditOutOfRange(nextTermCredits) && (
              <Alert
                type="warning"
                showIcon
                title={`Học kỳ tới có ${nextTermCredits} tín chỉ`}
                description={`Hạn mức đăng ký từ ${STUDY_PLAN_CREDIT_LIMIT.min} đến ${STUDY_PLAN_CREDIT_LIMIT.max} tín chỉ. Nên trả lại để sinh viên điều chỉnh.`}
              />
            )}
            {openPlan.terms.map((term) => {
              const credits = term.courses.reduce((sum, course) => sum + course.credits, 0);
              return (
                <section key={term.termName} className="flex flex-col gap-2">
                  <h3 className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                    {term.termName}
                    <span className="shrink-0 text-xs font-normal text-muted tabular-nums">{credits} tín chỉ</span>
                  </h3>
                  <ul className="flex flex-col divide-y divide-border-strong rounded-lg border border-border-strong">
                    {term.courses.map((course) => (
                      <li key={course.code} className="flex items-center gap-3 px-3 py-2">
                        <span className="w-20 shrink-0 font-mono text-xs text-muted">{course.code}</span>
                        <span className="min-w-0 flex-1 text-sm text-pretty">{course.name}</span>
                        <span className="shrink-0 text-xs text-muted tabular-nums">{course.credits} TC</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Ghi chú của sinh viên</h3>
              <p className="text-sm text-pretty text-muted">{openPlan.studentNote || "Không có ghi chú."}</p>
            </section>
            {openPlan.advisorComment && (
              <section className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">Nhận xét của cố vấn</h3>
                <p className="text-sm text-pretty">{openPlan.advisorComment}</p>
                {openPlan.reviewedAt && <p className="text-xs text-muted tabular-nums">{formatDateTime(openPlan.reviewedAt)}</p>}
              </section>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={isReturning}
        title="Trả lại kế hoạch học tập"
        okText="Trả lại"
        cancelText="Hủy"
        mask={{ closable: false }}
        destroyOnHidden
        onCancel={() => setIsReturning(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={({ comment }) => {
            if (openPlan) review(openPlan, "returned", comment.trim());
            setIsReturning(false);
            setOpenId(null);
            form.resetFields();
          }}
        >
          <Form.Item
            name="comment"
            label="Nhận xét gửi sinh viên"
            extra="Nêu rõ cần sửa gì để sinh viên nộp lại đúng."
            rules={[{ required: true, whitespace: true, message: "Chưa nhập nhận xét, sinh viên cần biết lý do để sửa" }]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
