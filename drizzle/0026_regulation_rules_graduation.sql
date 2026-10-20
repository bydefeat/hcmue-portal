-- Quy chế là nguồn duy nhất của ngưỡng: bổ sung tham số mới vào các bản quy chế đã lưu (giá trị mặc định theo quy chế hiện hành),
-- bỏ "Điểm đạt học phần" (không đạt là điểm chữ F theo thang điểm). Chạy trước khi check regulations_rules_object đòi nhóm graduation.
UPDATE "regulations"
SET "rules" = jsonb_set(
  jsonb_set(
    jsonb_set("rules" #- '{grading,passScore}', '{grading,standing}', coalesce("rules" -> 'grading' -> 'standing', '{"excellent": 3.6, "veryGood": 3.2, "good": 2.5, "average": 2, "weak": 1}'::jsonb)),
    '{warning,expelAfterWarnings}',
    coalesce("rules" -> 'warning' -> 'expelAfterWarnings', '2'::jsonb)
  ),
  '{graduation}',
  coalesce(
    "rules" -> 'graduation',
    '{"retakeLimitPercent": 5, "downgradeDisciplineLevel": "warning", "downgradeStandings": ["excellent", "very-good"], "languageMinLevel": "B1", "requireItCertificate": true}'::jsonb
  )
);
