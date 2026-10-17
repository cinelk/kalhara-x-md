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

## Updated messaging and voices
- `.menu` shows five categories. Reply `1`–`5` within five minutes, or use `.menu 1`–`.menu 5`. `.menu all` sends five separate sections.
- Education is reserved and says Coming soon: no education commands were included in the supplied source files.
- Send exactly `mk` (no prefix, case insensitive) for the smile reaction and voice note. Bot's own messages are ignored.
- `.alive` sends its image/card followed by its own voice note.
- Status reply: “Hey! 😊 I just viewed your status. ✨”. Only after successful status read, at most once per sender per six hours in the current process. Restart resets this limit.
- Cards include https://kalhara-x-md.vercel.app and a short bilingual connect invitation. Text replies and media captions also get the connect footer automatically; audio, reactions and protocol messages are unaffected.
- Connection card includes linked number, owner, prefix, command count and current switches. Delivery is to the linked account itself.
- `MK_AUDIO`, `ALIVE_AUDIO`: replace with public direct audio URLs. The supplied original Jumpshare URLs remain defaults. Bundled original MP3 files avoid expiring share links; ffmpeg converts and caches Opus voice notes in memory on first use.
- `VOICE_REPLY`, `ALIVE_VOICE`, `AUTO_STATUS_REPLY`, `AUTO_STATUS_SEEN`, `AUTO_STATUS_REACT`: set `false` to disable. `WEBSITE`, `STATUS_REPLY_TEXT`, `CONNECTED_IMG`, `ALIVE_IMG`, `BOT_NAME`, `OWNER_NAME`, `OWNER_NUMBER`, `PREFIX` are configurable.
- Pairing starts immediately alongside downloader setup. Group metadata uses a ten-second cache, invalidated by group changes. Voice conversion is shared across simultaneous requests and reused afterward.
- No speed guarantee: host cold starts, WhatsApp and download sources still affect latency.

## Next phase: personal website settings (requested)
Build a number + chosen-password account flow with verified number ownership, hashed passwords, authenticated per-user settings, isolated WhatsApp sessions, user-selected images/audio and individual switches. These settings must apply only to that user's bot. This release still has ONE WhatsApp session and environment-based settings; the account/settings website is not implemented yet. Keep the pairing frontend hosted on Vercel and run the persistent WhatsApp backend on a suitable Node host.

## Validation
JavaScript syntax and mocked menu/voice routing checked locally. Live WhatsApp delivery requires deploying and pairing; it was not tested here.
