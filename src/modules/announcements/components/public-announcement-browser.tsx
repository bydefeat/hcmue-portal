"use client";

import { useState } from "react";
import { Input, Segmented } from "antd";
import { Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { ANNOUNCEMENT_CATEGORY_LABEL } from "@/modules/announcements/announcements.constant";
import type { Announcement, AnnouncementCategory } from "@/modules/announcements/announcements.type";
import { PublicAnnouncementItem } from "@/modules/announcements/components/public-announcement-item";
import { normalizeSearch } from "@/shared/libs/search.lib";

type Filter = AnnouncementCategory | "all";

export function PublicAnnouncementBrowser({ announcements, basePath }: { announcements: Announcement[]; basePath?: string }) {
  const [category, setCategory] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const categories = [...new Set(announcements.map((announcement) => announcement.category))];
  const needle = normalizeSearch(query.trim());
  const visible = announcements.filter(
    (announcement) =>
      (category === "all" || announcement.category === category) &&
      (!needle || normalizeSearch(`${announcement.title} ${announcement.summary}`).includes(needle)),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="max-w-full overflow-x-auto">
          <Segmented<Filter>
            value={category}
            onChange={setCategory}
            options={[
              { value: "all", label: "Tất cả" },
              ...categories.map((value) => ({ value, label: ANNOUNCEMENT_CATEGORY_LABEL[value] })),
            ]}
          />
        </div>
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Tìm theo tiêu đề"
          aria-label="Tìm thông báo"
          className="w-full md:w-72"
        />
      </div>
      <SectionCard flush>
        {visible.length === 0 ? (
          <EmptyState
            title="Không có thông báo phù hợp"
            description={announcements.length === 0 ? "Phòng Đào tạo chưa đăng thông báo nào." : "Thử chọn nhóm khác hoặc bỏ từ khóa tìm kiếm."}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-strong">
            {visible.map((announcement) => (
              <li key={announcement.id}>
                <PublicAnnouncementItem announcement={announcement} basePath={basePath} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
