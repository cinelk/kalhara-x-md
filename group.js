'use strict';
const C = require('../lib/config');
const U = require('../lib/utils');

const P = C.PREFIX;
const antilink = U.store('antilink');
const LINK_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i;

function targets(ctx) {
  const ci = U.getContext(U.contentOf(ctx.msg.message));
  const set = new Set((ci && ci.mentionedJid) || []);
  if (ctx.quoted && ctx.quoted.key.participant) set.add(ctx.quoted.key.participant);
  for (const a of ctx.args) {
    const d = a.replace(/\D/g, '');
    if (d.length >= 8) set.add(d + '@s.whatsapp.net');
  }
  return [...set];
}
const G = (o) => ({ category: 'group', groupOnly: true, admin: true, ...o });

async function change(ctx, action, doneText) {
  const list = targets(ctx).filter((j) => U.num(j) !== U.num(ctx.botJid));
  if (!list.length) return ctx.reply(`❗ Mention, reply to, or type the number of the member.\nExample: ${P}${ctx.command} @user`);
  await ctx.sock.groupParticipantsUpdate(ctx.jid, list, action);
  await ctx.sock.sendMessage(ctx.jid, { text: `${doneText}\n${list.map((j) => '• @' + U.num(j)).join('\n')}`, mentions: list }, { quoted: ctx.msg });
}

const commands = [
  G({
    name: 'tagall', alias: ['everyone'], icon: '📢', desc: 'Mention every group member', usage: `${P}tagall Meeting at 8pm`,
    run: async (ctx) => {
      const ps = ctx.meta.participants;
      const text = `📢 *${ctx.q || 'Attention everyone!'}*\n\n` + ps.map((p) => `• @${U.num(p.id)}`).join('\n');
      await ctx.sock.sendMessage(ctx.jid, { text, mentions: ps.map((p) => p.id) }, { quoted: ctx.msg });
    }
  }),
  G({
    name: 'hidetag', alias: ['tag'], icon: '👻', desc: 'Mention everyone silently', usage: `${P}hidetag Hello`,
    run: async (ctx) => {
      const text = ctx.q || (ctx.quoted ? U.textOf(ctx.quoted.message) : '') || '📣';
      await ctx.sock.sendMessage(ctx.jid, { text, mentions: ctx.meta.participants.map((p) => p.id) });
    }
  }),
  G({ name: 'kick', alias: ['remove'], icon: '🚪', botAdmin: true, desc: 'Remove a member', usage: `${P}kick @user`, run: (ctx) => change(ctx, 'remove', '🚪 Removed:') }),
  G({
    name: 'add', icon: '➕', botAdmin: true, desc: 'Add a member by number', usage: `${P}add 94771234567`,
    run: async (ctx) => {
      const nums = ctx.args.map((a) => a.replace(/\D/g, '')).filter((d) => d.length >= 8);
      if (!nums.length) return ctx.reply(`Usage: ${P}add 94771234567`);
      const res = await ctx.sock.groupParticipantsUpdate(ctx.jid, nums.map((n) => n + '@s.whatsapp.net'), 'add');
      const out = (res || []).map((r) => `• +${U.num(r.jid)} → ${String(r.status) === '200' ? '✅ added' : String(r.status) === '403' ? '📨 needs invite (privacy)' : '❌ failed (' + r.status + ')'}`);
      await ctx.reply(out.join('\n') || '✅ Done');
    }
  }),
  G({ name: 'promote', icon: '⬆️', botAdmin: true, desc: 'Make a member admin', usage: `${P}promote @user`, run: (ctx) => change(ctx, 'promote', '⬆️ Now admin:') }),
  G({ name: 'demote', icon: '⬇️', botAdmin: true, desc: 'Remove admin rights', usage: `${P}demote @user`, run: (ctx) => change(ctx, 'demote', '⬇️ No longer admin:') }),
  G({
    name: 'mute', alias: ['close'], icon: '🔇', botAdmin: true, desc: 'Only admins can send messages', usage: `${P}mute`,
    run: async (ctx) => { await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement'); await ctx.reply('🔇 Group closed – only admins can send messages.'); }
  }),
  G({
    name: 'unmute', alias: ['open'], icon: '🔊', botAdmin: true, desc: 'Everyone can send messages', usage: `${P}unmute`,
    run: async (ctx) => { await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement'); await ctx.reply('🔊 Group opened – everyone can send messages.'); }
  }),
  G({
    name: 'link', alias: ['grouplink'], icon: '🔗', botAdmin: true, desc: 'Get the group invite link', usage: `${P}link`,
    run: async (ctx) => ctx.reply('🔗 https://chat.whatsapp.com/' + (await ctx.sock.groupInviteCode(ctx.jid)))
  }),
  G({
    name: 'revoke', icon: '♻️', botAdmin: true, desc: 'Reset the group invite link', usage: `${P}revoke`,
    run: async (ctx) => { await ctx.sock.groupRevokeInvite(ctx.jid); await ctx.reply('♻️ Invite link reset. Use ' + P + 'link for the new one.'); }
  }),
  G({
    name: 'ginfo', alias: ['groupinfo'], icon: 'ℹ️', desc: 'Show group information', usage: `${P}ginfo`,
    run: async (ctx) => {
      const m = ctx.meta;
      const admins = m.participants.filter((p) => p.admin).length;
      await ctx.reply(`ℹ️ *${m.subject}*\n\n👥 Members: ${m.participants.length}\n🛡️ Admins: ${admins}\n📅 Created: ${new Date((m.creation || 0) * 1000).toDateString()}\n\n📝 ${m.desc || 'No description'}`);
    }
  }),
  G({
    name: 'antilink', icon: '🚫', botAdmin: true, desc: 'Delete WhatsApp group links from members', usage: `${P}antilink on | off`,
    run: async (ctx) => {
      const v = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return ctx.reply(`Usage: ${P}antilink on | off\nNow: ${antilink.get(ctx.jid) ? 'ON ✅' : 'OFF ❌'}`);
      antilink.set(ctx.jid, v === 'on');
      await ctx.reply(v === 'on' ? '🚫 Anti-link is ON.' : '✅ Anti-link is OFF.');
    }
  })
];

// runs on every message (independent from the commands above)
commands.onMessage = async (ctx) => {
  if (!ctx.isGroup || ctx.msg.key.fromMe || !antilink.get(ctx.jid) || !LINK_RE.test(ctx.text)) return;
  const g = await U.groupInfo(ctx.sock, ctx.jid, ctx.msg);
  if (g.isSenderAdmin || !g.isBotAdmin) return;
  await ctx.sock.sendMessage(ctx.jid, { delete: ctx.msg.key });
  await ctx.sock.sendMessage(ctx.jid, { text: `🚫 @${U.num(ctx.sender)} group links are not allowed here.`, mentions: [ctx.sender] });
};

module.exports = commands;
