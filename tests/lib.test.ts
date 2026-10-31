import { describe, expect, it } from "vitest";
import { toGregorian, toJalali } from "@/lib/jalali";
import { formatMoney, formatMoneyShort, normalizePhone, parseJalaliDate, parseMoney, faDigits, formatDate } from "@/lib/format";
import { toCsv } from "@/lib/csv";
import { computeExpectedCommission } from "@/server/services/deals";

describe("jalali calendar", () => {
  it("converts known dates both ways", () => {
    expect(toJalali(2026, 10, 31)).toEqual({ jy: 1405, jm: 8, jd: 9 });
    expect(toJalali(2025, 3, 21)).toEqual({ jy: 1404, jm: 1, jd: 1 });
    expect(toGregorian(1403, 12, 30)).toEqual({ gy: 2025, gm: 3, gd: 20 }); // 1403 is leap
  });
  it("rejects invalid jalali input", () => {
    expect(parseJalaliDate("1404/12/30")).toBeUndefined(); // 1404 not leap
    expect(parseJalaliDate("۱۴۰۵/۸/۹")).toBe("2026-10-31");
    expect(parseJalaliDate("")).toBeNull();
  });
  it("renders timestamps in Tehran time", () => {
    expect(formatDate(new Date("2026-10-30T21:00:00Z"))).toBe("۱۴۰۵/۰۸/۰۹"); // 00:30 Tehran next day
  });
});

describe("money", () => {
  it("parses Persian and Latin digits with separators", () => {
    expect(parseMoney("۴٬۸۵۰٬۰۰۰")).toBe(4850000);
    expect(parseMoney("1,200")).toBe(1200);
    expect(parseMoney("")).toBeNull();
    expect(Number.isNaN(parseMoney("12a"))).toBe(true);
    expect(Number.isNaN(parseMoney("-5"))).toBe(true);
  });
  it("labels the unit and converts toman to rial explicitly", () => {
    expect(formatMoney(1500)).toBe("۱٬۵۰۰ تومان");
    expect(formatMoney(1500, "rial")).toBe("۱۵٬۰۰۰ ریال");
    expect(formatMoneyShort(4_850_000_000)).toBe("۴٫۸۵ میلیارد تومان");
    expect(formatMoneyShort(4_850_000_000, "rial")).toBe("۴۸٫۵ میلیارد ریال");
    expect(formatMoneyShort(8_000_000, "rial")).toBe("۸۰ میلیون ریال");
  });
  it("computes commission only from explicit inputs", () => {
    expect(computeExpectedCommission("percent", 250, null, 1_000_000_000)).toBe(25_000_000);
    expect(computeExpectedCommission("percent", null, null, 1_000_000_000)).toBe(0);
    expect(computeExpectedCommission("fixed", null, 12_000_000, 5)).toBe(12_000_000);
  });
});

describe("phone", () => {
  it("normalises Iranian numbers", () => {
    expect(normalizePhone("+98 913 618 9808")).toBe("09136189808");
    expect(normalizePhone("۰۹۱۳۶۱۸۹۸۰۸")).toBe("09136189808");
    expect(normalizePhone("9136189808")).toBe("09136189808");
    expect(normalizePhone("0913618908")).toBeNull();
  });
  it("renders Persian digits", () => expect(faDigits("0913")).toBe("۰۹۱۳"));
});

describe("csv", () => {
  it("adds BOM, quotes, and neutralises spreadsheet formulas", () => {
    const out = toCsv([{ a: "=SUM(A1)", b: 'x,"y"', c: 5 }], [{ key: "a", label: "الف" }, { key: "b", label: "ب" }, { key: "c", label: "ج" }]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain(`"'=SUM(A1)"`);
    expect(out).toContain(`"x,""y"""`);
  });
});
