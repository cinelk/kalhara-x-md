'use strict';
// Auto-replies (no prefix needed). Separate file → independent from every other command.
const S = require('../lib/settings');
const M = require('../lib/media');

const auto = [];

// someone sends "mk"  →  😊 + voice reply
auto.onMessage = async (ctx) => {
  if (!S.on('mk_voice')) return;
  if (!/^mk$/i.test((ctx.text || '').trim())) return;
  ctx.react('😊');
  await M.sendVoice(ctx.sock, ctx.jid, 'mk', { quoted: ctx.msg });
};

module.exports = auto;
