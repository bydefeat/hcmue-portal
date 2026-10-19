"use client";

import { useState } from "react";
import { Button, message, Modal, Table, type TableColumnsType } from "antd";
import { Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime, hoursUntil } from "@/shared/libs/date.lib";
import { REGISTRATION_PERIOD_STATE } from "@/modules/course-registration/course-registration.constant";
import type { RegistrationPeriodView, Term } from "@/modules/course-registration/course-registration.type";
import { RegistrationPeriodFormModal, type PeriodFormResult } from "@/modules/course-registration/components/registration-period-form-modal";
import { closePeriod, savePeriod } from "@/modules/course-registration/course-registration.action";

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

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";

export function RegistrationPeriodList({ terms, periods }: RegistrationPeriodListProps) {
  const [messageApi, messageHolder] = message.useMessage();
  const [modal, modalHolder] = Modal.useModal();
  const [rows, setRows] = useState(periods);
  const [editing, setEditing] = useState<{ termId: string; period: RegistrationPeriodView | null } | null>(null);

  const orderedTerms = [...terms].toSorted((a, b) => termOrder(a) - termOrder(b) || b.startDate.localeCompare(a.startDate));
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
      onOk: async () => {
        const result = await closePeriod(period.id).catch(() => null);
        if (!result?.ok) {
          messageApi.error(result?.message ?? NETWORK_ERROR);
          return;
        }
        setRows((current) => current.map((row) => (row.id === period.id ? result.data : row)));
        messageApi.success(`Đã đóng ${period.name}`);
      },
    });
  };

  const submit = async (values: PeriodFormResult) => {
    if (!editing) return undefined;
    const result = await savePeriod(editing.termId, editing.period?.id ?? null, values).catch(() => null);
    if (!result) {
      messageApi.error(NETWORK_ERROR);
      return undefined;
    }
    if (!result.ok) {
      messageApi.error(result.message);
      return result.fieldErrors;
    }
    const saved = result.data;
    setRows((current) => (editing.period ? current.map((row) => (row.id === saved.id ? saved : row)) : [...current, saved]));
    messageApi.success(editing.period ? `Đã lưu ${saved.name}` : `Đã tạo ${saved.name}. Sinh viên thấy đợt này khi đến giờ mở.`);
    setEditing(null);
    return undefined;
  };

  const columns: TableColumnsType<RegistrationPeriodView> = [
    {
      title: "Đợt",
      key: "name",
      width: 200,
      render: (_, row) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.name}</span>
          <span className="text-xs text-muted">Khóa {row.cohorts.join(", ")}</span>
          <span className="mt-1 flex flex-col items-start gap-1 text-xs text-muted tabular-nums md:hidden">
            <StatusTag status={REGISTRATION_PERIOD_STATE[row.state]} />
            Đóng {formatDateTime(row.closesAt)}
          </span>
        </span>
      ),
    },
    {
      title: "Thời gian",
      key: "time",
      width: 190,
      responsive: ["md"],
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
      width: 120,
      responsive: ["lg"],
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
      responsive: ["md"],
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
      responsive: ["md"],
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
      width: 110,
      align: "right",
      fixed: "right",
      render: (_, row) =>
        row.state === "closed" ? null : (
          <span className="flex flex-col items-end gap-1">
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
    <div className="flex flex-col gap-4 sm:gap-6">
      {messageHolder}
      {modalHolder}
      {orderedTerms.map((term) => {
        const termPeriods = rows.filter((row) => row.termId === term.id).toSorted((a, b) => a.opensAt.localeCompare(b.opensAt));
        const canAdd = term.isRegistrationTarget || term.isCurrent;
        return (
          <SectionCard
            key={term.id}
            flush
            title={
              <span className="flex min-w-0 flex-col py-2">
                <span className="truncate">Đợt đăng ký {term.name}</span>
                <span className="text-xs font-normal text-muted">
                  {term.isRegistrationTarget ? "Học kỳ đang nhận đăng ký" : term.isCurrent ? "Học kỳ đang diễn ra" : "Đã kết thúc"}
                </span>
              </span>
            }
            extra={
              canAdd ? (
                <Button
                  type={term.isRegistrationTarget ? "primary" : "default"}
                  icon={<Plus size={16} aria-hidden className={term.isRegistrationTarget ? undefined : "text-zinc-500"} />}
                  onClick={() => setEditing({ termId: term.id, period: null })}
                >
                  Mở đợt mới
                </Button>
              ) : undefined
            }
          >
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={termPeriods}
              pagination={false}
              scroll={{ x: "max-content" }}
              locale={{
                emptyText: (
                  <EmptyState
                    illustration="calendar"
                    title="Chưa có đợt đăng ký"
                    description={canAdd ? "Tạo đợt để sinh viên đăng ký lớp của học kỳ này." : "Học kỳ này không tổ chức đăng ký trên cổng."}
                  />
                ),
              }}
            />
          </SectionCard>
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
