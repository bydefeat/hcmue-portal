"use client";

import { useState } from "react";
import { Button, Card, message } from "antd";
import { CircleCheck } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { dayjs, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { submitSurvey } from "@/modules/surveys/surveys.action";
import type { StudentSurveyTask, Survey } from "@/modules/surveys/surveys.type";
import { SurveyForm, type SurveyFormValues } from "@/modules/surveys/components/survey-form";
import { SectionCard } from "@/shared/components/ui/section-card";

export function StudentSurveyList({ survey, tasks }: { survey: Survey; tasks: StudentSurveyTask[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(tasks);
  const [openId, setOpenId] = useState<string | null>(null);
  const done = rows.filter((task) => task.submittedAt).length;
  const isClosed = dayjs().isAfter(survey.closesAt);
  const opened = rows.find((task) => task.classSectionId === openId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}
      <SectionCard>
        <div className="flex flex-col gap-2">
          <h2 className="font-medium text-pretty">{survey.title}</h2>
          <p className="text-xs text-muted tabular-nums">Mở đến {formatDateTime(survey.closesAt)}</p>
          <div className="flex items-center gap-3">
            <MeterBar value={done} max={rows.length} tone={done === rows.length ? "success" : "primary"} label="Số lớp đã đánh giá" />
            <span className="shrink-0 text-sm tabular-nums">
              Đã đánh giá {done}/{rows.length} lớp
            </span>
          </div>
        </div>
      </SectionCard>
      {rows.length === 0 ? (
        <SectionCard flush>
          <EmptyState illustration="document" title="Không có lớp cần đánh giá" description="Học kỳ này bạn chưa có lớp học phần nào." />
        </SectionCard>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((task) => (
            <li key={task.classSectionId}>
              <Card size="small" classNames={{ body: "flex flex-col gap-3 sm:flex-row sm:items-center" }}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-pretty">{task.courseName}</span>
                  <span className="text-xs text-muted">
                    {task.classCode} · {task.lecturerName ?? "Chưa phân công giảng viên"}
                  </span>
                </span>
                {task.submittedAt ? (
                  <span className="flex items-center gap-1 text-sm text-green-700">
                    <CircleCheck size={16} aria-hidden />
                    Đã gửi ngày {formatDate(task.submittedAt)}
                  </span>
                ) : (
                  <Button onClick={() => setOpenId(task.classSectionId)} disabled={isClosed}>
                    {isClosed ? "Đã hết hạn" : "Đánh giá"}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <SurveyForm
        open={opened !== null}
        survey={survey}
        task={opened}
        onClose={() => setOpenId(null)}
        onSubmit={async (task, values: SurveyFormValues) => {
          const { comment, ...scores } = values;
          const answers = Object.fromEntries(Object.entries(scores).map(([questionId, score]) => [questionId, Number(score)]));
          const result = await submitSurvey({ surveyId: survey.id, classSectionId: task.classSectionId, answers, comment: typeof comment === "string" ? comment : undefined }).catch(() => null);
          if (!result) {
            messageApi.error("Chưa gửi được, kiểm tra kết nối rồi thử lại.");
            return undefined;
          }
          if (!result.ok) {
            messageApi.error(result.message);
            return result.fieldErrors;
          }
          const { classSectionId, submittedAt } = result.data;
          setRows((current) => current.map((row) => (row.classSectionId === classSectionId ? { ...row, submittedAt } : row)));
          setOpenId(null);
          messageApi.success(`Đã gửi đánh giá lớp ${task.classCode}. Cảm ơn bạn đã góp ý.`);
          return undefined;
        }}
      />
    </div>
  );
}
