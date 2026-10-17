/**
 * KALHARA-X-MD – CORE (one WhatsApp connection + command router + pair website)
 * Every command lives in ./commands/*.js — editing or breaking one file never stops the others.
 */
const {
    default: makeWASocket,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const path = require('path');

const C = require('./lib/config');
const U = require('./lib/utils');
const S = require('./lib/settings');
const { useAuthState } = require('./lib/authstore');
const M = require('./lib/media');

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && e.message ? e.message : e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e && e.message ? e.message : e));

const PORT = process.env.PORT || 3000;
const authFolder = path.join(__dirname, 'auth_info');
fs.mkdirSync(authFolder, { recursive: true });

const app = express();
let sock = null;
let starting = false;
let currentQR = null;
let lastPair = null;
let authClear = async () => {};
const seen = new Set();
const replied = new Map(); // status-reply cooldown per contact

// ───────── Command loader (each file is loaded separately) ─────────
const registry = new Map();
const commandList = [];
const hooks = [];

function loadCommands() {
    const dir = path.join(__dirname, 'commands');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
        try {
            const mod = require(path.join(dir, f));
            const arr = Array.isArray(mod) ? mod : [];
            for (const c of arr) {
                if (!c || !c.name || typeof c.run !== 'function') continue;
                commandList.push(c);
                for (const n of [c.name, ...(c.alias || [])]) registry.set(n.toLowerCase(), c);
            }
            if (typeof mod.onMessage === 'function') hooks.push({ file: f, fn: mod.onMessage });
            console.log(`✅ commands/${f} loaded (${arr.length})`);
        } catch (e) {
            console.error(`⚠️ commands/${f} FAILED to load → ${e.message} (other files keep working)`);
        }
    }
}

// ───────── Message router ─────────
async function handleMessage(msg) {
    if (!msg || !msg.message || !msg.key) return;
    const jid = msg.key.remoteJid;
    if (!jid) return;

    if (jid === 'status@broadcast') {
        if (!msg.key.fromMe) {
            const who = msg.key.participant;
            try {
                if (S.on('status_seen')) await sock.readMessages([msg.key]);
                if (S.on('status_react') && who) {
                    await sock.sendMessage('status@broadcast', { react: { text: S.get('status_emoji'), key: msg.key } }, { statusJidList: [who] });
                }
                // friendly reply to the status – max once per contact every 6 hours (avoids spam / ban risk)
                if (S.on('status_reply') && who && U.num(who) !== U.num(sock.user.id)) {
                    if (Date.now() - (replied.get(who) || 0) > 6 * 3600 * 1000) {
                        replied.set(who, Date.now());
                        await U.sleep(1500 + Math.random() * 2500);
                        await sock.sendMessage(who, { text: S.get('status_reply_text') }, { quoted: msg });
                    }
                }
            } catch (_) {}
        }
        return;
    }
    if (jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) return;

    const text = U.getText(msg);
    const isGroup = jid.endsWith('@g.us');
    const botJid = jidNormalizedUser(sock.user.id);
    const sender = msg.key.fromMe ? botJid : (isGroup ? (msg.key.participant || '') : jid);
    const isOwner = !!msg.key.fromMe || U.num(sender) === U.num(botJid) || (C.OWNER_NUMBER && U.num(sender) === C.OWNER_NUMBER);

    const ctx = {
        sock, msg, jid, isGroup, sender, botJid, isOwner, text,
        pushName: msg.pushName || 'යාළුවා',
        quoted: U.getQuoted(msg),
        commands: commandList,
        reply: (t) => sock.sendMessage(jid, { text: t }, { quoted: msg }),
        react: (e) => sock.sendMessage(jid, { react: { text: e, key: msg.key } }).catch(() => {})
    };

    for (const h of hooks) {
        try { await h.fn(ctx); } catch (e) { console.error(`hook ${h.file}:`, e.message); }
    }

    if (!text.startsWith(C.PREFIX)) return;
    const body = text.slice(C.PREFIX.length).trim();
    const command = (body.split(/\s+/)[0] || '').toLowerCase();
    ctx.command = command;
    ctx.q = body.slice(command.length).trim();
    ctx.args = ctx.q ? ctx.q.split(/\s+/) : [];

    const c = registry.get(command);
    if (!c) return;

    try {
        if (c.owner && !isOwner) return await ctx.reply('🔒 This command is only for the bot owner.');
        if (c.groupOnly && !isGroup) return await ctx.reply('👥 This command works in groups only.');
        if (isGroup && (c.admin || c.botAdmin)) {
            Object.assign(ctx, await U.groupInfo(sock, jid, msg));
            if (c.admin && !(isOwner || ctx.isSenderAdmin)) return await ctx.reply('🛡️ Only group admins can use this.');
            if (c.botAdmin && !ctx.isBotAdmin) return await ctx.reply('⚠️ Please make me a group admin first.');
        }
        await c.run(ctx);
    } catch (e) {
        console.error(`[${command}] error:`, e && e.stderr ? e.stderr : e);
        await ctx.reply('❌ ' + U.errText(e)).catch(() => {});
    }
}


function connectedText() {
    const n = U.num(sock.user.id);
    const t = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Colombo', hour12: true });
    return `╭──────⟡ ⚡ KALHARA X MD ⚡ ⟡──────╮\n│ ✅ Connected • සම්බන්ධ විය\n╰───────────────────────╯\n\n👋 Hi ${S.get('owner_name')}! • ආයුබෝවන්!\n🚀 Your bot is online & ready\n    ඔබේ බොට් දැන් ක්‍රියාත්මකයි\n\n┏━━ 📋 BOT DETAILS ━━┓\n┃ 🏷️ Name     : ${S.get('bot_name')}\n┃ 👑 Owner    : ${S.get('owner_name')}\n┃ 📞 Number   : +${n}\n┃ 🔣 Prefix   : ${C.PREFIX}\n┃ 🧩 Commands : ${commandList.length}\n┃ 🕒 Time     : ${t}\n┃ 🟢 Status   : Online\n┗━━━━━━━━━━━━━━━━━━┛\n\n📜 ${C.PREFIX}menu • මෙනුව බලන්න\n\n🔗 Get your own bot — connect via our site 👇\n${S.get('site_url')}`;
}

// ───────── WhatsApp connection ─────────
async function startBot() {
    if (starting) return;
    starting = true;
    try {
        const { state, saveCreds, clear } = await useAuthState(authFolder);
        authClear = clear;
        let version;
        try { ({ version } = await fetchLatestBaileysVersion()); } catch (_) {}

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            },
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
            markOnlineOnConnect: false,
            shouldSyncHistoryMessage: () => false,
            emitOwnEvents: false,
            keepAliveIntervalMs: 25000,
            cachedGroupMetadata: async (jid) => { const h = U.gcache.get(jid); return h ? h.m : undefined; }
        });
        const me = sock;
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('groups.update', (u) => u.forEach((g) => g.id && U.gcache.delete(g.id)));
        sock.ev.on('group-participants.update', (g) => U.gcache.delete(g.id));

        sock.ev.on('connection.update', async (update) => {
            if (sock !== me) return; // ignore stale sockets
            const { connection, lastDisconnect, qr } = update;
            if (qr) currentQR = qr;
            if (connection === 'open') {
                currentQR = null;
                console.log('\n🎉 [SUCCESS] Bot Connected Successfully!\n');
                M.preload();
                if (S.on('connect_msg')) {
                    try {
                        await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: S.get('img_connected') }, caption: connectedText() });
                    } catch (_) {}
                }
            } else if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log('❌ Connection closed. Code:', statusCode, '|', lastDisconnect?.error?.message);
                currentQR = null;
                lastPair = null;
                if (statusCode === DisconnectReason.loggedOut) {
                    try { await authClear(); } catch (_) {}
                }
                starting = false;
                // 515 = restart required (normal right after a successful pair)
                setTimeout(startBot, statusCode === DisconnectReason.restartRequired ? 500 : 3000);
            }
        });

        sock.ev.on('messages.upsert', ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const msg of messages) {
                const id = msg.key && msg.key.id;
                if (id) {
                    if (seen.has(id)) continue;
                    seen.add(id);
                    if (seen.size > 2000) seen.delete(seen.values().next().value);
                }
                // not awaited → a long download never blocks other commands
                handleMessage(msg).catch((err) => console.error('Message error:', err && err.message ? err.message : err));
            }
        });
    } catch (e) {
        console.error('startBot error:', e.message);
        starting = false;
        setTimeout(startBot, 5000);
        return;
    }
    starting = false;
}

// ───────── Web server (pair website) ─────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/qr-raw', (req, res) => res.json({ qr: currentQR || null }));

app.get('/pair', async (req, res) => {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.json({ error: 'WhatsApp අංකය ඇතුළත් කර නැත!' });
    if (phone.startsWith('0')) return res.json({ error: 'අංකය 0 න් පටන් ගන්න එපා. රට කේතය සමඟ ගහන්න (උදා: 94771234567).' });
    if (phone.length < 10 || phone.length > 15) return res.json({ error: 'අංකය වැරදියි. රට කේතය සමඟ සම්පූර්ණ අංකය ගහන්න (උදා: 94771234567).' });

    // Same number within 60s -> same code (a new code would invalidate the old one)
    if (lastPair && lastPair.phone === phone && Date.now() - lastPair.at < 60000) {
        return res.json({ code: lastPair.code });
    }
    if (sock?.authState?.creds?.registered) {
        return res.json({ error: 'දැනටමත් බොට් කනෙක්ට් කර ඇත!' });
    }
    // Wait until the socket is connected and ready (QR event fired)
    for (let i = 0; i < 20 && !(sock && currentQR); i++) await U.sleep(1000);
    if (!sock || !currentQR) {
        return res.json({ error: 'සර්වර් එක තවමත් සූදානම් නැහැ. තත්පර 15කින් නැවත උත්සාහ කරන්න.' });
    }
    try {
        let code = await sock.requestPairingCode(phone);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        lastPair = { phone, code, at: Date.now() };
        return res.json({ code });
    } catch (e) {
        console.error('Pairing error:', e.message);
        return res.json({ error: 'Pairing Code ලබාගැනීමේ දෝෂයක් (' + e.message + '). තත්පර 10කින් නැවත උත්සාහ කරන්න.' });
    }
});

app.get('/health', (req, res) => res.send('OK'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`\n🌐 [WEB] ${C.BOT_NAME} Web Server running on port ${PORT}`));

// Keep the free Koyeb instance awake (traffic through its public URL stops "scale to zero")
const PUB = process.env.PUBLIC_URL || (process.env.KOYEB_PUBLIC_DOMAIN ? 'https://' + process.env.KOYEB_PUBLIC_DOMAIN : '');
if (PUB) setInterval(() => U.http.get(PUB + '/health', { timeout: 15000 }).catch(() => {}), 4 * 60 * 1000);

loadCommands();
startBot(); // start immediately – yt-dlp is prepared in the background
U.ensureYtDlp().catch((e) => console.error('yt-dlp setup failed:', e.message));
