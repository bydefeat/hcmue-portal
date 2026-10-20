"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert, Button, Card, Input, InputNumber, message, Modal, Table, Upload as FilePicker, type TableColumnsType } from "antd";
import { Download, FilePen, LockKey, Pen, Upload } from "defeat-icons-react";
import { DownloadPdfButton } from "@/shared/components/ui/download-pdf-button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, daysUntil, formatDateTime, schoolTime } from "@/shared/libs/date.lib";
import { downloadBase64, parseCsv } from "@/shared/libs/download.lib";
import { GradeComponentsEditor } from "@/modules/grades/components/grade-components-editor";
import { exportGradeSheetExcel, exportGradeSheetPdf, lockGradeSheet, readGradeSheetExcel, saveGradeComponents, saveGradeScores } from "@/modules/grades/grades.action";
import { formatPoint, GRADE_SHEET_STATE, letterTextClass } from "@/modules/grades/grades.constant";
import { GRADE_IMPORT_MAX_BYTES, letterOf as gradeLetterOf, parseScoreMatrix, weightedScore, type ScoreChange } from "@/modules/grades/grades.rule";
import {
  NewLecturerRequestDrawer,
  type BusySlot,
  type RequestClassOption,
} from "@/modules/requests/components/new-lecturer-request-drawer";
import type { GradeComponent, GradeSheet, GradeSheetState, GradingRules, ScoreRow } from "@/modules/grades/grades.type";
import { assessmentMismatches } from "@/modules/teaching/teaching.rule";

export type GradingStudent = {
  studentId: string;
  studentCode: string;
  fullName: string;
};

export type GradeChangeRequestOptions = {
  classes: RequestClassOption[];
  busySlots: BusySlot[];
  rooms: string[];
  requester: { id: string; name: string; code: string; unit: string };
};

type GradingTableProps = {
  sheet: GradeSheet & { state: GradeSheetState; grading: GradingRules };
  students: GradingStudent[];
  classCode: string;
  classId: string;
  returnReason?: string | null;
  requestOptions?: GradeChangeRequestOptions;
  // Cột theo đề cương đã công bố của lớp, gợi ý khi sửa cột điểm.
  suggestedComponents?: GradeComponent[] | null;
};

const EDITABLE_STATUSES: GradeSheet["status"][] = ["draft", "returned"];

const AUTOSAVE_DELAY = 1200;

function deadlineText(deadline: string) {
  const days = daysUntil(deadline);
  if (dayjs().isAfter(deadline)) return `quá hạn ${Math.max(1, -days)} ngày`;
  if (days === 0) return "hết hạn hôm nay";
  return `còn ${days} ngày`;
}

export function GradingTable({ sheet, students, classCode, classId, returnReason, requestOptions, suggestedComponents = null }: GradingTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [scores, setScores] = useState<Record<string, ScoreRow>>(sheet.scores);
  const [components, setComponents] = useState<GradeComponent[]>(sheet.components);
  const [isEditingColumns, setIsEditingColumns] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLocked, setIsLocked] = useState(!EDITABLE_STATUSES.includes(sheet.status));
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [lockedAt, setLockedAt] = useState(sheet.lockedAt);
  const [savedAt, setSavedAt] = useState(sheet.savedAt);
  const [version, setVersion] = useState(0);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  // Bảng điểm khác đề cương đã công bố: chốt phải ghi lý do (server cũng chặn).
  const [syllabusReason, setSyllabusReason] = useState("");
  const [needsSyllabusReason, setNeedsSyllabusReason] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocking, startLocking] = useTransition();
  const inputs = useRef(new Map<string, HTMLInputElement>());
  // Ô đã sửa chưa lưu; các lần lưu nối tiếp nhau để chốt điểm luôn chạy sau lần lưu cuối.
  const pending = useRef(new Map<string, ScoreChange>());
  const saving = useRef<Promise<boolean>>(Promise.resolve(true));

  const classSectionId = sheet.classSectionId;
  const flush = useCallback(() => {
    saving.current = saving.current.then(async () => {
      if (pending.current.size === 0) return true;
      const changes = [...pending.current.values()];
      pending.current.clear();
      setIsSaving(true);
      const result = await saveGradeScores({ classSectionId, changes });
      setIsSaving(false);
      if (result.ok) {
        setSavedAt(result.data.savedAt);
        return true;
      }
      // Lưu không được thì giữ lại các ô chưa bị sửa tiếp để lần sau gửi lại.
      for (const change of changes) {
        const id = `${change.studentId}:${change.key}`;
        if (!pending.current.has(id)) pending.current.set(id, change);
      }
      messageApi.error(result.message);
      return false;
    });
    return saving.current;
  }, [classSectionId, messageApi]);

  useEffect(() => {
    if (version === 0) return;
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [version, flush]);

  // Rời trang khi còn ô chưa lưu thì lưu nốt.
  useEffect(() => () => void flush(), [flush]);

  const { filled, total } = useMemo(() => {
    const values = students.flatMap((student) => components.map((component) => scores[student.studentId]?.[component.key] ?? null));
    return { filled: values.filter((value) => value !== null).length, total: values.length };
  }, [scores, components, students]);

  const state: GradeSheetState = isLocked && EDITABLE_STATUSES.includes(sheet.status) ? "locked" : sheet.state;
  const canRequestChange = sheet.status === "approved" || sheet.status === "published";
  const missing = total - filled;

  const updateScore = (studentId: string, key: string, value: number | null) => {
    setScores((current) => ({ ...current, [studentId]: { ...current[studentId], [key]: value } }));
    pending.current.set(`${studentId}:${key}`, { studentId, key, score: value });
    setVersion((current) => current + 1);
  };

  const readFile = async (file: File): Promise<{ changes: ScoreChange[]; errors: string[] } | null> => {
    if (file.name.toLowerCase().endsWith(".csv")) return parseScoreMatrix(parseCsv(await file.text()), components, students);
    if (file.size > GRADE_IMPORT_MAX_BYTES) {
      messageApi.error("Tệp lớn hơn 900 KB, kiểm tra lại đúng tệp bảng điểm chưa.");
      return null;
    }
    const formData = new FormData();
    formData.set("classSectionId", classSectionId);
    formData.set("file", file);
    const result = await readGradeSheetExcel(formData);
    if (result.ok) return result.data;
    messageApi.error(result.message);
    return null;
  };

  const importFile = async (file: File) => {
    const read = await readFile(file);
    if (!read) return;
    const { changes, errors } = read;
    for (const change of changes) updateScore(change.studentId, change.key, change.score);
    if (errors.length === 0) {
      messageApi.success(`Đã điền ${changes.length} điểm từ tệp ${file.name}, đang lưu nháp.`);
      return;
    }
    Modal.warning({
      title: changes.length > 0 ? `Đã điền ${changes.length} điểm, ${errors.length} ô lỗi được bỏ qua` : "Không điền được điểm nào",
      content: (
        <ul className="flex max-h-64 flex-col gap-1 overflow-auto text-sm">
          {errors.slice(0, 50).map((error) => (
            <li key={error}>{error}</li>
          ))}
          {errors.length > 50 && <li className="text-muted">và {errors.length - 50} lỗi khác</li>}
        </ul>
      ),
    });
  };

  const exportFile = async () => {
    setIsExporting(true);
    // Lưu nốt ô vừa sửa để tệp có điểm mới nhất.
    await flush();
    const result = await exportGradeSheetExcel(classSectionId);
    setIsExporting(false);
    if (!result.ok) {
      messageApi.error(result.message);
      return;
    }
    downloadBase64(result.data.fileName, result.data.base64, result.data.mimeType);
  };

  const scoredCount = useMemo(
    () =>
      Object.fromEntries(
        components.map((component) => [component.key, students.filter((student) => (scores[student.studentId]?.[component.key] ?? null) !== null).length]),
      ),
    [components, scores, students],
  );

  const saveColumns = async (next: { key: string | null; label: string; weight: number }[], confirmDropScores: boolean) => {
    if (!(await flush())) return "Chưa lưu được điểm vừa nhập, thử lại sau khi lưu nháp xong.";
    const result = await saveGradeComponents({ classSectionId, components: next, confirmDropScores });
    if (!result.ok) return result.message;
    const keys = new Set(result.data.components.map((component) => component.key));
    setScores((current) =>
      Object.fromEntries(
        Object.entries(current).map(([studentId, row]) => [
          studentId,
          Object.fromEntries(result.data.components.map((component) => [component.key, row[component.key] ?? null]).filter(([key]) => keys.has(key as string))),
        ]),
      ),
    );
    setComponents(result.data.components);
    setIsEditingColumns(false);
    messageApi.success("Đã lưu cột điểm.");
    return null;
  };

  const focusCell = (rowIndex: number, columnIndex: number) => inputs.current.get(`${rowIndex}:${columnIndex}`)?.focus();

  const lock = () =>
    startLocking(async () => {
      if (!(await flush())) return;
      const result = await lockGradeSheet(sheet.classSectionId, { syllabusReason: syllabusReason.trim() || null });
      if (!result.ok) {
        if (result.fieldErrors?.syllabusReason) setNeedsSyllabusReason(true);
        messageApi.error(result.message);
        return;
      }
      setIsLocked(true);
      setLockedAt(result.data.lockedAt);
      setIsConfirmOpen(false);
      messageApi.success(`Đã chốt điểm lớp ${classCode}. Bảng điểm đã gửi khoa duyệt.`);
    });

  const requestLock = () => {
    if (missing > 0) {
      messageApi.error(`Còn ${missing} điểm chưa nhập nên chưa chốt được. Nhập đủ điểm rồi chốt lại.`);
      return;
    }
    setIsConfirmOpen(true);
  };

  const scoreInput = (row: GradingStudent, component: GradeSheet["components"][number], register?: { rowIndex: number; columnIndex: number }) => {
    const value = scores[row.studentId]?.[component.key] ?? null;
    if (isLocked) return <span className="tabular-nums">{formatPoint(value, 2) || "–"}</span>;
    return (
      <InputNumber
        ref={
          register
            ? (element) => {
                const key = `${register.rowIndex}:${register.columnIndex}`;
                if (element) inputs.current.set(key, element as unknown as HTMLInputElement);
                else inputs.current.delete(key);
              }
            : undefined
        }
        min={0}
        max={10}
        step={0.25}
        precision={2}
        decimalSeparator=","
        inputMode="decimal"
        value={value}
        aria-label={`${component.label} của ${row.fullName}`}
        onChange={(next) => updateScore(row.studentId, component.key, typeof next === "number" ? next : null)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !register) return;
          event.preventDefault();
          focusCell(register.rowIndex + 1, register.columnIndex);
        }}
        controls={false}
        className={register ? "w-20 tabular-nums" : "w-full tabular-nums"}
      />
    );
  };

  const totalOf = (row: GradingStudent) => weightedScore(components, scores[row.studentId] ?? {}, sheet.grading.roundingStep);

  const letterOf = (row: GradingStudent) => {
    const totalScore = totalOf(row);
    if (totalScore === null) return <span className="text-muted">–</span>;
    const letter = gradeLetterOf(totalScore, sheet.grading.scale).letter;
    return <span className={`font-medium ${letterTextClass(letter)}`}>{letter}</span>;
  };

  const columns: TableColumnsType<GradingStudent> = [
    { title: "STT", key: "index", width: 56, align: "right", fixed: "left", render: (_, __, index) => <span className="text-muted tabular-nums">{index + 1}</span> },
    {
      title: "Sinh viên",
      key: "student",
      width: 210,
      fixed: "left",
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="text-xs text-muted">{row.studentCode}</span>
        </span>
      ),
    },
    ...components.map((component, columnIndex) => ({
      title: (
        <span className="flex flex-col">
          {component.label}
          <span className="text-xs font-normal text-muted tabular-nums">{component.weight}%</span>
        </span>
      ),
      key: component.key,
      width: 120,
      align: "center" as const,
      render: (_: unknown, row: GradingStudent, rowIndex: number) => scoreInput(row, component, { rowIndex, columnIndex }),
    })),
    {
      title: "Tổng",
      key: "total",
      width: 80,
      align: "right",
      render: (_, row) => {
        const rowTotal = totalOf(row);
        return <span className={`font-medium tabular-nums ${rowTotal === null ? "" : letterTextClass(gradeLetterOf(rowTotal, sheet.grading.scale).letter)}`}>{formatPoint(rowTotal, 1) || <span className="text-muted">–</span>}</span>;
      },
    },
    {
      title: "Điểm chữ",
      key: "letter",
      width: 88,
      align: "center",
      render: (_, row) => letterOf(row),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <Card size="small">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag status={GRADE_SHEET_STATE[state]} />
              {isLocked && lockedAt ? (
                <span className="text-sm text-muted">Chốt lúc {formatDateTime(lockedAt)}</span>
              ) : (
                <span className="text-sm text-muted tabular-nums">
                  Hạn nhập {formatDateTime(sheet.deadline)}, {deadlineText(sheet.deadline)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="w-40">
                <MeterBar value={filled} max={total} tone={filled === total ? "success" : "primary"} label="Tiến độ nhập điểm" />
              </div>
              <span className="text-xs text-muted tabular-nums">
                Đã nhập {filled}/{total} điểm
              </span>
              {!isLocked && isSaving && <span className="text-xs text-muted">Đang lưu nháp…</span>}
              {!isLocked && !isSaving && savedAt && <span className="text-xs text-muted tabular-nums">Đã lưu nháp lúc {schoolTime(savedAt).format("HH:mm")}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download size={16} aria-hidden className="text-zinc-500" />} loading={isExporting} onClick={() => void exportFile()}>
              Xuất Excel
            </Button>
            {isLocked && <DownloadPdfButton action={() => exportGradeSheetPdf(classSectionId)} />}
            {canRequestChange && requestOptions && (
              <Button icon={<FilePen size={16} aria-hidden className="text-zinc-500" />} onClick={() => setIsRequestOpen(true)}>
                Đề nghị sửa điểm
              </Button>
            )}
            {!isLocked && (
              <>
                <Button icon={<Pen size={16} aria-hidden className="text-zinc-500" />} onClick={() => setIsEditingColumns(true)}>
                  Sửa cột điểm
                </Button>
                <FilePicker
                  accept=".xlsx,.csv"
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void importFile(file);
                    return false;
                  }}
                >
                  <Button icon={<Upload size={16} aria-hidden className="text-zinc-500" />} title="Tệp .xlsx xuất từ nút Xuất Excel (hoặc .csv cùng mẫu)">
                    Nhập từ Excel
                  </Button>
                </FilePicker>
              </>
            )}
          </div>
        </div>
      </Card>

      {!isLocked && suggestedComponents && assessmentMismatches(suggestedComponents, components, false).length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="Cột điểm khác đề cương đã công bố"
          description={`${assessmentMismatches(suggestedComponents, components, false).join(" ")} Sửa cột điểm theo đề cương, hoặc ghi lý do khi chốt điểm.`}
        />
      )}
      {sheet.status === "returned" && !isLocked && (
        <Alert
          type="warning"
          showIcon
          title="Khoa trả lại bảng điểm để chỉnh sửa"
          description={`${returnReason ?? "Khoa chưa ghi lý do."} Sửa các ô liên quan rồi chốt lại để gửi khoa duyệt.`}
        />
      )}
      {isLocked && state === "locked" && (
        <Alert
          type="info"
          showIcon
          title="Bảng điểm đang chờ khoa duyệt"
          description="Không sửa được trong lúc chờ duyệt. Nếu phát hiện sai sót, liên hệ giáo vụ khoa để trả lại bảng điểm."
        />
      )}
      {canRequestChange && (
        <Alert
          type="info"
          showIcon
          title={sheet.status === "published" ? "Điểm đã công bố cho sinh viên" : "Khoa đã duyệt, chờ Phòng Đào tạo công bố"}
          description="Muốn sửa điểm phải gửi đơn đề nghị sửa điểm kèm minh chứng, qua Trưởng khoa và Phòng Đào tạo."
        />
      )}
      {state === "overdue" && (
        <Alert
          type="error"
          showIcon
          title="Đã quá hạn nhập điểm"
          description="Phòng Đào tạo vẫn nhận bảng điểm nhưng lớp sẽ bị ghi nhận nộp trễ. Chốt điểm sớm nhất có thể."
        />
      )}
      {!isLocked && (
        <p className="hidden text-xs text-muted md:block">Nhấn Tab để sang ô bên phải, Enter để xuống sinh viên kế tiếp. Điểm từ 0 đến 10, bước 0,25.</p>
      )}

      {students.length === 0 ? (
        <Card size="small">
          <EmptyState illustration="seats" title="Lớp chưa có sinh viên" description="Bảng điểm sẽ có sau khi sinh viên đăng ký học phần." />
        </Card>
      ) : (
        <>
          <Table
            rowKey="studentId"
            size="middle"
            columns={columns}
            dataSource={students}
            pagination={false}
            scroll={{ x: 434 + components.length * 120 }}
            className="hidden md:block"
          />
          <ul className="flex flex-col gap-2 md:hidden">
            {students.map((student, index) => (
              <li key={student.studentId}>
                <Card size="small" classNames={{ body: "flex flex-col gap-3" }}>
                  <span className="flex items-start gap-2">
                    <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">{index + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{student.fullName}</span>
                      <span className="text-xs text-muted">{student.studentCode}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end text-sm tabular-nums">
                      <span className="font-medium">{formatPoint(totalOf(student), 1) || <span className="text-muted">–</span>}</span>
                      {letterOf(student)}
                    </span>
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {components.map((component) => (
                      <div key={component.key} className="flex flex-col gap-1 text-xs text-muted">
                        <span>
                          {component.label} <span className="tabular-nums">({component.weight}%)</span>
                        </span>
                        {scoreInput(student, component)}
                      </div>
                    ))}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {!isLocked && (
        <Card size="small" className="sticky bottom-[calc(74px+env(safe-area-inset-bottom))] z-10 md:bottom-4" classNames={{ body: "flex flex-wrap items-center gap-2" }}>
          <span className="text-sm text-muted tabular-nums">
            {missing > 0 ? (
              <>
                Còn <span className="font-medium text-foreground">{missing}</span> điểm chưa nhập
              </>
            ) : (
              "Đã nhập đủ điểm"
            )}
          </span>
          <Button type="primary" danger icon={<LockKey size={16} aria-hidden />} onClick={requestLock} className="ml-auto">
            Chốt điểm
          </Button>
        </Card>
      )}

      <Modal
        open={isConfirmOpen}
        title={`Chốt điểm lớp ${classCode}?`}
        okText="Chốt điểm"
        cancelText="Hủy"
        okButtonProps={{ danger: true, loading: isLocking }}
        mask={{ closable: false }}
        onOk={lock}
        onCancel={() => setIsConfirmOpen(false)}
      >
        <p className="text-sm text-pretty">
          Sau khi chốt, bảng điểm của {students.length} sinh viên được gửi khoa duyệt rồi Phòng Đào tạo công bố. Bạn không sửa được nữa, trừ
          khi khoa trả lại hoặc qua đơn đề nghị sửa điểm.
        </p>
        {(needsSyllabusReason || (suggestedComponents && assessmentMismatches(suggestedComponents, components, false).length > 0)) && (
          <div className="mt-3 flex flex-col gap-1 text-sm">
            <span id="syllabus-reason-label">Lý do chốt dù khác đề cương đã công bố</span>
            <Input.TextArea aria-labelledby="syllabus-reason-label" value={syllabusReason} onChange={(event) => setSyllabusReason(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} maxLength={300} showCount />
          </div>
        )}
      </Modal>

      {!isLocked && (
        <GradeComponentsEditor
          open={isEditingColumns}
          components={components}
          suggested={suggestedComponents}
          scoredCount={scoredCount}
          onCancel={() => setIsEditingColumns(false)}
          onSave={saveColumns}
        />
      )}

      {requestOptions && (
        <NewLecturerRequestDrawer
          open={isRequestOpen}
          onClose={() => setIsRequestOpen(false)}
          {...requestOptions}
          prefill={{ kind: "grade-change", classId }}
          onCreated={(request) => {
            setIsRequestOpen(false);
            messageApi.success(`Đã gửi đơn ${request.code}. Theo dõi tiến độ ở mục Đơn từ.`);
          }}
        />
      )}
    </div>
  );
}
