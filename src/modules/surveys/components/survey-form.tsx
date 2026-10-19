"use client";

import { useEffect } from "react";
import { Alert, Button, Drawer, Form, Input, Radio } from "antd";
import { SURVEY_SCALE } from "@/modules/surveys/surveys.constant";
import type { Survey, StudentSurveyTask } from "@/modules/surveys/surveys.type";

type SurveyFormValues = Record<string, number | string | undefined>;

type SurveyFormProps = {
  open: boolean;
  survey: Survey;
  task: StudentSurveyTask | null;
  onClose: () => void;
  onSubmit: (task: StudentSurveyTask) => void;
};

export function SurveyForm({ open, survey, task, onClose, onSubmit }: SurveyFormProps) {
  const [form] = Form.useForm<SurveyFormValues>();
  const groups = [...new Set(survey.questions.map((question) => question.group))];

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={640}
      destroyOnHidden
      mask={{ closable: false }}
      title={task ? `${task.courseName} · ${task.classCode}` : ""}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" onClick={() => form.submit()}>
            Gửi đánh giá
          </Button>
        </div>
      }
    >
      {task && (
        <Form<SurveyFormValues> form={form} layout="vertical" onFinish={() => onSubmit(task)} scrollToFirstError>
          <Alert
            type="info"
            showIcon
            className="mb-6"
            title="Phiếu khảo sát ẩn danh"
            description={`Giảng viên ${task.lecturerName ?? "phụ trách"} chỉ thấy kết quả tổng hợp khi lớp có từ 5 phiếu trở lên, không thấy tên người đánh giá.`}
          />
          {groups.map((group) => (
            <fieldset key={group} className="mb-6 flex flex-col gap-1">
              <legend className="mb-3 text-base font-semibold">{group}</legend>
              {survey.questions
                .filter((question) => question.group === group)
                .map((question) => (
                  <Form.Item
                    key={question.id}
                    name={question.id}
                    label={<span className="text-pretty">{question.text}</span>}
                    rules={[{ required: true, message: "Chọn một mức đánh giá" }]}
                  >
                    <Radio.Group className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {SURVEY_SCALE.map((option) => (
                        <Radio key={option.value} value={option.value}>
                          {option.label}
                        </Radio>
                      ))}
                    </Radio.Group>
                  </Form.Item>
                ))}
            </fieldset>
          ))}
          <Form.Item name="comment" label="Góp ý thêm cho giảng viên">
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} showCount />
          </Form.Item>
        </Form>
      )}
    </Drawer>
  );
}
