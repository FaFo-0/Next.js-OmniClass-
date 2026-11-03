"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex";
import { Button } from "@/components/ui/button";

type StudentLocale = "en" | "ru" | "kk" | "ar";

type Copy = {
  generate: string;
  generating: string;
  hint: string;
  copyLink: string;
  copyMessage: string;
  openWhatsApp: string;
  copied: string;
  copyFailed: string;
  expires: (when: string) => string;
  message: (name: string, url: string) => string;
};

/**
 * Copy is intentionally local rather than in messages/*.json: this text is sent
 * by staff to the student over WhatsApp, in the *student's* locale, not the
 * viewer's UI locale. `messages/` is per-viewer, so a catalogue lookup would
 * always produce the staff member's language instead of the student's.
 */
const COPY: Record<StudentLocale, Copy> = {
  en: {
    generate: "Create connection link",
    generating: "Creating link…",
    hint: "Send this link to the student on WhatsApp. It works once and expires in 24 hours.",
    copyLink: "Copy link",
    copyMessage: "Copy message",
    openWhatsApp: "Open in WhatsApp",
    copied: "Copied",
    copyFailed: "Could not copy",
    expires: (when) => `Expires ${when}.`,
    message: (name, url) =>
      `Hi ${name}! Please connect our Telegram bot so you get lesson reminders and homework alerts: ${url}\n\nThe link works once and expires in 24 hours.`,
  },
  ru: {
    generate: "Создать ссылку для подключения",
    generating: "Создаём ссылку…",
    hint: "Отправьте эту ссылку студенту в WhatsApp. Она одноразовая и действует 24 часа.",
    copyLink: "Копировать ссылку",
    copyMessage: "Копировать сообщение",
    openWhatsApp: "Открыть в WhatsApp",
    copied: "Скопировано",
    copyFailed: "Не удалось скопировать",
    expires: (when) => `Действует до ${when}.`,
    message: (name, url) =>
      `Здравствуйте, ${name}! Подключите нашего Telegram-бота, чтобы получать напоминания об уроках и домашних заданиях: ${url}\n\nСсылка одноразовая и действует 24 часа.`,
  },
  kk: {
    generate: "Қосылу сілтемесін жасау",
    generating: "Сілтеме жасалуда…",
    hint: "Бұл сілтемені студентке WhatsApp арқылы жіберіңіз. Ол бір рет қолданылады және 24 сағатқа жарамды.",
    copyLink: "Сілтемені көшіру",
    copyMessage: "Хабарламаны көшіру",
    openWhatsApp: "WhatsApp-та ашу",
    copied: "Көшірілді",
    copyFailed: "Көшіру мүмкін болмады",
    expires: (when) => `Мерзімі ${when} дейін.`,
    message: (name, url) =>
      `Сәлеметсіз бе, ${name}! Сабақ еске салғыштары мен үй тапсырмасы туралы хабарландыруларды алу үшін Telegram ботымызды қосыңыз: ${url}\n\nСілтеме бір рет қолданылады және 24 сағатқа жарамды.`,
  },
  ar: {
    generate: "إنشاء رابط الربط",
    generating: "جارٍ إنشاء الرابط…",
    hint: "أرسل هذا الرابط للطالب عبر واتساب. يُستخدم مرة واحدة وتنتهي صلاحيته خلال 24 ساعة.",
    copyLink: "نسخ الرابط",
    copyMessage: "نسخ الرسالة",
    openWhatsApp: "فتح في واتساب",
    copied: "تم النسخ",
    copyFailed: "تعذّر النسخ",
    expires: (when) => `صالح حتى ${when}.`,
    message: (name, url) =>
      `مرحباً ${name}! يرجى ربط بوت Telegram الخاص بنا لتصلك تذكيرات الدروس وتنبيهات الواجبات: ${url}\n\nالرابط يُستخدم مرة واحدة وتنتهي صلاحيته خلال 24 ساعة.`,
  },
};

function resolveCopy(locale: string): Copy {
  return COPY[(locale as StudentLocale) in COPY ? (locale as StudentLocale) : "en"];
}

/** Strip formatting for wa.me; a leading 8 on an 11-digit KZ/RU number is a local trunk prefix. */
function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

export function TelegramInviteLink({
  studentId,
  studentName,
  studentPhone,
  locale,
}: {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  locale: string;
}) {
  const createLink = useMutation(api.telegram.createLinkForStudent);
  const [generating, setGenerating] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const copy = resolveCopy(locale);

  const expiry = link && Number.isFinite(Date.parse(link.expiresAt))
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Almaty",
      }).format(new Date(link.expiresAt))
    : null;

  const message = link ? copy.message(studentName, link.url) : "";
  const waNumber = studentPhone ? whatsappNumber(studentPhone) : "";

  async function generate() {
    setGenerating(true);
    try {
      setLink(await createLink({ studentId }));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(value: string, ok: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(ok);
    } catch {
      toast.error(copy.copyFailed);
    }
  }

  if (!link) {
    return (
      <div>
        <Button size="sm" onClick={generate} disabled={generating}>
          {generating ? copy.generating : copy.generate}
        </Button>
        <p className="body-sm mt-2">{copy.hint}</p>
      </div>
    );
  }

  return (
    <div>
      <label className="body-sm" htmlFor={`telegram-link-${studentId}`}>
        {copy.hint}
      </label>
      <input
        id={`telegram-link-${studentId}`}
        className="card mt-1 w-full px-3 py-2 text-sm"
        readOnly
        value={link.url}
        onFocus={(event) => event.currentTarget.select()}
      />
      {expiry && <p className="body-sm mt-1">{copy.expires(expiry)}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => copyText(link.url, copy.copied)}>
          {copy.copyLink}
        </Button>
        <Button size="sm" variant="outline" onClick={() => copyText(message, copy.copied)}>
          {copy.copyMessage}
        </Button>
        {waNumber && (
          <a
            className="btn"
            href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
          >
            {copy.openWhatsApp}
          </a>
        )}
        <Button size="sm" variant="ghost" onClick={generate} disabled={generating}>
          {generating ? copy.generating : copy.generate}
        </Button>
      </div>
    </div>
  );
}
