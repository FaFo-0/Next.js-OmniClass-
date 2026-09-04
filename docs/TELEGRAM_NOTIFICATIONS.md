# Telegram notifications — academy setup

OmniClass ships the optional per-member Telegram channel. The in-app bell remains
its system of record; Telegram mirrors new notifications only for members who
choose **Connect Telegram** in their Profile.

## One-time academy setup

1. In Telegram, open **@BotFather**, create a bot, and note its token and
   username (for example `omnicaclass_bot`, without the leading `@`).
2. Generate a long random webhook secret. On macOS:

   ```bash
   openssl rand -hex 32
   ```

3. Set these **Convex production** environment values (never Vercel/browser
   values — the bot token must remain server-side):

   ```bash
   npx convex env set TELEGRAM_BOT_TOKEN '<token from BotFather>'
   npx convex env set TELEGRAM_BOT_USERNAME 'omnicaclass_bot'
   npx convex env set TELEGRAM_WEBHOOK_SECRET '<random secret from step 2>'
   npx convex env set APP_URL 'https://next-js-omni-class.vercel.app'
   ```

   `APP_URL` is used only for the secure button URLs in Telegram messages.

4. Register the Convex HTTP webhook. Replace the token and secret values; do
   not paste either into a shell history you share:

   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     --data-urlencode "url=https://valuable-loris-929.convex.site/telegram/webhook" \
     --data-urlencode "secret_token=<WEBHOOK_SECRET>" \
     --data-urlencode "allowed_updates=[\"message\"]"
   ```

5. Verify Telegram returns `{"ok":true,...}`, then use the bot link generated
   from an OmniClass profile. `/start CODE` should reply that notifications are
   connected. Send `/stop` to verify disconnecting.

## Member behavior and privacy

- A profile creates a **single-use code that expires after 24 hours**. The bot
  only accepts the code in a private chat.
- Desktop users can open the bot hand-off page and press **Start**, or paste the
  displayed `/start CODE` command into the bot manually.
- One Telegram chat belongs to one OmniClass identity. Connecting it to another
  account unlinks the old account instead of mixing private notifications.
- Members can disconnect from Profile or send `/stop` to the bot. A new link
  replaces an old chat, which covers lost devices and mistaken connections.
- Telegram never matches accounts by phone number, and users do not receive
  notifications from before the moment they connected.

## Delivery behavior

The cron checks new notification rows once per minute. Messages include the
meeting URL when a lesson reminder has one, and an **Open OmniClass** button
that routes to the underlying lesson, homework, calendar, billing or other
relevant page. If Telegram is blocked or temporarily unavailable, the in-app
bell retains the notification and the delivery failure is logged without
blocking other members.
