"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@bprogress/next/app";
import Link from "next/link";
import { Alert, Button, Card, Checkbox, Drawer, Form, Input, message, Modal, Select } from "antd";
import { CircleXmark, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { dayjs } from "@/shared/libs/date.lib";
import { HOLD_KIND_LABEL, keepCurrencyTogether, meetingText } from "@/modules/course-registration/course-registration.constant";
import { blockingHolds, evaluateSection, sectionCredits, type RegistrationStudent } from "@/modules/course-registration/course-registration.rule";
import type { ClassSectionView, RegistrationEvent, RegistrationHold } from "@/modules/course-registration/course-registration.type";
import { RegistrationHistoryList } from "@/modules/course-registration/components/registration-history-list";
import { adminDrop, adminRegister } from "@/modules/course-registration/course-registration.action";
import { SectionCard } from "@/shared/components/ui/section-card";

type AdminStudentRegistrationProps = {
  studentId: string;
  studentName: string;
  student: RegistrationStudent;
  termName: string;
  sections: ClassSectionView[];
  registered: ClassSectionView[];
  holds: RegistrationHold[];
  events: RegistrationEvent[];
  passedGrades: Record<string, string>;
  prerequisites: Record<string, string[]>;
  corequisites: Record<string, string[]>;
  equivalents: Record<string, string[]>;
  courseNames: Record<string, string>;
  credits: { max: number; note?: string };
  actorName: string;
};

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";

export function AdminStudentRegistration({
  studentId,
  studentName,
  student,
  termName,
  sections,
  registered: initialRegistered,
  holds,
  events: initialEvents,
  passedGrades,
  prerequisites,
  corequisites,
  equivalents,
  courseNames,
  credits,
  actorName,
}: AdminStudentRegistrationProps) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [isSaving, startSaving] = useTransition();
  const [registered, setRegistered] = useState(initialRegistered);
  const [events, setEvents] = useState(initialEvents);
  const [isAdding, setIsAdding] = useState(false);
  const [sectionId, setSectionId] = useState<string>();
  const [labId, setLabId] = useState<string>();
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [dropping, setDropping] = useState<ClassSectionView | null>(null);
  const [dropReason, setDropReason] = useState("");

  const activeHolds = holds.filter((hold) => !hold.releasedAt);
  const blocking = blockingHolds(holds);
  const selected = sections.find((section) => section.id === sectionId) ?? null;
  const issues = selected
    ? evaluateSection(selected, {
        planned: registered,
        passedGrades,
        prerequisites,
        corequisites,
        equivalents,
        courseNames,
        maxCredits: credits.max,
        creditCapNote: credits.note,
        student,
      })
    : [];
  const blockingIssues = issues.filter((issue) => issue.blocking && issue.kind !== "lab");
  const needsLab = Boolean(selected && selected.labGroups.length > 0);
  const canSubmit = Boolean(selected) && reason.trim().length > 0 && (!needsLab || labId) && (blockingIssues.length === 0 || override);

  const logEvent = (event: Omit<RegistrationEvent, "id" | "at" | "actor" | "channel">) =>
    setEvents((current) => [
      { ...event, id: `ev-admin-${dayjs().valueOf()}`, at: dayjs().toISOString(), actor: actorName, channel: "Phòng Đào tạo" },
      ...current,
    ]);

  const closeAdd = () => {
    setIsAdding(false);
    setSectionId(undefined);
    setLabId(undefined);
    setOverride(false);
    setReason("");
  };

  const submitAdd = () => {
    if (!selected || !canSubmit) return;
    const lab = selected.labGroups.find((group) => group.id === labId);
    startSaving(async () => {
      const result = await adminRegister({ studentId, sectionId: selected.id, labGroupId: labId ?? null, reason, override }).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      setRegistered((current) => [...current, result.data]);
      logEvent({
        kind: "admin-add",
        sectionCode: selected.code,
        courseName: selected.courseName,
        note: `${reason.trim()}${lab ? `. Nhóm thực hành ${lab.code}` : ""}${override && blockingIssues.length > 0 ? ". Bỏ qua kiểm tra điều kiện" : ""}`,
      });
      messageApi.success(`Đã đăng ký hộ ${selected.code} cho ${studentName}.`);
      closeAdd();
      router.refresh();
    });
  };

  const submitDrop = () => {
    if (!dropping) return;
    if (!dropReason.trim()) {
      messageApi.warning("Ghi lý do hủy hộ để sinh viên và cố vấn biết");
      return;
    }
    startSaving(async () => {
      const result = await adminDrop(studentId, dropping.id, dropReason).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      setRegistered((current) => current.filter((section) => section.id !== dropping.id));
      logEvent({ kind: "admin-drop", sectionCode: dropping.code, courseName: dropping.courseName, note: dropReason.trim() });
      messageApi.success(`Đã hủy hộ ${dropping.code}, chỗ được trả lại cho lớp`);
      setDropping(null);
      setDropReason("");
      router.refresh();
    });
  };

  return (
    <>
      <SectionCard
        title="Đăng ký học phần"
        extra={
          <Button icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => setIsAdding(true)}>
            Đăng ký hộ
          </Button>
        }
      >
        {contextHolder}
        <div className="flex flex-col gap-3">
          <span className="text-xs text-muted">
            {termName} · <span className="tabular-nums">{sectionCredits(registered)}</span>/{credits.max} tín chỉ
          </span>
          {activeHolds.map((hold) => (
            <Alert
              key={hold.id}
              type={hold.blocking ? "error" : "warning"}
              showIcon
              title={`${hold.blocking ? "Đang khóa đăng ký" : "Lưu ý"} (${HOLD_KIND_LABEL[hold.kind]}): ${keepCurrencyTogether(hold.reason)}`}
              description={
                <>
                  {hold.resolveHint}. <Link href="/administrator/registration-holds">Quản lý khóa đăng ký</Link>
                </>
              }
            />
          ))}
          {credits.note && <Alert type="warning" showIcon title={credits.note} />}

          {registered.length === 0 ? (
            <EmptyState illustration="done" title="Chưa đăng ký lớp nào" description="Sinh viên chưa đăng ký hoặc đợt của khóa chưa mở." />
          ) : (
            <Card size="small" classNames={{ body: "p-0" }}>
              <ul className="flex flex-col divide-y divide-border-strong">
                {registered.map((section) => (
                  <li key={section.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium text-pretty">{section.courseName}</span>
                      <span className="text-xs text-muted">
                        {section.code} · <span className="tabular-nums">{section.credits} TC</span> ·{" "}
                        {section.meetings.map(meetingText).join("; ")}
                      </span>
                    </span>
                    <Button size="small" type="text" danger onClick={() => setDropping(section)}>
                      Hủy hộ
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Drawer
          open={isAdding}
          onClose={closeAdd}
          size={560}
          destroyOnHidden
          mask={{ closable: false }}
          title={`Đăng ký hộ cho ${studentName}`}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={closeAdd}>Hủy</Button>
              <Button type="primary" loading={isSaving} disabled={!canSubmit} onClick={submitAdd}>
                Đăng ký hộ
              </Button>
            </div>
          }
        >
          <Form layout="vertical">
            {blocking.length > 0 && (
              <Alert
                type="warning"
                showIcon
                className="mb-4"
                title="Sinh viên đang bị khóa đăng ký"
                description="Đăng ký hộ vẫn được, nhưng cần ghi rõ căn cứ. Khóa không tự gỡ."
              />
            )}
            <Form.Item label="Lớp học phần" required>
              <Select
                showSearch={{ optionFilterProp: "label" }}
                value={sectionId}
                onChange={(value) => {
                  setSectionId(value);
                  setLabId(undefined);
                  setOverride(false);
                }}
                placeholder="Chọn lớp"
                options={sections
                  .filter((section) => !registered.some((entry) => entry.id === section.id))
                  .map((section) => ({
                    value: section.id,
                    label: `${section.code} ${section.courseName} (${section.enrolled}/${section.capacity})`,
                  }))}
              />
            </Form.Item>
            {selected && needsLab && (
              <Form.Item label="Nhóm thực hành" required>
                <Select
                  value={labId}
                  onChange={setLabId}
                  placeholder="Chọn nhóm"
                  options={selected.labGroups.map((group) => ({
                    value: group.id,
                    label: `${group.code.split(".").at(-1)} · ${meetingText(group.meeting)} · ${group.enrolled}/${group.capacity}`,
                  }))}
                />
              </Form.Item>
            )}
            {selected && (
              <div className="mb-4 flex flex-col gap-1">
                <span className="text-sm font-medium">Kết quả kiểm tra</span>
                {issues.filter((issue) => issue.kind !== "lab").length === 0 ? (
                  <span className="text-sm text-green-700">Đủ điều kiện đăng ký</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {issues
                      .filter((issue) => issue.kind !== "lab")
                      .map((issue) => (
                        <li key={issue.kind} className={`flex items-start gap-1.5 text-xs text-pretty ${issue.blocking ? "text-rose-700" : "text-amber-700"}`}>
                          <CircleXmark size={14} aria-hidden className="mt-px shrink-0" />
                          {issue.message}
                        </li>
                      ))}
                  </ul>
                )}
                {blockingIssues.length > 0 && (
                  <Checkbox checked={override} onChange={(event) => setOverride(event.target.checked)} className="mt-1">
                    Bỏ qua kiểm tra, chịu trách nhiệm theo căn cứ ghi bên dưới
                  </Checkbox>
                )}
              </div>
            )}
            <Form.Item label="Căn cứ đăng ký hộ" required>
              <Input.TextArea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                autoSize={{ minRows: 2 }}
                maxLength={300}
                showCount
                placeholder="Ví dụ: theo đơn DT-2026-01258 đã được duyệt"
              />
            </Form.Item>
          </Form>
        </Drawer>

        <Modal
          open={dropping !== null}
          title={dropping ? `Hủy hộ ${dropping.code} của ${studentName}?` : ""}
          okText="Hủy hộ"
          okButtonProps={{ danger: true, loading: isSaving }}
          cancelText="Giữ lớp"
          onOk={submitDrop}
          onCancel={() => {
            setDropping(null);
            setDropReason("");
          }}
          mask={{ closable: false }}
          destroyOnHidden
        >
          <p className="mb-3 text-sm text-pretty text-muted">Chỗ trống trả lại cho lớp. Sinh viên nhận thông báo kèm lý do trên cổng sinh viên (nếu đã kích hoạt tài khoản).</p>
          <Input.TextArea
            value={dropReason}
            onChange={(event) => setDropReason(event.target.value)}
            autoSize={{ minRows: 2 }}
            placeholder="Lý do hủy hộ"
            aria-label="Lý do hủy hộ"
          />
        </Modal>
      </SectionCard>
      <SectionCard title="Lịch sử đăng ký" flush>
        <RegistrationHistoryList events={events} />
      </SectionCard>
    </>
  );
}
