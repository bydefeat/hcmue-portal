"use client";

import { useState } from "react";
import { Button, message, Modal, Table, type TableColumnsType } from "antd";
import { CalendarClock, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime, hoursUntil } from "@/shared/libs/date.lib";
import { periodState, REGISTRATION_PERIOD_STATE } from "../course-registration.constant";
import type { RegistrationPeriodView, Term } from "../course-registration.type";
import { RegistrationPeriodFormModal, type PeriodFormResult } from "./registration-period-form-modal";

type RegistrationPeriodListProps = {
  terms: Term[];
  periods: RegistrationPeriodView[];
};

function timeHint(period: RegistrationPeriodView) {
  if (period.state === "closing") {
    const hours = Math.max(1, Math.floor(period.hoursLeft));
    return { text: `Đóng sau ${hours} giờ`, className: "text-amber-700" };
  }
  if (period.state === "open") return { text: `Đóng sau ${Math.floor(period.hoursLeft / 24)} ngày`, className: "text-muted" };
  if (period.state === "upcoming") {
    const hoursToOpen = Math.max(0, hoursUntil(period.opensAt));
    return { text: hoursToOpen < 24 ? `Mở sau ${Math.ceil(hoursToOpen)} giờ` : `Mở sau ${Math.ceil(hoursToOpen / 24)} ngày`, className: "text-muted" };
  }
  return null;
}

function termOrder(term: Term) {
  if (term.isRegistrationTarget) return 0;
  if (term.isCurrent) return 1;
  return 2;
}

export function RegistrationPeriodList({ terms, periods }: RegistrationPeriodListProps) {
  const [messageApi, messageHolder] = message.useMessage();
  const [modal, modalHolder] = Modal.useModal();
  const [rows, setRows] = useState(periods);
  const [editing, setEditing] = useState<{ termId: string; period: RegistrationPeriodView | null } | null>(null);

  const orderedTerms = [...terms].sort((a, b) => termOrder(a) - termOrder(b) || b.startDate.localeCompare(a.startDate));
  const editingTerm = terms.find((term) => term.id === editing?.termId);

  const closeNow = (period: RegistrationPeriodView) => {
    const remaining = period.eligibleStudents - period.registeredStudents;
    modal.confirm({
      title: `Đóng ${period.name} ngay?`,
      content: `${remaining} sinh viên chưa đăng ký sẽ phải chờ đợt điều chỉnh. Không thể mở lại đợt sau khi đóng.`,
      okText: "Đóng đợt",
      cancelText: "Hủy",
      okButtonProps: { danger: true },
      mask: { closable: false },
      onOk: () => {
        setRows((current) =>
          current.map((row) => (row.id === period.id ? periodState({ ...row, closesAt: dayjs().subtract(1, "second").toISOString() }) : row)),
        );
        messageApi.success(`Đã đóng ${period.name}`);
      },
    });
  };

  const submit = (values: PeriodFormResult) => {
    if (!editing) return;
    if (editing.period) {
      const id = editing.period.id;
      setRows((current) => current.map((row) => (row.id === id ? periodState({ ...row, ...values }) : row)));
      messageApi.success(`Đã lưu ${values.name}`);
    } else {
      const created = periodState({
        ...values,
        id: `dot-moi-${Date.now()}`,
        termId: editing.termId,
        eligibleStudents: 0,
        registeredStudents: 0,
      });
      setRows((current) => [...current, created]);
      messageApi.success(`Đã tạo ${values.name}. Sinh viên thấy đợt này khi đến giờ mở.`);
    }
    setEditing(null);
  };

  const columns: TableColumnsType<RegistrationPeriodView> = [
    {
      title: "Đợt",
      key: "name",
      width: 220,
      render: (_, row) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.name}</span>
          <span className="text-xs text-muted">Khóa {row.cohorts.join(", ")}</span>
        </span>
      ),
    },
    {
      title: "Thời gian",
      key: "time",
      width: 200,
      render: (_, row) => (
        <span className="flex flex-col text-xs tabular-nums">
          <span>Mở {formatDateTime(row.opensAt)}</span>
          <span>Đóng {formatDateTime(row.closesAt)}</span>
        </span>
      ),
    },
    {
      title: "Hạn mức",
      key: "credits",
      width: 100,
      render: (_, row) => (
        <span className="tabular-nums">
          {row.minCredits} đến {row.maxCredits} TC
        </span>
      ),
    },
    {
      title: "Đã đăng ký",
      key: "registered",
      width: 160,
      render: (_, row) =>
        row.state === "upcoming" ? (
          <span className="text-xs text-muted">Chưa mở</span>
        ) : (
          <span className="flex flex-col gap-1">
            <span className="text-xs tabular-nums">
              <span className="font-medium">{row.registeredStudents}</span>/{row.eligibleStudents} sinh viên
            </span>
            <MeterBar value={row.registeredStudents} max={row.eligibleStudents} label={`Đã đăng ký ${row.name}`} />
          </span>
        ),
    },
    {
      title: "Trạng thái",
      key: "state",
      width: 150,
      render: (_, row) => {
        const hint = timeHint(row);
        return (
          <span className="flex flex-col items-start gap-1">
            <StatusTag status={REGISTRATION_PERIOD_STATE[row.state]} />
            {hint && <span className={`text-xs tabular-nums ${hint.className}`}>{hint.text}</span>}
          </span>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 160,
      align: "right",
      render: (_, row) =>
        row.state === "closed" ? null : (
          <span className="flex justify-end gap-1">
            <Button size="small" type="text" onClick={() => setEditing({ termId: row.termId, period: row })}>
              Sửa
            </Button>
            {(row.state === "open" || row.state === "closing") && (
              <Button size="small" type="text" danger onClick={() => closeNow(row)}>
                Đóng đợt
              </Button>
            )}
          </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {messageHolder}
      {modalHolder}
      {orderedTerms.map((term) => {
        const termPeriods = rows.filter((row) => row.termId === term.id).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
        const canAdd = term.isRegistrationTarget || term.isCurrent;
        return (
          <section key={term.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <h2 className="text-lg font-semibold">{term.name}</h2>
                <span className="text-xs text-muted">
                  {term.isRegistrationTarget ? "Học kỳ đang nhận đăng ký" : term.isCurrent ? "Học kỳ đang diễn ra" : "Đã kết thúc"}
                </span>
              </div>
              {canAdd && (
                <Button
                  type={term.isRegistrationTarget ? "primary" : "default"}
                  icon={<Plus size={16} aria-hidden className={term.isRegistrationTarget ? undefined : "text-zinc-500"} />}
                  onClick={() => setEditing({ termId: term.id, period: null })}
                >
                  Mở đợt mới
                </Button>
              )}
            </div>
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={termPeriods}
              pagination={false}
              scroll={{ x: 1000 }}
              locale={{
                emptyText: (
                  <EmptyState
                    icon={CalendarClock}
                    title="Chưa có đợt đăng ký"
                    description={canAdd ? "Tạo đợt để sinh viên đăng ký lớp của học kỳ này." : "Học kỳ này không tổ chức đăng ký trên cổng."}
                  />
                ),
              }}
            />
          </section>
        );
      })}
      <RegistrationPeriodFormModal
        open={editing !== null}
        period={editing?.period ?? null}
        termName={editingTerm?.name ?? ""}
        onClose={() => setEditing(null)}
        onSubmit={submit}
      />
    </div>
  );
}
