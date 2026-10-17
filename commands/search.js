'use strict';
const C = require('../lib/config');
const U = require('../lib/utils');

const P = C.PREFIX;
const O = (o) => ({ category: 'other', ...o });

// Bing image search (free, no key). SafeSearch strict.
async function bingImages(q, large) {
  const html = (await U.http.get('https://www.bing.com/images/search', {
    params: { q, form: 'HDRSC2', first: 1, qft: large ? ' filterui:imagesize-large' : undefined },
    headers: { Cookie: 'SRCHHPGUSR=ADLT=STRICT', 'Accept-Language': 'en-US,en;q=0.9' }
  })).data;
  const urls = [...String(html).matchAll(/murl&quot;:&quot;(.*?)&quot;/g)]
    .map((m) => m[1].replace(/&amp;/g, '&'))
    .filter((u) => /^https?:\/\//.test(u) && /\.(jpe?g|png|webp)(\?|$)/i.test(u));
  return [...new Set(urls)];
}

async function sendImages(ctx, urls, count, large) {
  let sent = 0;
  for (const u of urls) {
    if (sent >= count) break;
    try {
      await ctx.sock.sendMessage(ctx.jid, { image: { url: u }, caption: sent === 0 ? `🖼️ ${ctx.q}${large ? ' (HD)' : ''}` : '' }, { quoted: ctx.msg });
      sent++;
    } catch (_) { /* image blocked → try next */ }
  }
  return sent;
}

function unbing(u) {
  try {
    const x = new URL(u);
    if (x.hostname.endsWith('bing.com') && x.pathname.startsWith('/ck/')) {
      let v = x.searchParams.get('u') || '';
      if (v.startsWith('a1')) v = v.slice(2);
      return Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    }
  } catch (_) {}
  return u;
}

module.exports = [
  O({
    name: 'img', alias: ['image'], icon: '🖼️', desc: 'Search and download HD images', usage: `${P}img cat`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}img <search>`);
      await ctx.react('🔍');
      const urls = await bingImages(ctx.q, false);
      if (!(await sendImages(ctx, urls, 4, false))) return ctx.reply('❌ No images found.');
      await ctx.react('✅');
    }
  }),
  O({
    name: 'img2', icon: '🖼️', desc: 'Search and download High Quality images', usage: `${P}img2 Dog`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}img2 <search>`);
      await ctx.react('🔍');
      const urls = await bingImages(ctx.q, true);
      if (!(await sendImages(ctx, urls, 3, true))) return ctx.reply('❌ No images found.');
      await ctx.react('✅');
    }
  }),
  O({
    name: 'stdl', alias: ['stickersearch'], icon: '🎭', desc: 'Search and download stickers', usage: `${P}stdl cat`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}stdl <search>`);
      await ctx.react('🔍');
      const { Sticker, StickerTypes } = require('wa-sticker-formatter');
      const urls = await bingImages(ctx.q + ' sticker', false);
      let sent = 0;
      for (const u of urls) {
        if (sent >= 4) break;
        try {
          const buf = await U.getBuffer(u);
          const out = await new Sticker(buf, { pack: C.BOT_NAME, author: C.OWNER_NAME, type: StickerTypes.FULL, quality: 60 }).toBuffer();
          await ctx.sock.sendMessage(ctx.jid, { sticker: out }, { quoted: ctx.msg });
          sent++;
        } catch (_) {}
      }
      if (!sent) return ctx.reply('❌ No stickers found.');
      await ctx.react('✅');
    }
  }),
  O({
    name: 'lyrics', alias: ['lyric'], icon: '🎤', desc: 'Search and download song lyrics', usage: `${P}lyrics namal`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}lyrics <song name>`);
      const r = await U.getJson('https://lrclib.net/api/search', { q: ctx.q });
      const s = (r || []).find((x) => x.plainLyrics);
      if (!s) return ctx.reply('❌ Lyrics not found.');
      await ctx.reply(`🎤 *${s.trackName}* — ${s.artistName}\n\n${s.plainLyrics.slice(0, 3900)}`);
    }
  }),
  O({
    name: 'novels', category: 'education', alias: ['novel', 'book'], icon: '📚', desc: 'Download novels and story books (free public-domain library)', usage: `${P}novels Love`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}novels <title or author>`);
      await ctx.react('🔍');
      const r = await U.getJson('https://gutendex.com/books', { search: ctx.q });
      const list = (r.results || []).filter((b) => b.formats && b.formats['application/epub+zip']);
      if (!list.length) return ctx.reply('❌ No book found.');
      const b = list[0];
      const others = list.slice(1, 5).map((x) => `• ${x.title}`).join('\n');
      await ctx.sock.sendMessage(ctx.jid, {
        document: { url: b.formats['application/epub+zip'] }, mimetype: 'application/epub+zip',
        fileName: `${U.cleanName(b.title)}.epub`,
        caption: `📚 *${b.title}*\n✍️ ${(b.authors[0] && b.authors[0].name) || 'Unknown'}${others ? '\n\nMore results:\n' + others : ''}`
      }, { quoted: ctx.msg });
      await ctx.react('✅');
    }
  }),
  O({
    name: 'paper', category: 'education', alias: ['papers'], icon: '📝', desc: 'Find school/exam papers (PDF)', usage: `${P}paper grade 11 maths past paper`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`📝 Education Hub\nUsage: ${P}paper <grade / subject / year>`);
      await ctx.react('🔍');
      const html = (await U.http.get('https://www.bing.com/search', { params: { q: `${ctx.q} filetype:pdf` }, headers: { 'Accept-Language': 'en-US,en;q=0.9' } })).data;
      const links = [...String(html).matchAll(/<h2[^>]*><a[^>]+href="(https?:\/\/[^"]+)"/g)]
        .map((m) => unbing(m[1].replace(/&amp;/g, '&')))
        .filter((u, i, a) => a.indexOf(u) === i);
      if (!links.length) return ctx.reply('❌ Nothing found. Try different words.');
      const pdfs = links.filter((u) => /\.pdf(\?|$)/i.test(u));
      let sent = 0;
      for (const u of pdfs) {
        if (sent >= 2) break;
        try {
          const size = Number((await U.http.head(u)).headers['content-length'] || 0);
          if (size && size > 40 * 1024 * 1024) continue;
          await ctx.sock.sendMessage(ctx.jid, { document: { url: u }, mimetype: 'application/pdf', fileName: U.cleanName(decodeURIComponent(u.split('/').pop().split('?')[0])) || 'paper.pdf' }, { quoted: ctx.msg });
          sent++;
        } catch (_) {}
      }
      if (!sent) await ctx.reply('🔗 *Results*\n\n' + links.slice(0, 6).map((u, i) => `${i + 1}. ${u}`).join('\n'));
      else await ctx.react('✅');
    }
  }),
  O({
    name: 'wiki', category: 'education', alias: ['wikipedia'], icon: '📖', desc: 'Wikipedia summary (English / Sinhala)', usage: `${P}wiki Sri Lanka`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}wiki <topic>`);
      const lang = /[\u0D80-\u0DFF]/.test(ctx.q) ? 'si' : 'en';
      const s = await U.getJson(`https://${lang}.wikipedia.org/w/api.php`, { action: 'opensearch', search: ctx.q, limit: 1, format: 'json' });
      const title = s && s[1] && s[1][0];
      if (!title) return ctx.reply('❌ Nothing found.');
      const r = await U.getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      const cap = `📖 *${r.title}*\n\n${(r.extract || '').slice(0, 1500)}\n\n🔗 ${r.content_urls && r.content_urls.desktop.page}`;
      if (r.thumbnail && r.thumbnail.source) await ctx.sock.sendMessage(ctx.jid, { image: { url: r.thumbnail.source }, caption: cap }, { quoted: ctx.msg });
      else await ctx.reply(cap);
    }
  })
];
