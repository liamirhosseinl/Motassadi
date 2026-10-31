/**
 * CSV export: UTF-8 with BOM (so Excel opens Persian text correctly), CRLF line endings,
 * every field quoted, and cells that start with = + - @ (or tab/CR) prefixed with ' to stop formula execution.
 */
export type CsvColumn<T> = { key: keyof T & string; label: string; format?: (v: T[keyof T], row: T) => string | number | null | undefined };

function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => cell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(c.format ? c.format(r[c.key], r) : r[c.key])).join(","));
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}
