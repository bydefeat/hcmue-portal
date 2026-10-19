import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseCsv, toCsv } from "@/shared/libs/download.lib";

describe("CSV xuất ra", () => {
  test("ô chữ bắt đầu bằng ký tự công thức được giữ là chữ, số giữ nguyên", () => {
    const csv = toCsv([["=HYPERLINK(\"http://x\")", "+1", "-2", "@SUM(A1)", "Nguyễn Văn A", -5, 7.5]]);
    assert.equal(csv, `"'=HYPERLINK(""http://x"")",'+1,'-2,'@SUM(A1),Nguyễn Văn A,-5,7.5`);
  });

  test("đọc lại được ô có dấu phẩy, ngoặc kép, xuống dòng", () => {
    const rows = [["a,b", 'c"d', "e\nf"]];
    assert.deepEqual(parseCsv(toCsv(rows)), rows);
  });
});
