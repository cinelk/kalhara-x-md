'use strict';
const path = require('path');
const yts = require('yt-search');
const C = require('../lib/config');
const U = require('../lib/utils');

const P = C.PREFIX;
const URL_RE = /https?:\/\/[^\s]+/i;
const urlFrom = (ctx) =>
  (ctx.q.match(URL_RE) || [])[0] ||
  (ctx.quoted && (U.textOf(ctx.quoted.message).match(URL_RE) || [])[0]) || null;

async function resolveVideo(q) {
  const m = q.match(U.YT_RE);
  if (m) {
    try { const v = await yts({ videoId: m[1] }); if (v && v.title) return v; } catch (_) {}
    return { title: m[1], url: `https://www.youtube.com/watch?v=${m[1]}`, timestamp: '', thumbnail: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
  }
  if (/^https?:\/\/\S+$/i.test(q)) return { title: 'Media', url: q, timestamp: '' };
  const s = await yts(q);
  return s.videos.find((v) => v.seconds > 0 && v.seconds <= C.MAX_DURATION_SEC) || null;
}

// one factory → every social site works through the same smart downloader
const social = (name, alias, icon, desc, example) => ({
  name, alias, category: 'download', icon, desc, usage: `${P}${name} ${example}`,
  run: async (ctx) => {
    const url = urlFrom(ctx);
    if (!url) return ctx.reply(`🔗 Please send a link.\nExample: ${P}${name} ${example}`);
    await ctx.react('⏳');
    await U.smartDownload(ctx, url);
    await ctx.react('✅');
  }
});

module.exports = [
  {
    name: 'song', alias: ['play', 'ytmp3'], category: 'download', icon: '🎵', desc: 'Download and play audio/mp3 files', usage: `${P}song baby baby`,
    run: async (ctx) => {
      const q = ctx.q || (ctx.quoted ? U.textOf(ctx.quoted.message) : '');
      if (!q) return ctx.reply(`🎵 Send a song name or YouTube link.\nExample: ${P}song baby baby`);
      const v = await resolveVideo(q);
      if (!v) return ctx.reply('❌ Song not found.');
      if (v.thumbnail) {
        ctx.sock.sendMessage(ctx.jid, { image: { url: v.thumbnail }, caption: `┏━━━━━━━━━━━━━━━━━━━━━┓\n┃ 🎵 *${v.title}*\n┗━━━━━━━━━━━━━━━━━━━━━┛\n⏱️ ${v.timestamp || 'N/A'}\n👤 Owner: ${C.OWNER_NAME}` }, { quoted: ctx.msg }).catch(() => {});
      }
      await ctx.react('⏳');
      const files = await U.ytdlp(v.url, 'audio');
      try { await U.sendFile(ctx.sock, ctx.jid, files[0], { quoted: ctx.msg }); } finally { U.cleanup(files); }
      await ctx.react('✅');
    }
  },
  {
    name: 'video', alias: ['mp4', 'ytmp4'], category: 'download', icon: '🎥', desc: 'Download high quality video files', usage: `${P}video lelena`,
    run: async (ctx) => {
      const q = ctx.q || (ctx.quoted ? U.textOf(ctx.quoted.message) : '');
      if (!q) return ctx.reply(`🎬 Send a video name or link.\nExample: ${P}video lelena`);
      const v = await resolveVideo(q);
      if (!v) return ctx.reply('❌ Video not found.');
      await ctx.react('⏳');
      const files = await U.ytdlp(v.url, 'video');
      try { await U.sendFile(ctx.sock, ctx.jid, files[0], { quoted: ctx.msg }, `🎬 *${v.title}*\n> Creator: ${C.OWNER_NAME}`); } finally { U.cleanup(files); }
      await ctx.react('✅');
    }
  },
  {
    name: 'yts', alias: ['ytsearch'], category: 'download', icon: '🔎', desc: 'Search YouTube', usage: `${P}yts lelena`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}yts <search>`);
      const r = (await yts(ctx.q)).videos.slice(0, 6);
      if (!r.length) return ctx.reply('❌ Nothing found.');
      await ctx.reply('🔎 *YouTube results*\n\n' + r.map((v, i) => `${i + 1}. *${v.title}*\n   ⏱️ ${v.timestamp} · 👁️ ${v.views.toLocaleString()}\n   ${v.url}`).join('\n\n'));
    }
  },
  social('tt', ['tiktok'], '📱', 'Download TikTok videos without watermark', '<Url>'),
  social('fb', ['facebook'], '👥', 'Download Facebook videos and reels', '<Url>'),
  social('ig', ['instagram', 'insta'], '📸', 'Download Instagram reels, posts and stories', '<Url>'),
  social('tw', ['twitter', 'x'], '🐦', 'Download Twitter / X videos and images', '<Url>'),
  social('pin', ['pinterest'], '📌', 'Download Pinterest videos and images', '<Url>'),
  social('alldl', ['dl', 'download'], '🔗', 'Download media from any link (YouTube, Reddit, Vimeo, SoundCloud, Twitch…)', '<Link>'),
  {
    name: 'mediafire', alias: ['mf'], category: 'download', icon: '☁️', desc: 'Direct Mediafire link downloader', usage: `${P}mediafire <Url>`,
    run: async (ctx) => {
      const url = urlFrom(ctx);
      if (!url || !/mediafire\.com/i.test(url)) return ctx.reply(`☁️ Send a Mediafire link.\nExample: ${P}mediafire <Url>`);
      await ctx.react('⏳');
      const html = (await U.http.get(url, { headers: { 'User-Agent': U.UA } })).data;
      const m = String(html).match(/href="([^"]+)"[^>]*aria-label="Download file"/) ||
        String(html).match(/aria-label="Download file"[^>]*href="([^"]+)"/) ||
        String(html).match(/href="(https?:\/\/download[^"]*mediafire\.com[^"]+)"/);
      if (!m) return ctx.reply('❌ Could not find the download link (file removed or protected).');
      const dl = m[1].replace(/&amp;/g, '&');
      let size = 0;
      try { size = Number((await U.http.head(dl)).headers['content-length'] || 0); } catch (_) {}
      if (size > 150 * 1024 * 1024) return ctx.reply(`⚠️ File is too big for WhatsApp (${(size / 1048576).toFixed(0)} MB).\n🔗 ${dl}`);
      const name = decodeURIComponent(path.basename(new URL(dl).pathname)) || 'file';
      await ctx.sock.sendMessage(ctx.jid, { document: { url: dl }, fileName: name, mimetype: 'application/octet-stream', caption: `☁️ ${name}` }, { quoted: ctx.msg });
      await ctx.react('✅');
    }
  },
  {
    name: 'apk', alias: ['app'], category: 'download', icon: '⚙️', desc: 'Search and download Android APK files', usage: `${P}apk whatsapp`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}apk <app name>`);
      const r = await U.getJson('https://ws75.aptoide.com/api/7/apps/search', { query: ctx.q, limit: 1 });
      const a = r && r.datalist && r.datalist.list && r.datalist.list[0];
      if (!a || !a.file || !a.file.path) return ctx.reply('❌ App not found.');
      const size = a.file.filesize || a.size || 0;
      const info = `⚙️ *${a.name}*\n📦 ${a.package}\n🔖 v${a.file.vername || '?'}\n💾 ${(size / 1048576).toFixed(1)} MB`;
      if (a.icon) await ctx.sock.sendMessage(ctx.jid, { image: { url: a.icon }, caption: info }, { quoted: ctx.msg }).catch(() => {});
      if (size > 150 * 1024 * 1024) return ctx.reply(`⚠️ Too big for WhatsApp.\n🔗 ${a.file.path}`);
      await ctx.react('⏳');
      await ctx.sock.sendMessage(ctx.jid, { document: { url: a.file.path }, mimetype: 'application/vnd.android.package-archive', fileName: `${U.cleanName(a.name)}.apk`, caption: info }, { quoted: ctx.msg });
      await ctx.react('✅');
    }
  }
];
