// Chuẩn hoá chuỗi để lọc tại chỗ: bỏ dấu tiếng Việt, đ → d, chữ thường, bỏ dấu chấm để "50.01.104.013" và "5001104013" khớp nhau.
export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/\./g, "").toLowerCase();
}
