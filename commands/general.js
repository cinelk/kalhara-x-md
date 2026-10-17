'use strict';
const C = require('../lib/config');
const U = require('../lib/utils');
const S = require('../lib/settings');
const M = require('../lib/media');

const P = C.PREFIX;
const BT = '`';
const CATS = [
  { id: 'general', n: 1, e: '1️⃣', icon: '⚙️', title: 'G E N E R A L', en: 'General', si: 'සාමාන්‍ය' },
  { id: 'download', n: 2, e: '2️⃣', icon: '📥', title: 'D O W N L O A D', en: 'Download', si: 'බාගත කිරීම්' },
  { id: 'education', n: 3, e: '3️⃣', icon: '🎓', title: 'E D U C A T I O N', en: 'Education', si: 'අධ්‍යාපන' },
  { id: 'group', n: 4, e: '4️⃣', icon: '👥', title: 'G R O U P', en: 'Group', si: 'කණ්ඩායම්' },
  { id: 'other', n: 5, e: '5️⃣', icon: '🧰', title: 'O T H E R', en: 'Other', si: 'වෙනත්' }
];
const TOP = '╭──────⟡ ⚡ KALHARA X MD ⚡ ⟡──────╮';
const BOTTOM = '╰───────────────────────╯';
const LINE = '━━━━━━━━━━━━━━━━━━━━━';
const footer = () => `🌐 Get your own bot • ඔබේ බොට්:\n${S.get('site_url')}`;

function fmtTime(s) {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m ${s % 60}s`;
}

const menuIds = new Set(); // ids of menu messages → user can reply with 1-5
const remember = (sent) => {
  if (sent && sent.key && sent.key.id) {
    menuIds.add(sent.key.id);
    if (menuIds.size > 300) menuIds.delete(menuIds.values().next().value);
  }
};

function catText(cat, list) {
  const cmds = list.filter((c) => c.category === cat.id);
  const rows = cmds.map((c, i) =>
    `╭─❖ ${String(i + 1).padStart(2, '0')} ⟫ ${c.icon || '✨'} ${BT}${P}${c.name}${BT}${c.owner ? ' 🔒' : ''}\n╰➤ ${c.desc || ''}\n    ⌨ ${c.usage || P + c.name}`
  ).join('\n\n');
  return `${TOP}\n│  ${cat.icon}  ${cat.title}  ${cat.icon}\n│  ✦ ${cat.en} • ${cat.si}  (${cmds.length})\n${BOTTOM}\n\n${rows || '—'}\n\n${LINE}\n↩️ Reply 1-5 for another menu\n    වෙනත් මෙනුවකට 1-5 reply කරන්න\n${footer()}`;
}
async function sendCat(ctx, cat) {
  remember(await ctx.sock.sendMessage(ctx.jid, { text: catText(cat, ctx.commands) }, { quoted: ctx.msg }));
}

const commands = [
  {
    name: 'menu', alias: ['help', 'list'], category: 'general', icon: '📜',
    desc: 'Numbered menu – reply with 1-5', usage: `${P}menu  |  ${P}menu 2  |  ${P}menu all`,
    run: async (ctx) => {
      const arg = (ctx.args[0] || '').toLowerCase();
      if (arg === 'all') { for (const c of CATS) await sendCat(ctx, c); return; }
      const cat = CATS.find((c) => String(c.n) === arg || c.id === arg);
      if (cat) return sendCat(ctx, cat);
      const rows = CATS.map((c) => ` ┃ ${c.e}  ${c.icon} ${c.en} • ${c.si}  (${ctx.commands.filter((x) => x.category === c.id).length})`).join('\n');
      const caption = `${TOP}\n│ 👋 Hi ${ctx.pushName} • ආයුබෝවන්!\n│ 👑 Owner   : ${S.get('owner_name')}\n│ 🔣 Prefix  : ${P}\n│ ⏱️ Uptime  : ${fmtTime(process.uptime())}\n│ 🧩 Commands: ${ctx.commands.length}\n${BOTTOM}\n\n ┏━━ 🗂️ MENU LIST • මෙනු ━━┓\n${rows}\n ┗━━━━━━━━━━━━━━━━━━━┛\n\n↩️ Reply with a number (1-5) to open\n    අංකයක් (1-5) reply කරන්න\n${footer()}`;
      try {
        remember(await ctx.sock.sendMessage(ctx.jid, { image: { url: S.get('img_menu') }, caption }, { quoted: ctx.msg }));
      } catch (_) {
        remember(await ctx.sock.sendMessage(ctx.jid, { text: caption }, { quoted: ctx.msg }));
      }
    }
  },
  {
    name: 'alive', category: 'general', icon: '🟢', desc: 'Check if the bot is online', usage: `${P}alive`,
    run: async (ctx) => {
      const caption = `${TOP}\n│ 🟢 I’m alive • මම ක්‍රියාත්මකයි\n${BOTTOM}\n\n👋 Hi ${ctx.pushName}!\n👑 Owner  : ${S.get('owner_name')}\n⏱️ Uptime : ${fmtTime(process.uptime())}\n⚡ Status : Fast & Online\n\n📜 ${P}menu • මෙනුව බලන්න\n\n${footer()}`;
      await ctx.sock.sendMessage(ctx.jid, { image: { url: S.get('img_alive') }, caption }, { quoted: ctx.msg });
      M.sendVoice(ctx.sock, ctx.jid, 'alive', { quoted: ctx.msg }).catch(() => {});
    }
  },
  {
    name: 'ping', category: 'general', icon: '🏓', desc: 'Check the bot speed', usage: `${P}ping`,
    run: async (ctx) => {
      const t = Date.now();
      const sent = await ctx.sock.sendMessage(ctx.jid, { text: '🏓 Pinging...' }, { quoted: ctx.msg });
      await ctx.sock.sendMessage(ctx.jid, { text: `⚡ *Speed:* ${BT}${Date.now() - t}ms${BT}`, edit: sent.key });
    }
  },
  {
    name: 'runtime', alias: ['uptime'], category: 'general', icon: '⏱️', desc: 'How long the bot has been running', usage: `${P}runtime`,
    run: (ctx) => ctx.reply(`⏱️ *Runtime:* ${fmtTime(process.uptime())}`)
  },
  {
    name: 'owner', category: 'general', icon: '👤', desc: 'Get the owner contact', usage: `${P}owner`,
    run: async (ctx) => {
      const n = C.OWNER_NUMBER || U.num(ctx.botJid);
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${S.get('owner_name')}\nTEL;type=CELL;type=VOICE;waid=${n}:+${n}\nEND:VCARD`;
      await ctx.sock.sendMessage(ctx.jid, { contacts: { displayName: S.get('owner_name'), contacts: [{ vcard }] } }, { quoted: ctx.msg });
    }
  }
];

// reply to a menu message with 1-5
commands.onMessage = async (ctx) => {
  if (!ctx.quoted || !menuIds.has(ctx.quoted.key.id)) return;
  const cat = CATS.find((c) => String(c.n) === ctx.text.trim());
  if (cat) await sendCat(ctx, cat);
};

module.exports = commands;
