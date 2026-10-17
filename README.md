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
