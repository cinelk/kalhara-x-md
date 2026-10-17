'use strict';
const C = require('../lib/config');
const U = require('../lib/utils');

const P = C.PREFIX;
const ALL_MEDIA = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];

// Own profile picture – uses WhatsApp's raw query, so it does not depend on Baileys' image library
async function setProfilePicture(sock, jid, jpegBuffer) {
  await sock.query({
    tag: 'iq',
    attrs: { target: jid, to: '@s.whatsapp.net', type: 'set', xmlns: 'w:profile:picture' },
    content: [{ tag: 'picture', attrs: { type: 'image' }, content: jpegBuffer }]
  });
}

// Any size / any shape photo → 640x640 JPEG
//  full = whole photo on a blurred background (nothing is cut)   crop = centre crop
async function makeSquare(buf, mode) {
  const sharp = require('sharp');
  const S = 640;
  const base = sharp(buf).rotate();
  if (mode === 'crop') return base.resize(S, S, { fit: 'cover', position: 'centre' }).jpeg({ quality: 92 }).toBuffer();
  const bg = await sharp(buf).rotate().resize(S, S, { fit: 'cover' }).blur(30).toBuffer();
  const fg = await sharp(buf).rotate().resize(S, S, { fit: 'inside' }).toBuffer();
  return sharp(bg).composite([{ input: fg, gravity: 'centre' }]).jpeg({ quality: 92 }).toBuffer();
}

module.exports = [
  {
    name: 'vv', alias: ['viewonce', 'rvo'], category: 'other', icon: '👀', owner: true,
    desc: 'Save a View Once photo/video/voice to YOUR chat',
    usage: `Reply with ${P}vv  (${P}vv here = send in this chat)`,
    run: async (ctx) => {
      const q = ctx.quoted;
      if (!q) return ctx.reply(`↩️ Reply to a View Once message with ${P}vv`);
      const info = U.mediaInfo(q.message);
      if (!info || !ALL_MEDIA.includes(info.type)) return ctx.reply('❌ That is not a photo / video / voice message.');
      const buf = await U.downloadMsg(ctx.sock, q.key, q.message);
      const to = /^(here|chat)$/i.test(ctx.args[0] || '') ? ctx.jid : ctx.botJid;
      const from = U.num(q.key.participant || ctx.jid);
      const caption = `📥 *Saved View Once*\n👤 From: +${from}\n💎 ${C.OWNER_NAME}`;
      await U.sendBuffer(ctx.sock, to, info.type, buf, info.node, caption);
      if (info.type === 'audioMessage') await ctx.sock.sendMessage(to, { text: caption });
      await ctx.react('✅');
    }
  },
  {
    name: 'save', alias: ['status', 'savestatus'], category: 'other', icon: '📌', owner: true,
    desc: 'Reply to a status → the status is sent to that person’s chat',
    usage: `Reply to a status with ${P}save  (${P}save me = send to my own chat)`,
    run: async (ctx) => {
      const q = ctx.quoted;
      if (!q) return ctx.reply(`↩️ Reply to a status with ${P}save`);
      const to = /^(me|my|owner)$/i.test(ctx.args[0] || '') ? ctx.botJid : ctx.jid;
      const info = U.mediaInfo(q.message);
      const key = { remoteJid: 'status@broadcast', id: q.key.id, participant: q.key.participant };
      if (info && ALL_MEDIA.includes(info.type)) {
        const buf = await U.downloadMsg(ctx.sock, key, q.message);
        await U.sendBuffer(ctx.sock, to, info.type, buf, info.node, `📌 *Saved Status*\n🤖 ${C.BOT_NAME}`);
      } else {
        const t = U.textOf(q.message);
        if (!t) return ctx.reply('❌ Nothing to save in that status.');
        await ctx.sock.sendMessage(to, { text: `📌 *Saved Status*\n\n${t}` });
      }
      await ctx.react('✅');
    }
  },
  {
    name: 'setdp', alias: ['setpp', 'setprofile'], category: 'other', icon: '🖼️', owner: true,
    desc: 'Set your WhatsApp profile photo (any size / shape)',
    usage: `Send a photo with caption ${P}setdp  or reply to a photo.  ${P}setdp crop = centre crop`,
    run: async (ctx) => {
      const m = U.pickMedia(ctx, ['imageMessage']);
      if (!m) return ctx.reply(`📷 Send a photo with the caption ${P}setdp, or reply to a photo with ${P}setdp`);
      await ctx.react('⏳');
      const raw = await U.downloadMsg(ctx.sock, m.key, m.message);
      const jpg = await makeSquare(raw, /crop/i.test(ctx.q) ? 'crop' : 'full');
      await setProfilePicture(ctx.sock, ctx.botJid, jpg);
      await ctx.react('✅');
      await ctx.reply('✅ Profile photo updated!');
    }
  },
  {
    name: 'getdp', alias: ['getpp', 'dp'], category: 'other', icon: '📸',
    desc: 'Get someone’s profile photo (sent into this chat)',
    usage: `${P}getdp  |  reply/mention in a group  |  ${P}getdp 94771234567`,
    run: async (ctx) => {
      const ci = U.getContext(U.contentOf(ctx.msg.message));
      let target = ctx.jid;
      const digits = (ctx.args[0] || '').replace(/\D/g, '');
      if (digits.length >= 8) target = digits + '@s.whatsapp.net';
      else if (ci && ci.mentionedJid && ci.mentionedJid[0]) target = ci.mentionedJid[0];
      else if (ctx.quoted && ctx.quoted.key.participant) target = ctx.quoted.key.participant;
      let url;
      try { url = await ctx.sock.profilePictureUrl(target, 'image'); } catch (_) {}
      if (!url) return ctx.reply('❌ No profile photo (or it is hidden by privacy settings).');
      await ctx.sock.sendMessage(ctx.jid, { image: { url }, caption: `📸 Profile photo of +${U.num(target)}\n> ${C.BOT_NAME}` }, { quoted: ctx.msg });
    }
  },
  {
    name: 'setbio', alias: ['setabout'], category: 'other', icon: '✍️', owner: true,
    desc: 'Change your WhatsApp About text', usage: `${P}setbio Busy`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}setbio <text>`);
      await ctx.sock.updateProfileStatus(ctx.q);
      await ctx.reply('✅ About updated.');
    }
  },
  {
    name: 'setname', category: 'other', icon: '🏷️', owner: true,
    desc: 'Change your WhatsApp name', usage: `${P}setname Kalhara`,
    run: async (ctx) => {
      if (!ctx.q) return ctx.reply(`Usage: ${P}setname <name>`);
      await ctx.sock.updateProfileName(ctx.q);
      await ctx.reply('✅ Name updated.');
    }
  },
  {
    name: 'restart', category: 'other', icon: '🔄', owner: true,
    desc: 'Restart the bot', usage: `${P}restart`,
    run: async (ctx) => {
      await ctx.reply('🔄 Restarting...');
      setTimeout(() => process.exit(0), 1000);
    }
  }
];
