'use strict';
// Voice / audio loader with cache. Order: assets/<name>.mp3  →  setting link  →  Jumpshare page resolver
const fs = require('fs');
const path = require('path');
const U = require('./utils');
const S = require('./settings');

const ASSETS = path.join(__dirname, '..', 'assets');
const cache = new Map();

async function fromJumpshare(page) {
  const id = (page.match(/\/share\/([A-Za-z0-9]+)/) || [])[1];
  if (id) {
    try {
      const r = await U.http.get(`https://jumpshare.com/download/${id}`, { responseType: 'arraybuffer', headers: { Referer: page } });
      if (!/text\/html/i.test(String(r.headers['content-type'] || '')) && r.data.byteLength > 1000) return Buffer.from(r.data);
    } catch (_) {}
  }
  const html = String((await U.http.get(page)).data).replace(/\\\//g, '/');
  const m = html.match(/https?:\/\/[^"'\s<>\\]+?\.(?:mp3|m4a|ogg|opus|wav)(?:\?[^"'\s<>\\]*)?/i);
  if (m) return U.getBuffer(m[0]);
  throw new Error('Jumpshare page has no direct audio link. Put the mp3 in assets/ or use a direct .mp3 link.');
}

async function load(name) {
  if (cache.has(name)) return cache.get(name);
  let buf = null;
  for (const ext of ['mp3', 'm4a', 'ogg', 'opus']) {
    const f = path.join(ASSETS, `${name}.${ext}`);
    if (fs.existsSync(f)) { buf = fs.readFileSync(f); break; }
  }
  if (!buf) {
    const u = S.get('audio_' + name);
    if (u) {
      try { buf = /jumpshare\.com\/share\//i.test(u) ? await fromJumpshare(u) : await U.getBuffer(u); }
      catch (e) { console.error(`🔇 audio "${name}":`, e.message); }
    }
  }
  if (buf) cache.set(name, buf);
  return buf;
}

async function sendVoice(sock, jid, name, opts = {}) {
  const buf = await load(name);
  if (!buf) return false;
  await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: true }, opts);
  return true;
}
const invalidate = () => cache.clear();
const preload = () => Promise.all(['alive', 'mk'].map((n) => load(n).catch(() => {})));

module.exports = { load, sendVoice, invalidate, preload };
