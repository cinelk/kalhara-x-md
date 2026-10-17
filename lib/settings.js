'use strict';
// ONE place for everything that users may want to customise later (images, voices, texts, ON/OFF switches).
// Values are saved in data/settings.json. The future website settings page only needs to read/write this module.
const C = require('./config');
const U = require('./utils');

const db = U.store('settings');
const DEFAULTS = {
  site_url: process.env.SITE_URL || 'https://kalhara-x-md.vercel.app',
  bot_name: C.BOT_NAME,
  owner_name: C.OWNER_NAME,
  // images
  img_menu: C.ALIVE_IMG,
  img_alive: C.ALIVE_IMG,
  img_connected: C.CONNECTED_IMG,
  // voices (direct mp3 link, or put assets/alive.mp3 / assets/mk.mp3 in the project)
  audio_alive: 'https://jumpshare.com/share/BP8nOeDf5LuCvW6j77ZR',
  audio_mk: 'https://jumpshare.com/share/uf2w3ppzRjdYOXim0Ce5',
  // switches
  status_seen: C.AUTO_STATUS_SEEN,
  status_react: C.AUTO_STATUS_REACT,
  status_reply: true,
  status_emoji: '💚',
  status_reply_text: '👀 I just saw your status! ✨\nLooking good 💚🔥',
  mk_voice: true,
  connect_msg: true
};

const get = (k) => { const v = db.get(k); return v === undefined ? DEFAULTS[k] : v; };
const on = (k) => !!get(k);
const keys = () => Object.keys(DEFAULTS);
function set(k, v) {
  if (typeof DEFAULTS[k] === 'boolean') v = /^(on|true|1|yes)$/i.test(String(v));
  db.set(k, v);
}
const reset = (k) => db.set(k, undefined);

module.exports = { get, set, on, keys, reset, DEFAULTS };
