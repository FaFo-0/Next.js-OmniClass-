export interface Country {
  code: string;
  name: string;
  nameRu: string;
  nameAr: string;
  dialCode: string;
  flag: string;
  priority?: boolean; // shown at top of list
}

// Priority countries (Central Asia + Russia) at top, then rest alphabetically
export const countries: Country[] = [
  // ── Priority: Central Asia + Russia ──
  { code: "RU", name: "Russia", nameRu: "Россия", nameAr: "روسيا", dialCode: "+7", flag: "🇷🇺", priority: true },
  { code: "KZ", name: "Kazakhstan", nameRu: "Казахстан", nameAr: "كازاخستان", dialCode: "+7", flag: "🇰🇿", priority: true },
  { code: "KG", name: "Kyrgyzstan", nameRu: "Кыргызстан", nameAr: "قيرغيزستان", dialCode: "+996", flag: "🇰🇬", priority: true },
  { code: "UZ", name: "Uzbekistan", nameRu: "Узбекистан", nameAr: "أوزبكستان", dialCode: "+998", flag: "🇺🇿", priority: true },
  { code: "TJ", name: "Tajikistan", nameRu: "Таджикистан", nameAr: "طاجيكستان", dialCode: "+992", flag: "🇹🇯", priority: true },
  // ── Other countries ──
  { code: "SA", name: "Saudi Arabia", nameRu: "Саудовская Аравия", nameAr: "المملكة العربية السعودية", dialCode: "+966", flag: "🇸🇦" },
  { code: "AE", name: "United Arab Emirates", nameRu: "ОАЭ", nameAr: "الإمارات العربية المتحدة", dialCode: "+971", flag: "🇦🇪" },
  { code: "EG", name: "Egypt", nameRu: "Египет", nameAr: "مصر", dialCode: "+20", flag: "🇪🇬" },
  { code: "TR", name: "Turkey", nameRu: "Турция", nameAr: "تركيا", dialCode: "+90", flag: "🇹🇷" },
  { code: "UA", name: "Ukraine", nameRu: "Украина", nameAr: "أوكرانيا", dialCode: "+380", flag: "🇺🇦" },
  { code: "BY", name: "Belarus", nameRu: "Беларусь", nameAr: "بيلاروسيا", dialCode: "+375", flag: "🇧🇾" },
  { code: "US", name: "United States", nameRu: "США", nameAr: "الولايات المتحدة", dialCode: "+1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", nameRu: "Великобритания", nameAr: "المملكة المتحدة", dialCode: "+44", flag: "🇬🇧" },
  { code: "DE", name: "Germany", nameRu: "Германия", nameAr: "ألمانيا", dialCode: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", nameRu: "Франция", nameAr: "فرنسا", dialCode: "+33", flag: "🇫🇷" },
  { code: "KW", name: "Kuwait", nameRu: "Кувейт", nameAr: "الكويت", dialCode: "+965", flag: "🇰🇼" },
  { code: "QA", name: "Qatar", nameRu: "Катар", nameAr: "قطر", dialCode: "+974", flag: "🇶🇦" },
  { code: "BH", name: "Bahrain", nameRu: "Бахрейн", nameAr: "البحرين", dialCode: "+973", flag: "🇧🇭" },
  { code: "OM", name: "Oman", nameRu: "Оман", nameAr: "عمان", dialCode: "+968", flag: "🇴🇲" },
  { code: "JO", name: "Jordan", nameRu: "Иордания", nameAr: "الأردن", dialCode: "+962", flag: "🇯🇴" },
  { code: "LB", name: "Lebanon", nameRu: "Ливан", nameAr: "لبنان", dialCode: "+961", flag: "🇱🇧" },
  { code: "IQ", name: "Iraq", nameRu: "Ирак", nameAr: "العراق", dialCode: "+964", flag: "🇮🇶" },
  { code: "MA", name: "Morocco", nameRu: "Марокко", nameAr: "المغرب", dialCode: "+212", flag: "🇲🇦" },
  { code: "TN", name: "Tunisia", nameRu: "Тунис", nameAr: "تونس", dialCode: "+216", flag: "🇹🇳" },
  { code: "DZ", name: "Algeria", nameRu: "Алжир", nameAr: "الجزائر", dialCode: "+213", flag: "🇩🇿" },
  { code: "PK", name: "Pakistan", nameRu: "Пакистан", nameAr: "باكستان", dialCode: "+92", flag: "🇵🇰" },
  { code: "IN", name: "India", nameRu: "Индия", nameAr: "الهند", dialCode: "+91", flag: "🇮🇳" },
  { code: "MY", name: "Malaysia", nameRu: "Малайзия", nameAr: "ماليزيا", dialCode: "+60", flag: "🇲🇾" },
  { code: "ID", name: "Indonesia", nameRu: "Индонезия", nameAr: "إندونيسيا", dialCode: "+62", flag: "🇮🇩" },
  { code: "BR", name: "Brazil", nameRu: "Бразилия", nameAr: "البرازيل", dialCode: "+55", flag: "🇧🇷" },
  { code: "CA", name: "Canada", nameRu: "Канада", nameAr: "كندا", dialCode: "+1", flag: "🇨🇦" },
  { code: "AU", name: "Australia", nameRu: "Австралия", nameAr: "أستراليا", dialCode: "+61", flag: "🇦🇺" },
];

export const priorityCountries = countries.filter((c) => c.priority);
export const otherCountries = countries.filter((c) => !c.priority);
