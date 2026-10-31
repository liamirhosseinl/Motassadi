/** Shared vocabularies (safe for client and server). */
export const DEAL_TYPES = { sale: "فروش", rent: "اجاره", mortgage: "رهن کامل", exchange: "معاوضه" } as const;
export const PROPERTY_STATUSES = {
  draft: "پیش‌نویس", pending_review: "در انتظار بررسی", published: "منتشرشده", reserved: "رزروشده",
  sold: "فروخته‌شد", rented: "اجاره‌رفت", unpublished: "متوقف‌شده", archived: "بایگانی",
} as const;
export const INQUIRY_STATUSES = {
  new: "جدید", contacted: "تماس گرفته شد", follow_up: "نیاز به پیگیری", visit_scheduled: "بازدید تعیین شد",
  negotiation: "در حال مذاکره", converted: "به معامله رسید", closed: "بسته شد", not_interested: "منصرف شد",
} as const;
export const INQUIRY_SOURCES = {
  website_property: "سایت — صفحهٔ ملک", website_contact: "سایت — فرم تماس", phone: "تماس تلفنی", walk_in: "مراجعهٔ حضوری",
  instagram: "اینستاگرام", whatsapp: "واتساپ", referral: "معرفی", other: "سایر",
} as const;
export const CONTACT_TYPES = {
  owner: "مالک", buyer: "خریدار", tenant: "مستأجر", seller: "فروشنده", landlord: "موجر", prospect: "مشتری بالقوه", other: "سایر",
} as const;
export const CONTACT_METHODS = { phone: "تلفن", whatsapp: "واتساپ", sms: "پیامک", in_person: "حضوری" } as const;
export const CONTACT_STATUSES = { active: "فعال", inactive: "غیرفعال", archived: "بایگانی" } as const;
export const TX_KINDS = { sale: "فروش", rent: "اجاره / رهن", other: "سایر" } as const;
export const TX_STATUSES = { draft: "پیش‌نویس", pending: "در جریان", completed: "تکمیل‌شده", cancelled: "لغوشده" } as const;
export const PARTY_ROLES = { buyer: "خریدار", seller: "فروشنده", tenant: "مستأجر", landlord: "موجر", other: "سایر" } as const;
export const PAYMENT_STATES = { none: "بدون کمیسیون", unpaid: "دریافت‌نشده", partial: "دریافت ناقص", paid: "تسویه" } as const;
export const PAYMENT_METHODS = { cash: "نقد", card: "کارت‌به‌کارت", transfer: "حوالهٔ بانکی", pos: "کارتخوان", cheque: "چک", other: "سایر" } as const;
export type DealType = keyof typeof DEAL_TYPES;
export type PropertyStatus = keyof typeof PROPERTY_STATUSES;
