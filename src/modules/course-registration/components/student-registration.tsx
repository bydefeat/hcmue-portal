"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Checkbox, Form, Input, message, Modal, Select } from "antd";
import { CircleCheck, CircleXmark, Magnifier, Plus, Trash } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { HOLD_KIND_LABEL, meetingText, REGISTRATION_PERIOD_STATE } from "@/modules/course-registration/course-registration.constant";
import {
  basketProblems,
  blockingHolds,
  chosenMeetings,
  evaluateSection,
  sectionCredits,
  type RegistrationIssue,
  type RegistrationStudent,
} from "@/modules/course-registration/course-registration.rule";
import type { ClassSectionView, RegistrationHold, RegistrationPeriodState, RegistrationPeriodView } from "@/modules/course-registration/course-registration.type";
import { LabGroupPicker } from "@/modules/course-registration/components/lab-group-picker";
import { RegistrationQueueModal } from "@/modules/course-registration/components/registration-queue-modal";
import { PeriodCountdown } from "@/modules/course-registration/components/student-period-countdown";
import { normalizeSearch } from "@/shared/libs/search.lib";

type StudentRegistrationProps = {
  sections: ClassSectionView[];
  period: RegistrationPeriodView | null;
  cohort: number;
  student: RegistrationStudent;
  passedGrades: Record<string, string>;
  prerequisites: Record<string, string[]>;
  corequisites: Record<string, string[]>;
  equivalents: Record<string, string[]>;
  courseNames: Record<string, string>;
  credits: { min: number; max: number; note?: string };
  planCodes: string[];
  inProgressCodes: string[];
  initialPlannedIds: string[];
  initialLabChoices: Record<string, string>;
  holds: RegistrationHold[];
};

type Simulation = "actual" | RegistrationPeriodState;

const SIMULATION_OPTIONS: { value: Simulation; label: string }[] = [
  { value: "actual", label: "Theo thời gian thực" },
  { value: "upcoming", label: "Đợt sắp mở" },
  { value: "open", label: "Đợt đang mở" },
  { value: "closing", label: "Đợt sắp đóng" },
  { value: "closed", label: "Đợt đã đóng" },
];

function waitlistPosition(code: string) {
  return 1 + ([...code].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6);
}

function PeriodBanner({ period, state, cohort }: { period: RegistrationPeriodView | null; state: RegistrationPeriodState | null; cohort: number }) {
  if (!period || !state) {
    return (
      <Alert
        type="info"
        showIcon
        title={`Chưa có đợt đăng ký cho khóa ${cohort}`}
        description="Phòng Đào tạo sẽ thông báo lịch đăng ký trên cổng và qua email. Bạn vẫn có thể chọn trước các lớp dự kiến."
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
        description={`Mở lúc ${formatDateTime(period.opensAt)}, đóng lúc ${formatDateTime(period.closesAt)}. Chọn trước các lớp dự kiến, khi đợt mở chỉ cần bấm Đăng ký.`}
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
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

export function StudentRegistration({
  sections,
  period,
  cohort,
  student,
  passedGrades,
  prerequisites,
  corequisites,
  equivalents,
  courseNames,
  credits,
  planCodes,
  inProgressCodes,
  initialPlannedIds,
  initialLabChoices,
  holds,
}: StudentRegistrationProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [plannedIds, setPlannedIds] = useState(initialPlannedIds);
  const [registeredIds, setRegisteredIds] = useState<string[]>([]);
  const [waitlistIds, setWaitlistIds] = useState<string[]>([]);
  const [labChoices, setLabChoices] = useState<Record<string, string>>(initialLabChoices);
  const [pickerSection, setPickerSection] = useState<ClassSectionView | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const activeHolds = blockingHolds(holds);
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
  const context = {
    planned: basket,
    passedGrades,
    prerequisites,
    corequisites,
    equivalents,
    courseNames,
    maxCredits: credits.max,
    creditCapNote: credits.note,
    inProgressCodes,
    student,
    labChoices,
  };

  const rows = sections
    .map((section) => ({ section, issues: evaluateSection(section, context) }))
    .filter(({ section, issues }) => {
      const needle = normalizeSearch(query.trim());
      if (needle && !normalizeSearch(`${section.code} ${section.courseName} ${section.lecturerName ?? ""}`).includes(needle)) return false;
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
    if (section.labGroups.length > 0) {
      setPickerSection(section);
      return;
    }
    setPlannedIds((current) => [...current, section.id]);
    messageApi.success(`Đã chọn lớp ${section.code}`);
  };

  const confirmLab = (section: ClassSectionView, groupId: string) => {
    setLabChoices((current) => ({ ...current, [section.id]: groupId }));
    if (!plannedIds.includes(section.id) && !registeredIds.includes(section.id)) setPlannedIds((current) => [...current, section.id]);
    const group = section.labGroups.find((entry) => entry.id === groupId);
    messageApi.success(`Đã chọn ${section.code} với nhóm thực hành ${group?.code.split(".").at(-1) ?? ""}`);
    setPickerSection(null);
  };

  const busyMeetingsExcept = (sectionId: string) =>
    basket.filter((entry) => entry.id !== sectionId).flatMap((entry) => chosenMeetings(entry, labChoices).map((meeting) => ({ code: entry.code, meeting })));

  const removePlanned = (section: ClassSectionView) => setPlannedIds((current) => current.filter((id) => id !== section.id));

  const problems = basketProblems(basket, context);
  const closedLabel = state === "upcoming" ? "Chờ đợt đăng ký mở" : "Ngoài thời gian đăng ký";
  const blockReason =
    activeHolds.length > 0
      ? `Tài khoản đang bị khóa đăng ký: ${activeHolds[0].reason}`
      : !isOpen
        ? closedLabel
        : planned.length === 0
          ? registered.length > 0
            ? `Đã đăng ký ${registered.length} lớp, chọn thêm lớp nếu cần`
            : "Chọn ít nhất 1 lớp để đăng ký"
          : basketCredits < credits.min
            ? `Cần tối thiểu ${credits.min} tín chỉ, còn thiếu ${credits.min - basketCredits}`
            : problems.length > 0
              ? `${problems[0].section.code}: ${problems[0].issue.message}`
              : null;
  const registerLabel = activeHolds.length > 0 ? "Đang bị khóa đăng ký" : isOpen ? `Đăng ký ${planned.length} lớp` : closedLabel;

  const register = () => {
    if (blockReason) return;
    setIsQueueOpen(true);
  };

  const creditSummary = (
    <span className="text-sm">
      Tổng <span className="font-semibold tabular-nums">{basketCredits}</span>
      <span className="text-muted tabular-nums">/{credits.max} tín chỉ</span> · <span className="tabular-nums">{basket.length}</span> lớp
    </span>
  );

  const commitRegistration = () => {
    setIsQueueOpen(false);
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
        <PeriodBanner period={period} state={state} cohort={cohort} />
        {holds
          .filter((hold) => !hold.releasedAt)
          .map((hold) => (
            <Alert
              key={hold.id}
              type={hold.blocking ? "error" : "warning"}
              showIcon
              title={`${hold.blocking ? "Bị khóa đăng ký" : "Lưu ý"} (${HOLD_KIND_LABEL[hold.kind]}): ${hold.reason}`}
              description={hold.resolveHint}
              action={hold.kind === "tuition" ? <Link href="/application/tuition">Xem học phí</Link> : undefined}
            />
          ))}
        {credits.note && <Alert type="warning" showIcon title={credits.note} />}
        <Form layout="inline" colon={false}>
          <Form.Item label="Xem thử trạng thái đợt" className="mb-0">
            <Select<Simulation> value={simulation} onChange={setSimulation} options={SIMULATION_OPTIONS} className="w-48" />
          </Form.Item>
        </Form>
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
            <SectionCard flush>
              <EmptyState illustration="search" title="Không có lớp khớp bộ lọc" description="Bỏ bớt điều kiện lọc để xem toàn bộ lớp đang mở." />
            </SectionCard>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map(({ section, issues }) => {
                const isPlanned = plannedIds.includes(section.id);
                const isRegistered = registeredIds.includes(section.id);
                const blocked = issues.some((issue) => issue.blocking);
                const onlyFull = blocked && issues.filter((issue) => issue.blocking).every((issue) => issue.kind === "full");
                const isWaiting = waitlistIds.includes(section.id);
                return (
                  <li key={section.id}>
                    <Card size="small" classNames={{ body: "flex flex-col gap-3 md:flex-row md:items-start" }}>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted">{section.code}</span>
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
                          <Button onClick={() => removePlanned(section)} icon={<Trash size={16} aria-hidden className="text-zinc-500" />}>
                            Bỏ chọn
                          </Button>
                        ) : isWaiting ? (
                          <span className="flex flex-col items-start gap-1 md:items-stretch">
                            <span className="text-xs text-amber-700 tabular-nums">Đang chờ, vị trí {waitlistPosition(section.code)}</span>
                            <Button
                              size="small"
                              onClick={() => {
                                setWaitlistIds((current) => current.filter((id) => id !== section.id));
                                messageApi.info(`Đã rời danh sách chờ lớp ${section.code}`);
                              }}
                            >
                              Rời danh sách chờ
                            </Button>
                          </span>
                        ) : onlyFull ? (
                          <Button
                            onClick={() => {
                              setWaitlistIds((current) => [...current, section.id]);
                              messageApi.success(
                                `Đã vào danh sách chờ lớp ${section.code}, vị trí ${waitlistPosition(section.code)}. Khi có chỗ trống hệ thống tự đăng ký nếu không trùng lịch và báo cho bạn.`,
                              );
                            }}
                          >
                            Vào danh sách chờ
                          </Button>
                        ) : (
                          <Button onClick={() => add(section)} disabled={blocked} icon={<Plus size={16} aria-hidden className="text-zinc-500" />}>
                            Chọn lớp
                          </Button>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-20">
          <SectionCard title="Lớp đã chọn" extra={period && state ? <StatusTag status={REGISTRATION_PERIOD_STATE[state]} /> : undefined} flush>
            {basket.length === 0 ? (
              <EmptyState illustration="done" title="Chưa chọn lớp nào" description="Bấm Chọn lớp ở lớp muốn học, lớp đã chọn hiện ở đây." />
            ) : (
              <ul className="flex flex-col divide-y divide-border-strong">
                {registered.map((section) => (
                  <li key={section.id} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{section.courseName}</span>
                      <span className="text-xs text-muted">
                        {section.code} · <span className="tabular-nums">{section.credits} TC</span> ·{" "}
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
                  <li key={section.id} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{section.courseName}</span>
                      <span className="text-xs text-muted">
                        {section.code} · <span className="tabular-nums">{section.credits} TC</span> · Dự kiến
                      </span>
                      {section.labGroups.length > 0 && (
                        <span className="text-xs">
                          {labChoices[section.id] ? (
                            <span className="text-muted">
                              Thực hành {meetingText(section.labGroups.find((group) => group.id === labChoices[section.id])!.meeting)}
                            </span>
                          ) : (
                            <span className="text-rose-700">Chưa chọn nhóm thực hành</span>
                          )}{" "}
                          <Button type="link" size="small" onClick={() => setPickerSection(section)} className="h-auto p-0 text-xs">
                            {labChoices[section.id] ? "Đổi nhóm" : "Chọn nhóm"}
                          </Button>
                        </span>
                      )}
                      {basketProblems([section, ...basket.filter((entry) => entry.id !== section.id)], context)
                        .filter((problem) => problem.section.id === section.id && problem.issue.kind !== "lab")
                        .map((problem) => (
                          <span key={problem.issue.kind} className="text-xs text-pretty text-rose-700">
                            {problem.issue.message}
                          </span>
                        ))}
                    </span>
                    <Button size="small" type="text" aria-label={`Bỏ ${section.code}`} icon={<Trash size={16} aria-hidden className="text-zinc-500" />} onClick={() => removePlanned(section)} />
                  </li>
                ))}
              </ul>
            )}
            <div className="hidden flex-col gap-2 border-t border-border-strong px-4 sm:px-5 py-3 lg:flex">
              {creditSummary}
              <MeterBar value={basketCredits} max={credits.max} tone={basketCredits < credits.min ? "warning" : "primary"} label="Số tín chỉ đã chọn" />
              {blockReason && isOpen && <span className={`text-xs text-pretty ${planned.length === 0 ? "text-muted" : "text-amber-700"}`}>{blockReason}</span>}
              <Button type="primary" block disabled={Boolean(blockReason)} onClick={register}>
                {registerLabel}
              </Button>
            </div>
          </SectionCard>
        </aside>
      </div>

      <div aria-hidden className="h-16 lg:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-strong bg-surface px-4 pt-3 pb-[calc(78px+env(safe-area-inset-bottom))] lg:hidden print:hidden">
        <div className="mx-auto flex max-w-[420px] items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            {creditSummary}
            {blockReason && isOpen && <span className={`line-clamp-2 text-xs text-pretty ${planned.length === 0 ? "text-muted" : "text-amber-700"}`}>{blockReason}</span>}
          </div>
          <Button type="primary" disabled={Boolean(blockReason)} onClick={register} className="shrink-0">
            {isOpen && activeHolds.length === 0 ? "Đăng ký" : registerLabel}
          </Button>
        </div>
      </div>

      <LabGroupPicker
        key={pickerSection?.id ?? "none"}
        section={pickerSection}
        busyMeetings={pickerSection ? busyMeetingsExcept(pickerSection.id) : []}
        initialGroupId={pickerSection ? labChoices[pickerSection.id] : undefined}
        onCancel={() => setPickerSection(null)}
        onConfirm={confirmLab}
      />
      <RegistrationQueueModal open={isQueueOpen} onAdmitted={commitRegistration} onLeave={() => setIsQueueOpen(false)} />
    </div>
  );
}
