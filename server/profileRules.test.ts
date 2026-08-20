import { describe, expect, it } from "vitest";
import { assertMinimumAge, calculateAge, MARKETPLACE_MIN_AGE, PLATFORM_MIN_AGE } from "./profileRules";

const referenceDate = new Date("2026-08-14T12:00:00.000Z");

describe("قواعد العمر للملف الشخصي", () => {
  it("يحسب العمر بدقة حول يوم الميلاد", () => {
    expect(calculateAge("2008-08-14", referenceDate)).toBe(18);
    expect(calculateAge("2008-08-15", referenceDate)).toBe(17);
    expect(calculateAge("2013-08-14", referenceDate)).toBe(13);
  });

  it("يرفض تاريخًا غير صالح بدلًا من تطبيعه تلقائيًا", () => {
    expect(calculateAge("2010-02-30", referenceDate)).toBeNaN();
    expect(calculateAge("ليست-تاريخًا", referenceDate)).toBeNaN();
  });

  it("يفرض 18 عامًا كحد أدنى للحساب والبيع", () => {
    expect(() => assertMinimumAge("2008-08-14", PLATFORM_MIN_AGE, "العمر غير مؤهل", referenceDate)).not.toThrow();
    expect(() => assertMinimumAge("2008-08-15", PLATFORM_MIN_AGE, "العمر غير مؤهل", referenceDate)).toThrow("العمر غير مؤهل");
    expect(() => assertMinimumAge("2008-08-14", MARKETPLACE_MIN_AGE, "العمر غير مؤهل", referenceDate)).not.toThrow();
    expect(() => assertMinimumAge("2008-08-15", MARKETPLACE_MIN_AGE, "العمر غير مؤهل", referenceDate)).toThrow("العمر غير مؤهل");
  });
});
