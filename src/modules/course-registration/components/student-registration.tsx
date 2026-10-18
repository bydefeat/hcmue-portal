"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Checkbox, Input, message, Modal, Select } from "antd";
import { CircleCheck, CircleXmark, ClipboardCheck, Magnifier, Plus, Trash } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { meetingText, REGISTRATION_PERIOD_STATE } from "../course-registration.constant";
import { evaluateSection, sectionCredits, type RegistrationIssue } from "../course-registration.rule";
import type { ClassSectionView, RegistrationPeriodState, RegistrationPeriodView } from "../course-registration.type";
import { PeriodCountdown } from "./student-period-countdown";

type StudentRegistrationProps = {
  sections: ClassSectionView[];
  period: RegistrationPeriodView | null;
  termName: string;
  cohort: number;
  passedGrades: Record<string, string>;
  prerequisites: Record<string, string[]>;
  courseNames: Record<string, string>;
  credits: { min: number; max: number };
  planCodes: string[];
  inProgressCodes: string[];
  initialPlannedIds: string[];
  tuitionWarning: string | null;
};

type Simulation = "actual" | RegistrationPeriodState;

const SIMULATION_OPTIONS: { value: Simulation; label: string }[] = [
  { value: "actual", label: "Theo thời gian thực" },
  { value: "upcoming", label: "Đợt sắp mở" },
  { value: "open", label: "Đợt đang mở" },
  { value: "closing", label: "Đợt sắp đóng" },
  { value: "closed", label: "Đợt đã đóng" },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

function PeriodBanner({ period, state, cohort }: { period: RegistrationPeriodView | null; state: RegistrationPeriodState | null; cohort: number }) {
  if (!period || !state) {
    return (
      <Alert
        type="info"
        showIcon
        title={`Chưa có đợt đăng ký cho khóa ${cohort}`}
        description="Phòng Đào tạo sẽ thông báo lịch đăng ký trên cổng và qua email. Bạn vẫn có thể chuẩn bị giỏ dự kiến."
      />
    );
  }
  if (state === "upcoming") {
    return (
      <Alert
        type="info"
        showIcon
        title={
          <span>
            {period.name}: <PeriodCountdown target={period.opensAt} prefix="mở" />
          </span>
        }
        description={`Mở lúc ${formatDateTime(period.opensAt)}, đóng lúc ${formatDateTime(period.closesAt)}. Chuẩn bị giỏ dự kiến trước, khi đợt mở chỉ cần bấm Đăng ký.`}
      />
    );
  }
  if (state === "open" || state === "closing") {
    return (
      <Alert
        type={state === "closing" ? "warning" : "success"}
        showIcon
        title={
          <span>
            {period.name} đang mở: <PeriodCountdown target={period.closesAt} prefix="đóng" />
          </span>
        }
        description={`Hạn mức từ ${period.minCredits} đến ${period.maxCredits} tín chỉ. Lớp chỉ được giữ chỗ sau khi bấm Đăng ký thành công.`}
      />
    );
  }
  return (
    <Alert
      type="warning"
      showIcon
      title={`${period.name} đã đóng lúc ${formatDateTime(period.closesAt)}`}
      description="Muốn thay đổi lớp, chờ đợt điều chỉnh hoặc gửi đơn rút học phần, xin mở lớp ở mục Đơn từ."
    />
  );
}

function IssueList({ issues }: { issues: RegistrationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((issue) => (
        <li key={issue.kind} className={`flex items-start gap-1.5 text-xs text-pretty ${issue.blocking ? "text-rose-700" : "text-amber-700"}`}>
          <CircleXmark size={14} aria-hidden className="mt-px shrink-0" />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function StudentRegistration({
  sections,
  period,
  termName,
  cohort,
  passedGrades,
  prerequisites,
  courseNames,
  credits,
  planCodes,
  inProgressCodes,
  initialPlannedIds,
  tuitionWarning,
}: StudentRegistrationProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [plannedIds, setPlannedIds] = useState(initialPlannedIds);
  const [registeredIds, setRegisteredIds] = useState<string[]>([]);
  const [simulation, setSimulation] = useState<Simulation>("actual");
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState<string>();
  const [onlyEligible, setOnlyEligible] = useState(false);
  const [onlyPlan, setOnlyPlan] = useState(false);

  const state: RegistrationPeriodState | null = simulation === "actual" ? (period?.state ?? null) : simulation;
  const isOpen = state === "open" || state === "closing";
  const byId = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const planned = plannedIds.map((id) => byId.get(id)).filter((section) => section !== undefined);
  const registered = registeredIds.map((id) => byId.get(id)).filter((section) => section !== undefined);
  const basket = [...registered, ...planned];
  const basketCredits = sectionCredits(basket);
  const faculties = [...new Set(sections.map((section) => section.faculty))];
  const context = { planned: basket, passedGrades, prerequisites, courseNames, maxCredits: credits.max, inProgressCodes };

  const rows = sections
    .map((section) => ({ section, issues: evaluateSection(section, context) }))
    .filter(({ section, issues }) => {
      const needle = normalize(query.trim());
      if (needle && !normalize(`${section.code} ${section.courseName} ${section.lecturerName ?? ""}`).includes(needle)) return false;
      if (faculty && section.faculty !== faculty) return false;
      if (onlyPlan && !planCodes.includes(section.courseCode)) return false;
      if (onlyEligible && issues.some((issue) => issue.blocking) && !plannedIds.includes(section.id)) return false;
      return true;
    });

  const add = (section: ClassSectionView) => {
    const blocking = evaluateSection(section, context).find((issue) => issue.blocking);
    if (blocking) {
      messageApi.error(blocking.message);
      return;
    }
    setPlannedIds((current) => [...current, section.id]);
    messageApi.success(`Đã thêm ${section.code} vào giỏ dự kiến`);
  };

  const removePlanned = (section: ClassSectionView) => setPlannedIds((current) => current.filter((id) => id !== section.id));

  const register = () => {
    if (!isOpen) return;
    if (basketCredits < credits.min) {
      messageApi.warning(`Cần tối thiểu ${credits.min} tín chỉ, giỏ đang có ${basketCredits}. Thêm học phần rồi đăng ký lại.`);
      return;
    }
    setRegisteredIds((current) => [...current, ...plannedIds]);
    setPlannedIds([]);
    messageApi.success(`Đã đăng ký ${planned.length} lớp, tổng ${basketCredits} tín chỉ. Kết quả đã gửi về email sinh viên.`);
  };

  const withdraw = (section: ClassSectionView) =>
    modal.confirm({
      title: `Hủy đăng ký ${section.code}?`,
      content: "Chỗ của bạn sẽ trả lại cho sinh viên khác. Muốn học lại phải đăng ký khi lớp còn chỗ.",
      okText: "Hủy đăng ký",
      okButtonProps: { danger: true },
      cancelText: "Giữ lớp",
      mask: { closable: false },
      onOk: () => {
        setRegisteredIds((current) => current.filter((id) => id !== section.id));
        messageApi.success(`Đã hủy đăng ký ${section.code}`);
      },
    });

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}
      {modalContextHolder}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-pretty text-muted">
          {termName}. Hệ thống kiểm tra tiên quyết, trùng lịch, sĩ số và hạn mức tín chỉ ngay khi bạn chọn lớp.
        </p>
        <PeriodBanner period={period} state={state} cohort={cohort} />
        {tuitionWarning && <Alert type="warning" showIcon title={tuitionWarning} action={<Link href="/application/tuition">Xem học phí</Link>} />}
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
          Xem thử trạng thái đợt
          <Select<Simulation> size="small" value={simulation} onChange={setSimulation} options={SIMULATION_OPTIONS} className="w-48" />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Input
              allowClear
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
              placeholder="Mã lớp, tên học phần, giảng viên"
              aria-label="Tìm lớp học phần"
              className="w-full sm:w-72"
            />
            <Select
              allowClear
              value={faculty}
              onChange={setFaculty}
              placeholder="Mọi khoa"
              aria-label="Khoa phụ trách"
              options={faculties.map((value) => ({ value, label: value }))}
              className="w-full sm:w-60"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Checkbox checked={onlyEligible} onChange={(event) => setOnlyEligible(event.target.checked)}>
                Chỉ lớp đăng ký được
              </Checkbox>
              <Checkbox checked={onlyPlan} onChange={(event) => setOnlyPlan(event.target.checked)} disabled={planCodes.length === 0}>
                Theo kế hoạch học tập
              </Checkbox>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-border-strong bg-surface">
              <EmptyState title="Không có lớp khớp bộ lọc" description="Bỏ bớt điều kiện lọc để xem toàn bộ lớp đang mở." />
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map(({ section, issues }) => {
                const isPlanned = plannedIds.includes(section.id);
                const isRegistered = registeredIds.includes(section.id);
                const blocked = issues.some((issue) => issue.blocking);
                return (
                  <li key={section.id} className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4 md:flex-row md:items-start">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted">{section.code}</span>
                        <span className="text-xs text-muted tabular-nums">{section.credits} TC</span>
                        {planCodes.includes(section.courseCode) && <span className="text-xs text-primary">Trong kế hoạch</span>}
                      </div>
                      <span className="font-medium text-pretty">{section.courseName}</span>
                      <span className="text-xs text-muted">{section.lecturerName ?? "Chưa phân công giảng viên"}</span>
                      <span className="text-xs text-muted">{section.meetings.map(meetingText).join("; ")}</span>
                      <IssueList issues={issues} />
                    </div>
                    <div className="flex shrink-0 items-center gap-3 md:w-56 md:flex-col md:items-stretch">
                      <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
                        <MeterBar
                          value={section.enrolled}
                          max={section.capacity}
                          tone={section.isFull ? "warning" : "primary"}
                          label={`Đã đăng ký ${section.code}`}
                        />
                        <span className="shrink-0 text-xs text-muted tabular-nums">
                          {section.enrolled}/{section.capacity}
                        </span>
                      </div>
                      {isRegistered ? (
                        <span className="flex items-center gap-1 text-sm text-green-700">
                          <CircleCheck size={16} aria-hidden />
                          Đã đăng ký
                        </span>
                      ) : isPlanned ? (
                        <Button onClick={() => removePlanned(section)} icon={<Trash size={16} aria-hidden />}>
                          Bỏ khỏi giỏ
                        </Button>
                      ) : (
                        <Button onClick={() => add(section)} disabled={blocked} icon={<Plus size={16} aria-hidden />}>
                          Thêm vào giỏ
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-20">
          <section className="flex flex-col rounded-xl border border-border-strong bg-surface">
            <header className="flex items-center justify-between gap-3 border-b border-border-strong px-4 py-3">
              <h2 className="text-lg font-semibold">Lớp đã chọn</h2>
              {period && state && <StatusTag status={REGISTRATION_PERIOD_STATE[state]} />}
            </header>
            {basket.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="Chưa chọn lớp nào" description="Bấm Thêm vào giỏ ở lớp muốn học." />
            ) : (
              <ul className="flex flex-col divide-y divide-border-strong">
                {registered.map((section) => (
                  <li key={section.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{section.courseName}</span>
                      <span className="text-xs text-muted">
                        <span className="font-mono">{section.code}</span> · <span className="tabular-nums">{section.credits} TC</span> ·{" "}
                        <span className="text-green-700">Đã đăng ký</span>
                      </span>
                    </span>
                    {isOpen ? (
                      <Button size="small" danger onClick={() => withdraw(section)}>
                        Hủy
                      </Button>
                    ) : (
                      <Link href="/application/requests" className="shrink-0 text-xs">
                        Gửi đơn rút
                      </Link>
                    )}
                  </li>
                ))}
                {planned.map((section) => (
                  <li key={section.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{section.courseName}</span>
                      <span className="text-xs text-muted">
                        <span className="font-mono">{section.code}</span> · <span className="tabular-nums">{section.credits} TC</span> · Dự kiến
                      </span>
                    </span>
                    <Button size="small" type="text" aria-label={`Bỏ ${section.code}`} icon={<Trash size={16} aria-hidden />} onClick={() => removePlanned(section)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <div className="sticky bottom-24 z-10 flex flex-col gap-2 rounded-xl border border-border-strong bg-surface p-3 sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm">
            Tổng <span className="font-semibold tabular-nums">{basketCredits}</span>
            <span className="text-muted tabular-nums">/{credits.max} tín chỉ</span> · <span className="tabular-nums">{basket.length}</span> lớp
          </span>
          <div className="w-48 max-w-full">
            <MeterBar value={basketCredits} max={credits.max} tone={basketCredits < credits.min ? "warning" : "primary"} label="Số tín chỉ đã chọn" />
          </div>
          {basketCredits < credits.min && (
            <span className="text-xs text-amber-700 tabular-nums">Cần tối thiểu {credits.min} tín chỉ, còn thiếu {credits.min - basketCredits}.</span>
          )}
        </div>
        <Button type="primary" disabled={!isOpen || planned.length === 0} onClick={register} className="shrink-0">
          {isOpen ? `Đăng ký ${planned.length} lớp` : state === "upcoming" ? "Chờ đợt đăng ký mở" : "Ngoài thời gian đăng ký"}
        </Button>
      </div>
    </div>
  );
}
