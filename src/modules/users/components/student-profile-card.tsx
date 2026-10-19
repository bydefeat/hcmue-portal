import { Avatar, Descriptions } from "antd";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate } from "@/shared/libs/date.lib";
import { GENDER_LABEL, STUDENT_STATUS } from "../users.constant";
import type { Student } from "../users.type";

type StudentProfileCardProps = {
  student: Student;
  advisorName?: string | null;
};

function initialsOf(name: string) {
  return name.trim().split(/\s+/).at(-1)?.[0]?.toUpperCase() ?? "";
}

export function StudentProfileCard({ student, advisorName }: StudentProfileCardProps) {
  return (
    <SectionCard>
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size={48} className="shrink-0 bg-primary-light text-base font-medium text-primary">
            {initialsOf(student.fullName)}
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-base font-semibold">{student.fullName}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {student.code}
              <StatusTag status={STUDENT_STATUS[student.status]} />
            </p>
          </div>
        </div>
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: "class", label: "Lớp", children: student.className },
            { key: "major", label: "Ngành", children: student.majorName },
            { key: "faculty", label: "Khoa", children: student.faculty },
            { key: "cohort", label: "Khóa", children: `Khóa ${student.cohort}` },
            ...(advisorName !== undefined ? [{ key: "advisor", label: "Cố vấn", children: advisorName ?? "Chưa phân công" }] : []),
            { key: "dob", label: "Ngày sinh", children: <span className="tabular-nums">{formatDate(student.dateOfBirth)}</span> },
            { key: "gender", label: "Giới tính", children: GENDER_LABEL[student.gender] },
            { key: "hometown", label: "Quê quán", children: student.hometown },
            {
              key: "email",
              label: "Email",
              children: (
                <a href={`mailto:${student.email}`} className="break-all">
                  {student.email}
                </a>
              ),
            },
            { key: "phone", label: "Điện thoại", children: <a href={`tel:${student.phone}`} className="tabular-nums">{student.phone}</a> },
          ]}
        />
      </div>
    </SectionCard>
  );
}
