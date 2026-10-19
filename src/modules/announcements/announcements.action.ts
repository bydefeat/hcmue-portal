"use server";

import { and, eq, like, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { formatDateTime } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requirePermission } from "@/modules/access/access.query";
import { ANNOUNCEMENT_CATEGORY_LABEL, ANNOUNCEMENT_STATUS, ANNOUNCEMENTS_CONSTRAINT_MESSAGE } from "@/modules/announcements/announcements.constant";
import { getAnnouncements } from "@/modules/announcements/announcements.query";
import { ANNOUNCEMENT_SCHEMA, slugify, statusOfPublishMode, uniqueSlug, type AnnouncementInput } from "@/modules/announcements/announcements.rule";
import { announcements } from "@/modules/announcements/announcements.schema";
import type { Announcement, AnnouncementStatus } from "@/modules/announcements/announcements.type";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { auditChanges } from "@/modules/audit/audit.rule";

const MISSING = "Thông báo không còn tồn tại, tải lại trang để xem danh sách mới.";

function revalidateAnnouncements() {
  revalidatePath("/administrator/announcements");
  revalidatePath("/administrator");
  revalidatePath("/");
  revalidatePath("/announcements", "layout");
}

async function reload(id: string) {
  const [announcement] = await getAnnouncements(id);
  return announcement ? actionOk(announcement) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Trạng thái thật của dòng: hẹn giờ đã tới giờ được tính là đã đăng (giống query).
function liveStatus(row: { status: AnnouncementStatus; publishedAt: Date | null }): AnnouncementStatus {
  return row.status === "scheduled" && row.publishedAt && row.publishedAt <= new Date() ? "published" : row.status;
}

const dateText = (value: Date | null) => (value ? formatDateTime(value) : null);

export async function saveAnnouncement(id: string | null, input: AnnouncementInput): Promise<ActionResult<Announcement>> {
  const viewer = await requirePermission("announcements.manage");
  if (id !== null && !isUuid(id)) return actionError(MISSING);
  const parsed = parseInput(ANNOUNCEMENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { publishMode, publishedAt: scheduledAt, deadline, ...values } = parsed.data;
  const status = statusOfPublishMode(publishMode);
  if (status === "scheduled" && new Date(scheduledAt!) <= new Date()) {
    return actionError("Thời điểm đăng phải sau hiện tại.", { publishedAt: "Thời điểm đăng phải sau hiện tại" });
  }
  let savedId: string | null;
  try {
    savedId = await db.transaction(async (tx) => {
      const [existing] = id ? await tx.select().from(announcements).where(eq(announcements.id, id)).for("update") : [];
      if (id && !existing) return null;
      // Đăng ngay một thông báo đã đăng thì giữ ngày đăng cũ để thứ tự trên trang chủ không đổi khi sửa lỗi chính tả.
      const publishedAt =
        status === "draft" ? null : status === "scheduled" ? new Date(scheduledAt!) : existing && liveStatus(existing) === "published" && existing.publishedAt ? existing.publishedAt : new Date();
      const row = { ...values, status, publishedAt, deadline: deadline ? new Date(deadline) : null };
      const actor = auditActorOf(viewer);
      if (!existing) {
        const base = slugify(values.title);
        const taken = await tx
          .select({ slug: announcements.slug })
          .from(announcements)
          .where(or(eq(announcements.slug, base), like(announcements.slug, `${base}-%`)));
        const [created] = await tx
          .insert(announcements)
          .values({ ...row, slug: uniqueSlug(base, taken.map((entry) => entry.slug)), authorUserId: viewer.id, authorLabel: viewer.unit ?? "Phòng Đào tạo" })
          .returning({ id: announcements.id });
        const summary = { draft: "Lưu nháp thông báo", scheduled: `Hẹn giờ đăng lúc ${dateText(publishedAt)}`, published: "Đăng thông báo", archived: "" }[status];
        await recordAudit(tx, {
          actor,
          action: status === "published" ? "publish" : "create",
          entityType: "announcement",
          entityId: created.id,
          entityLabel: values.title,
          summary: values.isPinned ? `${summary}, ghim đầu trang` : summary,
        });
        return created.id;
      }
      await tx.update(announcements).set(row).where(eq(announcements.id, existing.id));
      const before = liveStatus(existing);
      await recordAudit(tx, {
        actor,
        action: before !== "published" && status === "published" ? "publish" : "update",
        entityType: "announcement",
        entityId: existing.id,
        entityLabel: values.title,
        summary: before !== "published" && status === "published" ? "Đăng thông báo" : "Sửa thông báo",
        changes: auditChanges([
          ["Tiêu đề", existing.title, values.title],
          ["Loại", ANNOUNCEMENT_CATEGORY_LABEL[existing.category], ANNOUNCEMENT_CATEGORY_LABEL[values.category]],
          ["Đối tượng", existing.audiences.join(", "), values.audiences.join(", ")],
          ["Trạng thái", ANNOUNCEMENT_STATUS[before].label, ANNOUNCEMENT_STATUS[status].label],
          ["Ghim", existing.isPinned, values.isPinned],
          ["Thời điểm đăng", dateText(existing.publishedAt), dateText(publishedAt)],
          ["Hạn chót", dateText(existing.deadline), dateText(row.deadline)],
          ["Tóm tắt", existing.summary, values.summary],
          ["Nội dung", existing.content === values.content ? "" : "Bản cũ", existing.content === values.content ? "" : "Bản mới"],
        ]),
      });
      return existing.id;
    });
  } catch (error) {
    return actionFailure(error, ANNOUNCEMENTS_CONSTRAINT_MESSAGE);
  }
  if (!savedId) return actionError(MISSING);
  revalidateAnnouncements();
  return reload(savedId);
}

const idSchemaError = (id: string) => (isUuid(id) ? null : actionError(MISSING));

// Gỡ khỏi trang công khai, bỏ ghim. Bản nháp chưa từng đăng thì xóa hẳn (deleteAnnouncementDraft).
export async function archiveAnnouncement(id: string): Promise<ActionResult<Announcement>> {
  const viewer = await requirePermission("announcements.manage");
  const invalid = idSchemaError(id);
  if (invalid) return invalid;
  let outcome: "missing" | "draft" | "done";
  try {
    outcome = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(announcements).where(eq(announcements.id, id)).for("update");
      if (!existing) return "missing";
      if (existing.status === "draft") return "draft";
      if (existing.status === "archived") return "done";
      await tx.update(announcements).set({ status: "archived", isPinned: false }).where(eq(announcements.id, id));
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "delete",
        entityType: "announcement",
        entityId: id,
        entityLabel: existing.title,
        summary: "Gỡ thông báo khỏi trang chủ",
        changes: auditChanges([
          ["Trạng thái", ANNOUNCEMENT_STATUS[liveStatus(existing)].label, ANNOUNCEMENT_STATUS.archived.label],
          ["Ghim", existing.isPinned, false],
        ]),
      });
      return "done";
    });
  } catch (error) {
    return actionFailure(error, ANNOUNCEMENTS_CONSTRAINT_MESSAGE);
  }
  if (outcome === "missing") return actionError(MISSING);
  if (outcome === "draft") return actionError("Bản nháp chưa đăng nên không cần gỡ, xóa bản nháp nếu không dùng nữa.");
  revalidateAnnouncements();
  return reload(id);
}

export async function deleteAnnouncementDraft(id: string): Promise<ActionResult<string>> {
  const viewer = await requirePermission("announcements.manage");
  const invalid = idSchemaError(id);
  if (invalid) return invalid;
  let deleted: { title: string } | undefined;
  try {
    deleted = await db.transaction(async (tx) => {
      // Chỉ xóa được bản nháp: thông báo đã từng đăng phải gỡ để còn dấu vết.
      const [row] = await tx
        .delete(announcements)
        .where(and(eq(announcements.id, id), eq(announcements.status, "draft")))
        .returning({ title: announcements.title });
      if (!row) return undefined;
      await recordAudit(tx, { actor: auditActorOf(viewer), action: "delete", entityType: "announcement", entityId: id, entityLabel: row.title, summary: "Xóa bản nháp thông báo" });
      return row;
    });
  } catch (error) {
    return actionFailure(error, ANNOUNCEMENTS_CONSTRAINT_MESSAGE);
  }
  if (!deleted) return actionError("Chỉ xóa được bản nháp chưa đăng. Thông báo đã đăng thì dùng Gỡ.");
  revalidateAnnouncements();
  return actionOk(id);
}
