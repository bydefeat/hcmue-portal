"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, Button, Card, Drawer, Form, Input, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { reviewStudyPlan } from "@/modules/study-plan/study-plan.action";
import { PENDING_TOO_LONG_DAYS, STUDY_PLAN_CREDIT_LIMIT, STUDY_PLAN_STATUS } from "@/modules/study-plan/study-plan.constant";
import type { StudyPlan, StudyPlanStatus } from "@/modules/study-plan/study-plan.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";

const STATUS_ORDER: Record<StudyPlanStatus, number> = { pending: 0, returned: 1, draft: 2, approved: 3 };

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
  const [isReviewing, startReviewing] = useTransition();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StudyPlanStatus>();
  const [className, setClassName] = useState<string>();
  const [form] = Form.useForm<{ comment: string }>();

  const rows = useMemo(
    () =>
      plans
        .map((plan) => ({ ...plan, ...updates[plan.id] }))
        .toSorted(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            dayjs(a.submittedAt ?? "2100-01-01").valueOf() - dayjs(b.submittedAt ?? "2100-01-01").valueOf(),
        ),
    [plans, updates],
  );
  const classNames = useMemo(() => [...new Set(plans.map((plan) => plan.className))].toSorted(), [plans]);
  const needle = normalizeSearch(query.trim());
  const filtered = rows.filter(
    (row) =>
      (!needle || normalizeSearch(`${row.fullName} ${row.studentCode}`).includes(needle)) &&
      (!status || row.status === status) &&
      (!className || row.className === className),
  );
  const openPlan = rows.find((row) => row.id === openId) ?? null;

  const review = (plan: StudyPlan, decision: "approved" | "returned", comment: string) =>
    startReviewing(async () => {
      const result = await reviewStudyPlan({ id: plan.id, decision, comment }).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        if (decision === "returned") form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      const reviewed = result.data;
      setUpdates((current) => ({ ...current, [plan.id]: reviewed }));
      if (decision === "returned") form.resetFields();
      setIsReturning(false);
      setOpenId(null);
      messageApi.success(decision === "approved" ? `Đã duyệt kế hoạch của ${plan.fullName}` : `Đã trả lại kế hoạch cho ${plan.fullName}, sinh viên nhận email kèm nhận xét`);
    });

  const creditText = (value: number) =>
    isCreditOutOfRange(value) ? (
      <span className="flex flex-col items-end tabular-nums">
        <span className="font-medium text-amber-700">{value}</span>
        <span className="text-xs text-amber-700">
          Ngoài {STUDY_PLAN_CREDIT_LIMIT.min}-{STUDY_PLAN_CREDIT_LIMIT.max} TC
        </span>
      </span>
    ) : (
      <span className="tabular-nums">{value}</span>
    );

  const actionButton = (row: StudyPlan) =>
    row.status === "draft" ? null : (
      <Button size="small" type={row.status === "pending" ? "primary" : "default"} onClick={() => setOpenId(row.id)}>
        {row.status === "pending" ? "Xét duyệt" : "Xem"}
      </Button>
    );

  const emptyText = (
    <EmptyState
      illustration="search"
      title={plans.length === 0 ? "Chưa có kế hoạch học tập" : "Không có kế hoạch khớp bộ lọc"}
      description={plans.length === 0 ? "Sinh viên được cố vấn chưa nộp kế hoạch nào." : "Thử bỏ bớt điều kiện lọc."}
    />
  );

  const columns: TableColumnsType<StudyPlan> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="text-xs text-muted">{row.studentCode}</span>
        </span>
      ),
    },
    { title: "Lớp", dataIndex: "className", width: 130, render: (value: string) => <span className="text-xs">{value}</span> },
    {
      title: "Tín chỉ kỳ tới",
      dataIndex: "totalCredits",
      width: 110,
      align: "right",
      render: (value: number) => creditText(value),
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
      render: (_, row) => actionButton(row),
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
        pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} kế hoạch` }}
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
            const days = waitingDays(row);
            return (
              <li key={row.id}>
                <Card size="small" classNames={{ body: "flex flex-col gap-2" }}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{row.fullName}</span>
                      <span className="text-xs text-muted">
                        {row.studentCode} · {row.className}
                      </span>
                    </span>
                    <StatusTag status={STUDY_PLAN_STATUS[row.status]} />
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted tabular-nums">
                    <span className={isCreditOutOfRange(row.totalCredits) ? "font-medium text-amber-700" : ""}>{row.totalCredits} tín chỉ kỳ tới</span>
                    <span>{row.submittedAt ? `Nộp ${formatDateTime(row.submittedAt)}` : "Chưa nộp"}</span>
                    {row.status === "pending" && days > PENDING_TOO_LONG_DAYS && <span className="font-medium text-amber-700">Chờ {days} ngày</span>}
                  </span>
                  {row.status !== "draft" && <div className="flex justify-end">{actionButton(row)}</div>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={Boolean(openPlan)}
        onClose={() => setOpenId(null)}
        size={560}
        title={openPlan ? `Kế hoạch học tập của ${openPlan.fullName}` : ""}
        footer={
          openPlan?.status === "pending" ? (
            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsReturning(true)} disabled={isReviewing}>
                Trả lại
              </Button>
              <Button type="primary" loading={isReviewing && !isReturning} onClick={() => review(openPlan, "approved", "Kế hoạch hợp lý.")}>
                Duyệt
              </Button>
            </div>
          ) : null
        }
      >
        {openPlan && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{openPlan.studentCode}</span>
              <span>{openPlan.className}</span>
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
                        <span className="w-20 shrink-0 text-xs text-muted">{course.code}</span>
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
        confirmLoading={isReviewing}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={({ comment }) => {
            if (openPlan) review(openPlan, "returned", comment.trim());
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
