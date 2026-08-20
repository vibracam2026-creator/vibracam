export type EmojiCategory = "frequent" | "faces" | "gestures" | "symbols" | "creative";
export type EmojiEntry = { emoji: string; terms: string[] };

export const emojiCategories: { id: EmojiCategory; label: string; items: EmojiEntry[] }[] = [
  { id: "frequent", label: "السريعة", items: [{ emoji: "😀", terms: ["سعادة", "ابتسامة"] }, { emoji: "😂", terms: ["ضحك", "فرح"] }, { emoji: "🥰", terms: ["حب", "قلوب"] }, { emoji: "😍", terms: ["حب", "إعجاب"] }, { emoji: "🔥", terms: ["نار", "رائع"] }, { emoji: "❤️", terms: ["قلب", "حب"] }, { emoji: "👍", terms: ["موافق", "إعجاب"] }, { emoji: "👏", terms: ["تصفيق", "برافو"] }] },
  { id: "faces", label: "الوجوه", items: [{ emoji: "🤩", terms: ["انبهار", "نجمة"] }, { emoji: "😎", terms: ["رائع", "نظارة"] }, { emoji: "😉", terms: ["غمزة"] }, { emoji: "😮", terms: ["دهشة"] }, { emoji: "😢", terms: ["حزن", "بكاء"] }, { emoji: "😡", terms: ["غضب"] }, { emoji: "🤔", terms: ["تفكير", "سؤال"] }, { emoji: "😴", terms: ["نوم", "تعب"] }] },
  { id: "gestures", label: "الإشارات", items: [{ emoji: "🙌", terms: ["احتفال", "رفع"] }, { emoji: "👋", terms: ["مرحبا", "وداع"] }, { emoji: "🤝", terms: ["اتفاق", "مصافحة"] }, { emoji: "🙏", terms: ["شكر", "دعاء"] }, { emoji: "💡", terms: ["فكرة"] }, { emoji: "✅", terms: ["تم", "صح"] }, { emoji: "💜", terms: ["قلب", "بنفسجي"] }] },
  { id: "symbols", label: "الرموز", items: [{ emoji: "🎉", terms: ["احتفال", "تهنئة"] }, { emoji: "✨", terms: ["لمعان", "سحر"] }, { emoji: "🌟", terms: ["نجمة"] }, { emoji: "🚀", terms: ["إطلاق", "سرعة"] }, { emoji: "☕", terms: ["قهوة"] }, { emoji: "🌷", terms: ["ورد", "زهور"] }] },
  { id: "creative", label: "الإبداع", items: [{ emoji: "🎬", terms: ["فيلم", "ريلز"] }, { emoji: "📸", terms: ["كاميرا", "صورة"] }, { emoji: "🎵", terms: ["موسيقى", "أغنية"] }] },
];

export const quickEmojis = emojiCategories.flatMap(category => category.items.map(item => item.emoji));

export function searchEmojis(query: string, category: EmojiCategory | "all" = "all") {
  const term = query.trim().toLowerCase();
  return emojiCategories
    .filter(group => category === "all" || group.id === category)
    .flatMap(group => group.items)
    .filter(item => !term || item.emoji.includes(term) || item.terms.some(keyword => keyword.includes(term)));
}

export function appendEmojiToDraft(draft: string, emoji: string) {
  return `${draft}${emoji}`;
}
