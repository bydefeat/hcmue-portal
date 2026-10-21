"use client";

import { useRef, useState } from "react";
import { Upload, type UploadFile } from "antd";
import { formatFileSize, inspectFile } from "@/shared/libs/upload.lib";
import { ATTACHMENT_LIMIT } from "@/modules/requests/requests.constant";

type Picked = { uid: string; file: File };

export function useAttachmentPicker(onError: (message: string) => void) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const current = useRef<Picked[]>([]);
  const update = (next: Picked[]) => {
    current.current = next;
    setPicked(next);
  };

  const beforeUpload = async (file: File & { uid: string }) => {
    const checked = await inspectFile(file, { kinds: ATTACHMENT_LIMIT.kinds, maxBytes: ATTACHMENT_LIMIT.bytes });
    if (!checked.ok) {
      onError(checked.message);
      return Upload.LIST_IGNORE;
    }
    const list = current.current;
    const total = list.reduce((sum, entry) => sum + entry.file.size, 0) + file.size;
    if (list.length >= ATTACHMENT_LIMIT.files) onError(`Tối đa ${ATTACHMENT_LIMIT.files} tệp minh chứng.`);
    else if (total > ATTACHMENT_LIMIT.totalBytes) onError(`Tổng dung lượng minh chứng tối đa ${formatFileSize(ATTACHMENT_LIMIT.totalBytes)}, bỏ bớt tệp khác.`);
    else update([...list, { uid: file.uid, file }]);
    return Upload.LIST_IGNORE;
  };

  const fileList: UploadFile[] = picked.map(({ uid, file }) => ({ uid, name: file.name, size: file.size, type: file.type, status: "done" }));

  return {
    files: picked.map((entry) => entry.file),
    fileList,
    beforeUpload,
    onRemove: (file: UploadFile) => update(current.current.filter((entry) => entry.uid !== file.uid)),
    clear: () => update([]),
  };
}

export function formErrorsWithoutAttachments(fieldErrors: Record<string, string> | undefined) {
  return Object.fromEntries(Object.entries(fieldErrors ?? {}).filter(([key]) => key !== "attachments"));
}

export function requestFormData(input: unknown, files: File[]) {
  const formData = new FormData();
  formData.set("input", JSON.stringify(input));
  for (const file of files) formData.append("files", file);
  return formData;
}
