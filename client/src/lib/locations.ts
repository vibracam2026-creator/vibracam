export type CountryLocation = { country: string; currency: string; timeZone: string; cities: string[] };

export const countryLocations: CountryLocation[] = [
  { country: "السعودية", currency: "SAR", timeZone: "Asia/Riyadh", cities: ["الرياض", "جدة", "مكة", "المدينة المنورة", "الدمام", "الخبر", "الطائف", "تبوك"] },
  { country: "الإمارات", currency: "AED", timeZone: "Asia/Dubai", cities: ["دبي", "أبوظبي", "الشارقة", "العين", "عجمان", "رأس الخيمة"] },
  { country: "مصر", currency: "EGP", timeZone: "Africa/Cairo", cities: ["القاهرة", "الإسكندرية", "الجيزة", "المنصورة", "الأقصر", "أسوان"] },
  { country: "الكويت", currency: "KWD", timeZone: "Asia/Kuwait", cities: ["مدينة الكويت", "حولي", "الفروانية", "السالمية", "الجهراء"] },
  { country: "قطر", currency: "QAR", timeZone: "Asia/Qatar", cities: ["الدوحة", "الريان", "الوكرة", "الخور", "لوسيل"] },
  { country: "البحرين", currency: "BHD", timeZone: "Asia/Bahrain", cities: ["المنامة", "المحرق", "الرفاع", "مدينة حمد"] },
  { country: "عُمان", currency: "OMR", timeZone: "Asia/Muscat", cities: ["مسقط", "صلالة", "صحار", "نزوى", "صور"] },
  { country: "الأردن", currency: "JOD", timeZone: "Asia/Amman", cities: ["عمّان", "إربد", "الزرقاء", "العقبة", "السلط"] },
  { country: "المغرب", currency: "MAD", timeZone: "Africa/Casablanca", cities: ["الدار البيضاء", "الرباط", "مراكش", "طنجة", "فاس", "أغادير"] },
  { country: "الجزائر", currency: "DZD", timeZone: "Africa/Algiers", cities: ["الجزائر", "وهران", "قسنطينة", "عنابة", "البليدة"] },
  { country: "تونس", currency: "TND", timeZone: "Africa/Tunis", cities: ["تونس", "صفاقس", "سوسة", "القيروان", "بنزرت"] },
  { country: "لبنان", currency: "LBP", timeZone: "Asia/Beirut", cities: ["بيروت", "طرابلس", "صيدا", "صور", "زحلة"] },
  { country: "العراق", currency: "IQD", timeZone: "Asia/Baghdad", cities: ["بغداد", "البصرة", "أربيل", "الموصل", "النجف"] },
  { country: "فلسطين", currency: "ILS", timeZone: "Asia/Gaza", cities: ["القدس", "رام الله", "غزة", "نابلس", "الخليل"] },
];

export function getLocation(country: string) {
  return countryLocations.find(location => location.country === country);
}
