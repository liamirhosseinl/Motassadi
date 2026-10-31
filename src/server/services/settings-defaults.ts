/** Default business settings, derived only from the verified business information. */
export const DEFAULT_SETTINGS = {
  business: {
    name: "املاک متصدی",
    ownerName: "جناب آقای فرج‌الله متصدی زرندی",
    address: "زرند، خیابان هفده شهریور، جنب فرمانداری",
    phone: "09136189808",
    whatsapp: "09136189808",
    city: "زرند",
    province: "کرمان",
  },
  site: {
    tagline: "معاملهٔ روشن، خانهٔ امن",
    description: "خرید، فروش و اجارهٔ خانه، آپارتمان، زمین، باغ و ویلا در زرند. هر ملک با اطلاعات کامل معرفی می‌شود.",
  },
  social: { instagram: "", telegram: "" },
  currency: { display: "toman" as "toman" | "rial" },
  numbers: { persianDigits: true },
  refs: { propertyPrefix: "M", transactionPrefix: "T" },
  publishing: { requireImage: true, requireDescription: true },
  commission: { defaultRatePercent: null as number | null },
  privacy: {
    inquiryNotice: "نام و شمارهٔ تماس شما فقط برای پاسخ به همین درخواست استفاده می‌شود و در اختیار دیگران قرار نمی‌گیرد.",
  },
};

export type SettingsMap = typeof DEFAULT_SETTINGS;
export type SettingsKey = keyof SettingsMap;
