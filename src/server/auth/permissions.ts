/** Permission catalogue and default role grants. Grants are stored in `role_permissions` and editable by the owner. */

export const PERMISSIONS = {
  "dashboard.view": "مشاهدهٔ داشبورد",
  "properties.view": "مشاهدهٔ املاک",
  "properties.viewAll": "مشاهدهٔ همهٔ املاک (نه فقط املاک واگذارشده)",
  "properties.edit": "ثبت و ویرایش ملک",
  "properties.publish": "انتشار، توقف انتشار و ویژه‌کردن آگهی",
  "properties.archive": "بایگانی ملک و عملیات گروهی",
  "inquiries.view": "مشاهدهٔ درخواست‌ها",
  "inquiries.manage": "پیگیری و واگذاری درخواست‌ها",
  "contacts.view": "مشاهدهٔ مخاطبان",
  "contacts.manage": "ثبت و ویرایش مخاطبان",
  "followups.manage": "مدیریت پیگیری‌ها و قرارها",
  "transactions.view": "مشاهدهٔ معاملات",
  "transactions.manage": "ثبت و ویرایش معاملات",
  "finance.view": "مشاهدهٔ دریافت‌ها و هزینه‌ها",
  "finance.manage": "ثبت دریافت و هزینه",
  "finance.void": "ابطال ثبت مالی",
  "reports.view": "گزارش‌های عملیاتی",
  "reports.finance": "گزارش‌های مالی",
  "export.data": "خروجی CSV",
  "content.manage": "مدیریت صفحات و سئو",
  "settings.manage": "تنظیمات کسب‌وکار و دسته‌بندی‌ها",
  "users.manage": "کاربران و دسترسی‌ها",
  "audit.view": "مشاهدهٔ گزارش رویدادها",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLES = {
  owner: "مدیر / مالک",
  agent: "مشاور املاک",
  finance: "امور مالی",
  content: "مدیر محتوا",
} as const;
export type Role = keyof typeof ROLES;

/** Initial defaults — a starting point, not an assumption about real staff. The owner can change them in Settings › Users. */
export const DEFAULT_GRANTS: Record<Role, Permission[]> = {
  owner: ALL_PERMISSIONS,
  agent: [
    "dashboard.view", "properties.view", "properties.edit",
    "inquiries.view", "inquiries.manage", "contacts.view", "contacts.manage",
    "followups.manage", "transactions.view", "transactions.manage", "reports.view",
  ],
  finance: [
    "dashboard.view", "transactions.view", "finance.view", "finance.manage", "finance.void",
    "reports.view", "reports.finance", "export.data",
  ],
  content: [
    "dashboard.view", "properties.view", "properties.viewAll", "properties.edit", "properties.publish", "content.manage",
  ],
};

/** Permissions that must never be removed from the owner role (prevents lock-out). */
export const OWNER_LOCKED: Permission[] = ["users.manage", "settings.manage", "dashboard.view"];
