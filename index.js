/**
 * KALHARA-X-MD – CORE (one WhatsApp connection + command router + pair website)
 * Every command lives in ./commands/*.js — editing or breaking one file never stops the others.
 */
const {
    default: makeWASocket,
    useMultiFileAuthState,
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
const seen = new Set();

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
            try {
                if (C.AUTO_STATUS_SEEN) await sock.readMessages([msg.key]);
                if (C.AUTO_STATUS_REACT && msg.key.participant) {
                    await sock.sendMessage('status@broadcast', { react: { text: '💚', key: msg.key } }, { statusJidList: [msg.key.participant] });
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

// ───────── WhatsApp connection ─────────
async function startBot() {
    if (starting) return;
    starting = true;
    try {
        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
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
            markOnlineOnConnect: true
        });
        const me = sock;
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            if (sock !== me) return; // ignore stale sockets
            const { connection, lastDisconnect, qr } = update;
            if (qr) currentQR = qr;
            if (connection === 'open') {
                currentQR = null;
                console.log('\n🎉 [SUCCESS] Bot Connected Successfully!\n');
                try {
                    const userJid = jidNormalizedUser(sock.user.id);
                    await sock.sendMessage(userJid, {
                        image: { url: C.CONNECTED_IMG },
                        caption: `┏━━━━━━━━━━━━━━━━━━━━━┓\n┃  🚀 ${C.BOT_NAME} ONLINE 🚀\n┗━━━━━━━━━━━━━━━━━━━━━┛\n👋 ආයුබෝවන් ${C.OWNER_NAME}!\nඔබගේ බොට් පද්ධතිය සාර්ථකව සක්‍රීය විය! 🎉\n\nType ${C.PREFIX}menu to see all commands.`
                    });
                } catch (_) {}
            } else if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log('❌ Connection closed. Code:', statusCode, '|', lastDisconnect?.error?.message);
                currentQR = null;
                lastPair = null;
                if (statusCode === DisconnectReason.loggedOut) {
                    try { fs.rmSync(authFolder, { recursive: true, force: true }); fs.mkdirSync(authFolder, { recursive: true }); } catch (_) {}
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

loadCommands();
U.ensureYtDlp().catch((e) => console.error('yt-dlp setup failed:', e.message)).finally(() => startBot());
