'use strict';
const C = require('../lib/config');
const U = require('../lib/utils');

// ffmpeg is needed only for video stickers
try { process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || require('ffmpeg-static'); } catch (_) {}

const P = C.PREFIX;
const O = (o) => ({ category: 'other', ...o });
const textArg = (ctx) => ctx.q || (ctx.quoted ? U.textOf(ctx.quoted.message) : '');

module.exports = [
  O({
    name: 'sticker', alias: ['s', 'stick'], icon: '🎭', desc: 'Make a sticker from a photo / short video', usage: `Send photo+${P}sticker  or reply to one`,
    run: async (ctx) => {
      const m = U.pickMedia(ctx, ['imageMessage', 'videoMessage']);
      if (!m) return ctx.reply(`📷 Send a photo/video with the caption ${P}sticker, or reply to one.`);
      if (m.info.type === 'videoMessage' && (m.info.node.seconds || 0) > 10) return ctx.reply('⏱️ Video must be 10 seconds or shorter.');
      await ctx.react('⏳');
      const { Sticker, StickerTypes } = require('wa-sticker-formatter');
      const buf = await U.downloadMsg(ctx.sock, m.key, m.message);
      const out = await new Sticker(buf, { pack: C.BOT_NAME, author: C.OWNER_NAME, type: StickerTypes.FULL, quality: 60 }).toBuffer();
      await ctx.sock.sendMessage(ctx.jid, { sticker: out }, { quoted: ctx.msg });
      await ctx.react('✅');
    }
  }),
  O({
    name: 'toimg', alias: ['toimage'], icon: '🖼️', desc: 'Convert a sticker to an image', usage: `Reply to a sticker with ${P}toimg`,
    run: async (ctx) => {
      const m = U.pickMedia(ctx, ['stickerMessage']);
      if (!m) return ctx.reply(`↩️ Reply to a sticker with ${P}toimg`);
      const png = await require('sharp')(await U.downloadMsg(ctx.sock, m.key, m.message)).png().toBuffer();
      await ctx.sock.sendMessage(ctx.jid, { image: png, caption: '🖼️ Done' }, { quoted: ctx.msg });
    }
  }),
  O({
    name: 'tts', alias: ['say'], icon: '🗣️', desc: 'Text to speech (Sinhala, English and more)', usage: `${P}tts si ආයුබෝවන්  |  ${P}tts en Hello`,
    run: async (ctx) => {
      let lang = 'en';
      let text = textArg(ctx);
      if (ctx.args.length > 1 && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(ctx.args[0])) { lang = ctx.args[0]; text = ctx.args.slice(1).join(' '); }
      if (!text) return ctx.reply(`Usage: ${P}tts si ආයුබෝවන්`);
      const url = require('google-tts-api').getAudioUrl(text.slice(0, 200), { lang, slow: false, host: 'https://translate.google.com' });
      await ctx.sock.sendMessage(ctx.jid, { audio: await U.getBuffer(url), mimetype: 'audio/mpeg' }, { quoted: ctx.msg });
    }
  }),
  O({
    name: 'tr', alias: ['translate'], icon: '🌐', desc: 'Translate text to any language', usage: `${P}tr si Hello  |  ${P}tr en ආයුබෝවන්`,
    run: async (ctx) => {
      let to = 'si';
      let text = textArg(ctx);
      if (ctx.args.length > 1 && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(ctx.args[0])) { to = ctx.args[0]; text = ctx.args.slice(1).join(' '); }
      else if (ctx.args.length === 1 && /^[a-z]{2}$/.test(ctx.args[0]) && ctx.quoted) { to = ctx.args[0]; text = U.textOf(ctx.quoted.message); }
      if (!text) return ctx.reply(`Usage: ${P}tr si Hello`);
      const r = await U.getJson('https://translate.googleapis.com/translate_a/single', { client: 'gtx', sl: 'auto', tl: to, dt: 't', q: text });
      await ctx.reply(`🌐 *${to}*\n\n${(r[0] || []).map((x) => x[0]).join('')}`);
    }
  }),
  O({
    name: 'weather', icon: '🌦️', desc: 'Weather of any city', usage: `${P}weather Colombo`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}weather <city>`);
      const r = await U.getJson(`https://wttr.in/${encodeURIComponent(ctx.q)}`, { format: 'j1' });
      const c = r.current_condition[0];
      const a = r.nearest_area && r.nearest_area[0];
      await ctx.reply(`🌦️ *${a ? a.areaName[0].value + ', ' + a.country[0].value : ctx.q}*\n\n☁️ ${c.weatherDesc[0].value}\n🌡️ ${c.temp_C}°C (feels ${c.FeelsLikeC}°C)\n💧 Humidity: ${c.humidity}%\n💨 Wind: ${c.windspeedKmph} km/h`);
    }
  }),
  O({
    name: 'qr', icon: '🔳', desc: 'Make a QR code', usage: `${P}qr https://example.com`,
    run: async (ctx) => {
      const t = textArg(ctx);
      if (!t) return ctx.reply(`Usage: ${P}qr <text or link>`);
      await ctx.sock.sendMessage(ctx.jid, { image: { url: 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=' + encodeURIComponent(t) }, caption: '🔳 QR code' }, { quoted: ctx.msg });
    }
  }),
  O({
    name: 'short', alias: ['shorten'], icon: '✂️', desc: 'Shorten a link', usage: `${P}short https://long-link.com`,
    run: async (ctx) => {
      const t = textArg(ctx);
      if (!/^https?:\/\//i.test(t)) return ctx.reply(`Usage: ${P}short <link>`);
      await ctx.reply('✂️ ' + (await U.getJson('https://tinyurl.com/api-create.php', { url: t })));
    }
  }),
  O({
    name: 'ss', alias: ['screenshot'], icon: '📷', desc: 'Screenshot of a website', usage: `${P}ss https://example.com`,
    run: async (ctx) => {
      const t = textArg(ctx);
      if (!/^https?:\/\//i.test(t)) return ctx.reply(`Usage: ${P}ss <website link>`);
      await ctx.sock.sendMessage(ctx.jid, { image: { url: 'https://image.thum.io/get/width/1280/crop/800/' + t }, caption: '📷 ' + t }, { quoted: ctx.msg });
    }
  }),
  O({
    name: 'calc', alias: ['calculate'], icon: '🧮', desc: 'Calculator', usage: `${P}calc 5*8+2`,
    run: async (ctx) => {
      const e = ctx.q.replace(/\s+/g, '').replace(/\^/g, '**').replace(/×/g, '*').replace(/÷/g, '/');
      if (!e || e.length > 100 || !/^[0-9+\-*/().%]+$/.test(e)) return ctx.reply(`Usage: ${P}calc 5*8+2`);
      const v = Function('"use strict";return (' + e + ')')();
      await ctx.reply(`🧮 ${ctx.q} = *${Number.isFinite(v) ? v : 'Error'}*`);
    }
  }),
  O({
    name: 'currency', alias: ['cur'], icon: '💱', desc: 'Currency converter', usage: `${P}currency 100 usd lkr`,
    run: async (ctx) => {
      const [amt, from, to] = ctx.args;
      if (!amt || !from || !to || isNaN(amt)) return ctx.reply(`Usage: ${P}currency 100 usd lkr`);
      const r = await U.getJson('https://open.er-api.com/v6/latest/' + from.toUpperCase());
      const rate = r.rates && r.rates[to.toUpperCase()];
      if (!rate) return ctx.reply('❌ Unknown currency code.');
      await ctx.reply(`💱 ${amt} ${from.toUpperCase()} = *${(amt * rate).toFixed(2)} ${to.toUpperCase()}*`);
    }
  }),
  O({
    name: 'define', alias: ['dict'], icon: '📕', desc: 'English dictionary', usage: `${P}define love`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}define <word>`);
      const r = await U.getJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(ctx.q.split(' ')[0]));
      const m = r[0].meanings[0];
      await ctx.reply(`📕 *${r[0].word}* (${m.partOfSpeech})\n\n${m.definitions[0].definition}${m.definitions[0].example ? '\n\n💬 ' + m.definitions[0].example : ''}`);
    }
  }),
  O({
    name: 'joke', icon: '😂', desc: 'Random joke', usage: `${P}joke`,
    run: async (ctx) => { const r = await U.getJson('https://official-joke-api.appspot.com/random_joke'); await ctx.reply(`😂 ${r.setup}\n\n👉 ${r.punchline}`); }
  }),
  O({
    name: 'fact', icon: '💡', desc: 'Random fact', usage: `${P}fact`,
    run: async (ctx) => { const r = await U.getJson('https://uselessfacts.jsph.pl/api/v2/facts/random'); await ctx.reply('💡 ' + r.text); }
  }),
  O({
    name: 'quote', icon: '💬', desc: 'Inspiring quote', usage: `${P}quote`,
    run: async (ctx) => { const r = await U.getJson('https://zenquotes.io/api/random'); await ctx.reply(`💬 “${r[0].q}”\n— ${r[0].a}`); }
  })
];
