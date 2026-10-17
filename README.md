# KALHARA-X-MD

One WhatsApp connection. Every command is a separate file in `commands/`.
If one file has an error, only that file is skipped – the bot and all other commands keep working.

## Deploy (Koyeb / any Node 20+ host)
1. Upload everything (keep the folders), run `npm install`, start with `npm start`.
2. Open your site, enter your number with country code (94771234567), enter the code in WhatsApp.

## Optional environment variables
`PREFIX` `BOT_NAME` `OWNER_NAME` `OWNER_NUMBER` `ALIVE_IMG` `AUTO_STATUS_SEEN` `AUTO_STATUS_REACT`

## Owner commands (only your own account can use them)
- `.vv` (reply to View Once) → saved in YOUR chat. `.vv here` → sent in the current chat.
- `.save` (reply to a status) → status is sent into that person's chat. `.save me` → into your own chat.
- `.setdp` (photo + caption, or reply to a photo) → any size works. Default keeps the whole photo on a blurred background; `.setdp crop` = centre crop.
- `.getdp` → the profile photo is sent into the chat (also works with a reply, a mention, or `.getdp 9477...`).

## Menu
`.menu` → numbered list. Reply to it with **1-5** (General, Download, Education, Group, Other) or type `.menu 2`.

## Voices (mk / alive)
Best: put your mp3 files here → `assets/mk.mp3` and `assets/alive.mp3` (used first, always works).
Otherwise the bot tries the links in settings (`audio_mk`, `audio_alive`). A Jumpshare *share page* is not a direct file – if it fails, use a direct .mp3 link or the assets folder.

## Settings (images, voices, texts, ON/OFF) – all in `lib/settings.js`
Owner chat: `.settings` shows everything, `.set status_reply off`, `.set img_alive <link>`, `.set key reset`.
Keys: site_url, bot_name, owner_name, img_menu, img_alive, img_connected, audio_alive, audio_mk, status_seen, status_react, status_reply, status_emoji, status_reply_text, mk_voice, connect_msg.
(The future website settings page will read/write this same module.)

## Add a new command
Create `commands/mything.js`:
```js
module.exports = [{
  name: 'hello', alias: ['hi'], category: 'other', icon: '👋',
  desc: 'Say hello', usage: '.hello',
  run: async (ctx) => { await ctx.reply('Hello ' + ctx.pushName); }
}];
```
It appears in `.menu` automatically. Flags: `owner:true`, `groupOnly:true`, `admin:true`, `botAdmin:true`.

## Good to know
- YouTube / Instagram sometimes block cloud servers. Fix: export your browser cookies to `cookies.txt` (Netscape format) in the project root.
- `auth_info/` and `data/` are erased when a free host restarts. Use a persistent volume if you want to stay linked.
- Free services used (no API keys): yt-dlp, tikwm, vxtwitter, Aptoide, Bing, lrclib, Gutendex (public-domain books), Wikipedia, wttr.in, Google TTS/Translate.
