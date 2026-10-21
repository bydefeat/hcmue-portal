import { FileContent } from "defeat-icons-react";
import { formatFileSize } from "@/shared/libs/upload.lib";
import { EXAM_PAPER_FILE_LABEL, examPaperHref } from "@/modules/exams/exams.constant";
import type { ExamPaperFile } from "@/modules/exams/exams.type";

export function ExamPaperLinks({ examSessionId, papers }: { examSessionId: string; papers: ExamPaperFile[] }) {
  if (papers.length === 0) return null;
  return (
    <span className="flex flex-col gap-0.5">
      {papers.map((paper) => (
        <a
          key={paper.kind}
          href={examPaperHref(examSessionId, paper.kind)}
          title={paper.fileName}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <FileContent size={14} aria-hidden className="shrink-0" />
          {EXAM_PAPER_FILE_LABEL[paper.kind]}
          <span className="text-muted tabular-nums">({formatFileSize(paper.sizeBytes)})</span>
        </a>
      ))}
    </span>
  );
}
