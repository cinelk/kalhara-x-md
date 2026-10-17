'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const axios = require('axios');
const pino = require('pino');
const { normalizeMessageContent, getContentType, downloadMediaMessage } = require('@whiskeysockets/baileys');

const logger = pino({ level: 'silent' });
const tmpDir = path.join(os.tmpdir(), 'kalhara-bot');
const dataDir = path.join(__dirname, '..', 'data');
const binDir = path.join(__dirname, '..', 'bin');
const COOKIES = path.join(__dirname, '..', 'cookies.txt');
fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const http = axios.create({ timeout: 30000, maxRedirects: 10, headers: { 'User-Agent': UA } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url, params, headers) => (await http.get(url, { params, headers })).data;
const getBuffer = async (url, headers) =>
  Buffer.from((await http.get(url, { responseType: 'arraybuffer', headers, maxContentLength: 100 * 1024 * 1024 })).data);
const num = (j) => String(j || '').split('@')[0].split(':')[0];
const cleanName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'media';
const safeUnlink = (p) => { try { p && fs.existsSync(p) && fs.unlinkSync(p); } catch (_) {} };
const cleanup = (files) => (files || []).forEach(safeUnlink);

// ───────── Tiny JSON store (data/<name>.json) ─────────
function store(name) {
  const f = path.join(dataDir, name + '.json');
  let d = {};
  try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) {}
  return {
    get: (k) => d[k],
    set: (k, v) => { d[k] = v; try { fs.writeFileSync(f, JSON.stringify(d)); } catch (_) {} }
  };
}

// ───────── Message helpers ─────────
function textOf(content) {
  if (!content) return '';
  const t = getContentType(content);
  const n = content[t];
  return String(typeof n === 'string' ? n : (n && (n.text || n.caption)) || '').trim();
}
const contentOf = (message) => normalizeMessageContent(message);
const getText = (msg) => textOf(contentOf(msg.message));
function getContext(content) {
  const t = content && getContentType(content);
  return t ? content[t]?.contextInfo : undefined;
}
function getQuoted(msg) {
  const ci = getContext(contentOf(msg.message));
  if (!ci || !ci.quotedMessage) return null;
  return {
    raw: ci.quotedMessage,
    message: normalizeMessageContent(ci.quotedMessage), // view-once wrappers removed
    key: { remoteJid: ci.remoteJid || msg.key.remoteJid, id: ci.stanzaId, participant: ci.participant }
  };
}
const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
function mediaInfo(content) {
  if (!content) return null;
  const t = getContentType(content);
  return MEDIA_TYPES.includes(t) ? { type: t, node: content[t] } : null;
}
// media in the message itself (e.g. photo + caption) or in the replied message
function pickMedia(ctx, types) {
  const own = contentOf(ctx.msg.message);
  let i = mediaInfo(own);
  if (i && types.includes(i.type)) return { key: ctx.msg.key, message: own, info: i };
  if (ctx.quoted) {
    i = mediaInfo(ctx.quoted.message);
    if (i && types.includes(i.type)) return { key: ctx.quoted.key, message: ctx.quoted.message, info: i };
  }
  return null;
}
const downloadMsg = (sock, key, message) =>
  downloadMediaMessage({ key, message }, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });

function sendBuffer(sock, to, type, buf, node = {}, caption = '', opts = {}) {
  let m;
  if (type === 'imageMessage') m = { image: buf, caption };
  else if (type === 'videoMessage') m = { video: buf, caption, mimetype: node.mimetype };
  else if (type === 'audioMessage') m = { audio: buf, mimetype: node.mimetype || 'audio/mp4', ptt: !!node.ptt };
  else if (type === 'stickerMessage') m = { sticker: buf };
  else m = { document: buf, mimetype: node.mimetype || 'application/octet-stream', fileName: node.fileName || 'file', caption };
  return sock.sendMessage(to, m, opts);
}

// ───────── Groups (cached → much faster) ─────────
const gcache = new Map();
async function groupMeta(sock, jid) {
  const h = gcache.get(jid);
  if (h && Date.now() - h.t < 300000) return h.m;
  const m = await sock.groupMetadata(jid);
  gcache.set(jid, { m, t: Date.now() });
  return m;
}
const idsOf = (p) => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(num);
async function groupInfo(sock, jid, msg) {
  const meta = await groupMeta(sock, jid);
  const me = [sock.user?.id, sock.user?.lid].filter(Boolean).map(num);
  const k = msg.key;
  const snd = [k.participant, k.participantAlt, k.participantPn].filter(Boolean).map(num);
  const has = (p, list) => idsOf(p).some((x) => x && list.includes(x));
  const bp = meta.participants.find((p) => has(p, me));
  const sp = k.fromMe ? bp : meta.participants.find((p) => has(p, snd));
  return { meta, isBotAdmin: !!(bp && bp.admin), isSenderAdmin: !!(sp && sp.admin) };
}

// ───────── yt-dlp (works for 1000+ sites) ─────────
let YTDLP = 'yt-dlp';
const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i;
const run = (cmd, args, timeout = 300000) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 20, timeout }, (err, stdout, stderr) => {
      if (err) { err.stderr = String(stderr || ''); return reject(err); }
      resolve(String(stdout || ''));
    });
  });

async function ensureYtDlp() {
  try { console.log('✅ yt-dlp found:', (await run(YTDLP, ['--version'], 20000)).trim()); return; } catch (_) {}
  const local = path.join(binDir, 'yt-dlp');
  fs.mkdirSync(binDir, { recursive: true });
  if (!fs.existsSync(local)) {
    const file = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
    const res = await axios.get(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${file}`, { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 10 });
    fs.writeFileSync(local, Buffer.from(res.data));
    fs.chmodSync(local, 0o755);
  }
  YTDLP = local;
}

// max 2 heavy downloads at the same time (free servers have little RAM)
let active = 0;
const waiting = [];
async function limit(fn) {
  if (active >= 2) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; const n = waiting.shift(); if (n) n(); }
}

async function ytdlp(url, kind = 'video') {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const args = [
    '--no-warnings', '--no-mtime', '--socket-timeout', '20', '--retries', '3', '-N', '4',
    '--max-filesize', `${kind === 'audio' ? 60 : 64}M`,
    '-o', path.join(tmpDir, `${id}_%(autonumber)02d.%(ext)s`)
  ];
  args.push(...(YT_RE.test(url) ? ['--no-playlist'] : ['--playlist-end', '5']));
  if (kind === 'audio') args.push('-f', 'bestaudio[ext=m4a]/bestaudio');
  else args.push('-f', 'best[height<=480][ext=mp4]/best[ext=mp4]/best[height<=480]/best');
  if (fs.existsSync(COOKIES)) args.push('--cookies', COOKIES);
  args.push(url);
  await limit(() => run(YTDLP, args, 5 * 60 * 1000));
  const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(id + '_') && !f.endsWith('.part')).map((f) => path.join(tmpDir, f));
  if (!files.length) throw new Error('File is too big or could not be downloaded.');
  return files;
}

const EXT = {
  video: ['mp4', 'mov', 'm4v'], audio: ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav'], image: ['jpg', 'jpeg', 'png', 'webp', 'gif']
};
async function sendFile(sock, jid, file, opts = {}, caption = '') {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (EXT.video.includes(ext)) return sock.sendMessage(jid, { video: { url: file }, mimetype: 'video/mp4', caption }, opts);
  if (EXT.audio.includes(ext)) return sock.sendMessage(jid, { audio: { url: file }, mimetype: ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4' }, opts);
  if (EXT.image.includes(ext)) return sock.sendMessage(jid, { image: { url: file }, caption }, opts);
  return sock.sendMessage(jid, { document: { url: file }, fileName: path.basename(file), mimetype: 'application/octet-stream', caption }, opts);
}
const sendItem = (sock, jid, it, opts) =>
  sock.sendMessage(jid, it.type === 'image' ? { image: { url: it.url }, caption: it.caption || '' } : { video: { url: it.url }, caption: it.caption || '' }, opts);

// ───────── Free no-key helpers for TikTok / X(Twitter) ─────────
async function tikwm(url) {
  const d = (await http.get('https://www.tikwm.com/api/', { params: { url, hd: 1 } })).data;
  if (!d || d.code !== 0 || !d.data) throw new Error('tikwm failed');
  const v = d.data;
  if (v.images && v.images.length) return v.images.map((u) => ({ type: 'image', url: u }));
  return [{ type: 'video', url: v.hdplay || v.play, caption: v.title || '' }];
}
async function vxTwitter(url) {
  const m = url.match(/\/([^/]+)\/status\/(\d+)/);
  if (!m) throw new Error('bad link');
  const d = (await http.get(`https://api.vxtwitter.com/${m[1]}/status/${m[2]}`)).data;
  const items = (d.media_extended || []).map((x) => ({ type: x.type === 'image' ? 'image' : 'video', url: x.url, caption: d.text || '' }));
  if (!items.length) throw new Error('no media');
  return items;
}

// Any link → best method → send
async function smartDownload(ctx, url, kind = 'video') {
  const { sock, jid, msg } = ctx;
  const opts = { quoted: msg };
  let items = [];
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch (_) {}
  try {
    if (host.includes('tiktok.com')) items = await tikwm(url);
    else if (/(^|\.)(twitter|x)\.com$/.test(host)) items = await vxTwitter(url);
  } catch (_) { items = []; }
  if (items.length) {
    for (const it of items.slice(0, 6)) await sendItem(sock, jid, it, opts);
    return;
  }
  const files = await ytdlp(url, kind);
  try { for (const f of files.slice(0, 6)) await sendFile(sock, jid, f, opts); } finally { cleanup(files); }
}

function errText(e) {
  const m = String((e && (e.stderr || e.message)) || e || '');
  if (/Sign in to confirm|not a bot/i.test(m)) return 'This site blocked the server. Add a cookies.txt file (see README).';
  if (/Unsupported URL/i.test(m)) return 'This link is not supported.';
  if (/private|login required|not available|unavailable|removed/i.test(m)) return 'Content is private, removed or needs login.';
  if (/larger than|too big|max-filesize/i.test(m)) return 'File is too big for WhatsApp.';
  if (/timeout|ETIMEDOUT|ECONN|ENOTFOUND/i.test(m)) return 'Network problem, please try again.';
  return String((e && e.message) || 'Something went wrong').split('\n')[0].slice(0, 160);
}

module.exports = {
  http, sleep, getJson, getBuffer, num, cleanName, safeUnlink, cleanup, store, textOf, contentOf, getText, getContext,
  getQuoted, mediaInfo, pickMedia, downloadMsg, sendBuffer, groupInfo, ensureYtDlp, ytdlp, sendFile, smartDownload,
  errText, YT_RE, UA, tmpDir, gcache, groupMeta
};
