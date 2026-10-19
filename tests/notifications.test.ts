import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseInput } from "@/shared/libs/action.lib";
import { NOTIFICATION_READ_SCHEMA } from "@/modules/notifications/notifications.rule";

const ID = "0192f3a4-0000-7000-8000-000000000001";

describe("notifications: kiểm dữ liệu đánh dấu đã đọc", () => {
  test("bỏ id trùng", () => {
    const parsed = parseInput(NOTIFICATION_READ_SCHEMA, { ids: [ID, ID] });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.ids, [ID]);
  });

  test("id không phải uuid hoặc danh sách rỗng bị chặn", () => {
    const invalid = parseInput(NOTIFICATION_READ_SCHEMA, { ids: ["nt-a01"] });
    assert.ok(!invalid.ok && invalid.fieldErrors?.["ids.0"]);
    const empty = parseInput(NOTIFICATION_READ_SCHEMA, { ids: [] });
    assert.ok(!empty.ok && empty.fieldErrors?.ids);
  });
});
