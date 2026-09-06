const MAX_TELEGRAM_ATTEMPTS = 8;

function conciseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 300);
}

function isPermanentFailure(message: string): boolean {
  return /\b(?:400|403|404)\b/.test(message) || /blocked|chat not found|forbidden/i.test(message);
}

/** State persisted for each unsuccessful Telegram outbox attempt. */
export function telegramFailureState(error: unknown, priorAttempts: number, now: string) {
  const telegramAttemptCount = priorAttempts + 1;
  const telegramLastError = conciseError(error);
  const permanent = isPermanentFailure(telegramLastError);
  return {
    telegramAttemptCount,
    telegramLastAttemptAt: now,
    telegramLastError,
    ...(permanent || telegramAttemptCount >= MAX_TELEGRAM_ATTEMPTS
      ? { telegramFailedAt: now }
      : {}),
  };
}
