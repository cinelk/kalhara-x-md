'use strict';
const C = require('../lib/config');
const U = require('../lib/utils');

const P = C.PREFIX;
const BT = '`';
const TITLES = {
  general: '⚙️ General Menu ⚙️',
  group: '👥 Group Menu 👥',
  download: '📥 Download Menu 📥',
  other: '🧰 Other Menu 🧰'
};
const head = (t) => `┏━⋅━⋅━━⋅༻❁༺⋅━━⋅━⋅━┓\n.༻♡  ${t}  ♡༺.\n╰━⋅━⋅━.· ✿༻༺✿·.━⋅━⋅━╯`;
const block = (c) => `══════ 🎀 ${BT}${P}${c.name}${BT} ══════\n   ✧ ${c.desc || ''}${c.owner ? ' 🔒' : ''}\n   ${c.icon || '✨'} Usage: ${c.usage || P + c.name}`;
const section = (cat, list) => `${head(TITLES[cat])}\n\n${list.filter((c) => c.category === cat).map(block).join('\n\n')}`;

function fmtTime(s) {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m ${s % 60}s`;
}

module.exports = [
  {
    name: 'menu', alias: ['help', 'list'], category: 'general', icon: '📜',
    desc: 'Show all commands', usage: `${P}menu | ${P}menu download | ${P}menu all`,
    run: async (ctx) => {
      const cats = Object.keys(TITLES);
      const arg = (ctx.args[0] || '').toLowerCase();
      if (cats.includes(arg)) return ctx.reply(section(arg, ctx.commands));
      if (arg === 'all') return ctx.reply(cats.map((c) => section(c, ctx.commands)).join('\n\n'));
      const lines = cats.map((c) => {
        const l = ctx.commands.filter((x) => x.category === c);
        return `${TITLES[c]}\n   ${l.map((x) => P + x.name).join('  ')}\n   ➜ ${P}menu ${c}`;
      }).join('\n\n');
      await ctx.sock.sendMessage(ctx.jid, {
        image: { url: C.ALIVE_IMG },
        caption: `${head(C.BOT_NAME + ' MENU')}\n\n👋 Hi ${ctx.pushName}!\n💎 Owner: ${C.OWNER_NAME}\n\n${lines}\n\n📖 ${P}menu all  → everything\n> Powered by ${C.OWNER_NAME}`
      }, { quoted: ctx.msg }).catch(() => ctx.reply(`${head(C.BOT_NAME + ' MENU')}\n\n${lines}`));
    }
  },
  {
    name: 'alive', category: 'general', icon: '🟢', desc: 'Check if the bot is online', usage: `${P}alive`,
    run: async (ctx) => {
      await ctx.sock.sendMessage(ctx.jid, {
        image: { url: C.ALIVE_IMG },
        caption: `┏━━━━━━━━━━━━━━━━━━━━━┓\n┃  🤖 ${C.BOT_NAME} ACTIVE 🤖\n┗━━━━━━━━━━━━━━━━━━━━━┛\n👋 ආයුබෝවන් ${ctx.pushName}!\n💎 Owner: ${C.OWNER_NAME}\n⏱️ Uptime: ${fmtTime(process.uptime())}\n⚡ Status: Fast & Online 🟢\n\n📌 ${P}menu ලෙස ටයිප් කර පහසුකම් ලබාගන්න.`
      }, { quoted: ctx.msg });
    }
  },
  {
    name: 'ping', category: 'general', icon: '🏓', desc: 'Check the bot speed', usage: `${P}ping`,
    run: async (ctx) => {
      const t = Date.now();
      const sent = await ctx.sock.sendMessage(ctx.jid, { text: '🏓 Pinging...' }, { quoted: ctx.msg });
      await ctx.sock.sendMessage(ctx.jid, { text: `⚡ *${C.BOT_NAME} Latency:* ${BT}${Date.now() - t}ms${BT}`, edit: sent.key });
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
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${C.OWNER_NAME}\nTEL;type=CELL;type=VOICE;waid=${n}:+${n}\nEND:VCARD`;
      await ctx.sock.sendMessage(ctx.jid, { contacts: { displayName: C.OWNER_NAME, contacts: [{ vcard }] } }, { quoted: ctx.msg });
    }
  }
];
