// Copy for the social / Telegram / WhatsApp link-preview card.
//
// The card is brand-first and always English: it is shared far more often than
// the page it points at is opened in a specific language, so it never falls
// back to a localized hero sentence. Both the root layout metadata (fallback
// for every route) and the public landing override read from here.

export const PUBLIC_SHARE_CARD = {
  title: "Omnica English",
  description:
    "One-to-one online lessons on Google Meet with materials and flashcards to keep practising after class.",
  imageAlt: "Omnica English — one-to-one online English lessons",
} as const;
