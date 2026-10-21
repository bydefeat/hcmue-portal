import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

const original = process.env.TZ;
after(() => {
  process.env.TZ = original;
});

describe("ngày giờ theo giờ Việt Nam bất kể múi giờ của máy", () => {
  for (const zone of ["America/New_York", "Asia/Tokyo", "UTC", "Asia/Ho_Chi_Minh"]) {
    test(zone, async () => {
      process.env.TZ = zone;
      const { formatDate, formatDateTime, formatShortDate, schoolTime, weekdayOf } = await import("@/shared/libs/date.lib");
      assert.equal(formatDate("2026-10-28"), "28/10/2026");
      assert.equal(formatShortDate("2026-10-28"), "28/10");
      assert.equal(formatDateTime("2026-10-20T17:00:00Z"), "00:00, 21/10/2026");
      assert.equal(formatDateTime("2026-10-20T08:30:00+07:00"), "08:30, 20/10/2026");
      assert.equal(formatDateTime(new Date("2026-10-20T01:00:00Z")), "08:00, 20/10/2026");
      assert.equal(schoolTime("2000-01-01T07:30").add(90, "minute").format("HH:mm"), "09:00");
      assert.equal(weekdayOf("2026-10-19"), 2);
    });
  }
});
