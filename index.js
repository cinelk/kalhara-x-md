/**
 * KALHARA-X-MD MINI BOT (Fixed & Stable Pairing Version)
 * Owner: පැතුම් කල්හාර
 */
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    normalizeMessageContent,
    getContentType,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const yts = require('yt-search');
const { execFile } = require('child_process');

// ───────── Config & Personalization ─────────
const PREFIX = '.';
const PORT = process.env.PORT || 3000;
const OWNER_NAME = 'පැතුම් කල්හාර';
const BOT_NAME = 'KALHARA-X-MD';
const AUTO_STATUS_SEEN = true;
const AUTO_STATUS_REACT = true;
const MAX_DURATION_SEC = 20 * 60;
const MAX_AUDIO_MB = 60;
const MAX_VIDEO_MB = 64;
const MENU_TAG = 'KALHARA-X MINI BOT';
const COOKIES_FILE = path.join(__dirname, 'cookies.txt');

const ALIVE_IMG = 'https://i.postimg.cc/tCjcvzdQ/96029.png';
const CONNECTED_IMG = 'https://i.postimg.cc/MKSL3Y0k/96032.png';

const authFolder = path.join(__dirname, 'auth_info');
const binDir = path.join(__dirname, 'bin');
const tmpDir = path.join(os.tmpdir(), 'kalhara-bot');
fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(authFolder, { recursive: true });

const app = express();
let sock = null;
let starting = false;
let YTDLP = 'yt-dlp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getText(msg) {
    const content = normalizeMessageContent(msg.message);
    if (!content) return '';
    const type = getContentType(content);
    return (
        (type === 'conversation' && content.conversation) ||
        (type === 'extendedTextMessage' && content.extendedTextMessage?.text) ||
        (type === 'imageMessage' && content.imageMessage?.caption) ||
        (type === 'videoMessage' && content.videoMessage?.caption) ||
        ''
    ).trim();
}

function cleanName(s) {
    return String(s).replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'media';
}

function safeUnlink(p) {
    try { p && fs.existsSync(p) && fs.unlinkSync(p); } catch (_) {}
}

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        execFile(
            cmd,
            args,
            { maxBuffer: 1024 * 1024 * 20, timeout: opts.timeout || 300000 },
            (err, stdout, stderr) => {
                if (err) {
                    err.stderr = String(stderr || '');
                    return reject(err);
                }
                resolve(String(stdout || ''));
            }
        );
    });
}

async function ensureYtDlp() {
    try {
        const v = await run(YTDLP, ['--version'], { timeout: 20000 });
        console.log('✅ yt-dlp found:', v.trim());
        return;
    } catch (_) {}

    const local = path.join(binDir, 'yt-dlp');
    fs.mkdirSync(binDir, { recursive: true });

    if (!fs.existsSync(local)) {
        const file = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
        const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${file}`;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 10 });
        fs.writeFileSync(local, Buffer.from(res.data));
        fs.chmodSync(local, 0o755);
    }
    YTDLP = local;
}

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i;
const URL_RE = /^https?:\/\/\S+$/i;

async function resolveVideo(q) {
    const m = q.match(YT_RE);
    if (m) {
        const id = m[1];
        try {
            const v = await yts({ videoId: id });
            if (v && v.title) return v;
        } catch (_) {}
        return { title: id, url: `https://www.youtube.com/watch?v=${id}`, timestamp: '', seconds: 0, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, author: { name: '' } };
    }
    if (URL_RE.test(q)) {
        return { title: 'Media', url: q, timestamp: '', seconds: 0, thumbnail: null, author: { name: '' } };
    }
    const search = await yts(q);
    return search.videos.find((v) => v.seconds > 0 && v.seconds <= MAX_DURATION_SEC) || null;
}

async function download(url, kind) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const outTpl = path.join(tmpDir, `${id}.%(ext)s`);

    const args = [
        '--no-playlist',
        '--no-warnings',
        '--socket-timeout', '20',
        '--retries', '3',
        '--max-filesize', `${kind === 'audio' ? MAX_AUDIO_MB : MAX_VIDEO_MB}M`,
        '-o', outTpl
    ];
    if (kind === 'audio') {
        args.push('-f', 'bestaudio[ext=m4a]/bestaudio');
    } else {
        args.push('-f', 'best[height<=480][ext=mp4]/best[ext=mp4]/best[height<=480]/best');
    }
    if (fs.existsSync(COOKIES_FILE)) args.push('--cookies', COOKIES_FILE);
    args.push(url);

    try {
        await run(YTDLP, args, { timeout: 5 * 60 * 1000 });
    } catch (e) {
        const err = e.stderr || e.message || '';
        const ex = new Error(err);
        ex.blocked = /Sign in to confirm|not a bot|HTTP Error 403|429|Too Many Requests/i.test(err);
        ex.tooBig = /larger than max-filesize|File is larger/i.test(err);
        throw ex;
    }

    const file = fs.readdirSync(tmpDir).find((f) => f.startsWith(id + '.') && !f.endsWith('.part'));
    if (!file) {
        const ex = new Error('output file not found');
        ex.tooBig = true;
        throw ex;
    }
    return path.join(tmpDir, file);
}

// ───────── Command Handlers ─────────
async function handleSong(sender, msg, q, pushName) {
    if (!q) {
        return sock.sendMessage(sender, { text: `🎵 *කරුණාකර සින්දුවේ නම හෝ YouTube link එක දෙන්න ${pushName}!*` }, { quoted: msg });
    }
    await sock.sendMessage(sender, { text: `🔍 *සොයමින් පවතී ${pushName}...*` }, { quoted: msg });
    let file;
    try {
        const video = await resolveVideo(q);
        if (!video) return sock.sendMessage(sender, { text: '❌ සින්දුව සොයාගත නොහැකි විය.' }, { quoted: msg });

        const info = `┏━━━━━━━━━━━━━━━━━━━━━┓\n┃ 🎵 *${video.title}*\n┗━━━━━━━━━━━━━━━━━━━━━┛\n⏱️ ${video.timestamp || 'N/A'}\n👤 Owner: ${OWNER_NAME}`;
        if (video.thumbnail) {
            await sock.sendMessage(sender, { image: { url: video.thumbnail }, caption: info }, { quoted: msg }).catch(() => {});
        }
        file = await download(video.url, 'audio');
        await sock.sendMessage(sender, {
            audio: { url: file },
            mimetype: 'audio/mp4',
            ptt: false,
            fileName: `${cleanName(video.title)}.m4a`
        }, { quoted: msg });
    } catch (err) {
        await sock.sendMessage(sender, { text: '❌ සින්දුව ඩවුන්ලෝඩ් කිරීමේදී දෝෂයක් ඇති විය.' }, { quoted: msg });
    } finally {
        safeUnlink(file);
    }
}

async function handleVideo(sender, msg, q, pushName) {
    if (!q) {
        return sock.sendMessage(sender, { text: `🎬 *කරුණාකර වීඩියෝවේ නම හෝ link එක දෙන්න ${pushName}!*` }, { quoted: msg });
    }
    await sock.sendMessage(sender, { text: `🔍 *වීඩියෝව සූදානම් කරමින් පවතී ${pushName}...*` }, { quoted: msg });
    let file;
    try {
        const video = await resolveVideo(q);
        if (!video) return sock.sendMessage(sender, { text: '❌ වීඩියෝව සොයාගත නොහැකි විය.' }, { quoted: msg });

        file = await download(video.url, 'video');
        await sock.sendMessage(sender, {
            video: { url: file },
            mimetype: 'video/mp4',
            fileName: `${cleanName(video.title)}.mp4`,
            caption: `┏━━━━━━━━━━━━━━━━━━━━━┓\n┃ 🎬 *${video.title}*\n┗━━━━━━━━━━━━━━━━━━━━━┛\n> Creator: ${OWNER_NAME}`
        }, { quoted: msg });
    } catch (err) {
        await sock.sendMessage(sender, { text: '❌ වීඩියෝව ඩවුන්ලෝඩ් කිරීමේදී දෝෂයක් ඇති විය.' }, { quoted: msg });
    } finally {
        safeUnlink(file);
    }
}

// ───────── Bot Core ─────────
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
            browser: [BOT_NAME, 'Chrome', '20.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: true
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log('\n🎉 [SUCCESS] Bot Connected Successfully!\n');
                try {
                    const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    await sock.sendMessage(userJid, {
                        image: { url: CONNECTED_IMG },
                        caption: 
`┏━━━━━━━━━━━━━━━━━━━━━┓
┃  🚀 ${BOT_NAME} ONLINE 🚀
┗━━━━━━━━━━━━━━━━━━━━━┛
👋 ආයුබෝවන් ${OWNER_NAME}!
ඔබගේ බොට් පද්ධතිය සාර්ථකව සක්‍රීය විය! 🎉`
                    });
                    await sock.sendMessage(userJid, {
                        audio: { url: 'https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3' },
                        mimetype: 'audio/mp4',
                        ptt: true
                    });
                } catch (e) {}
            } else if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (_) {}
                }
                starting = false;
                setTimeout(startBot, 3000);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const msg of messages) {
                try {
                    await handleMessage(msg);
                } catch (err) {
                    console.error('Message error:', err);
                }
            }
        });
    } catch (e) {
        starting = false;
        setTimeout(startBot, 5000);
    }
    starting = false;
}

async function handleMessage(msg) {
    if (!msg || !msg.message) return;
    const jid = msg.key.remoteJid;
    const pushName = msg.pushName || 'යාළුවා';

    if (jid === 'status@broadcast') {
        if (!msg.key.fromMe) {
            try {
                if (AUTO_STATUS_SEEN) await sock.readMessages([msg.key]);
                if (AUTO_STATUS_REACT && msg.key.participant) {
                    await sock.sendMessage('status@broadcast', {
                        react: { text: '💚', key: msg.key }
                    }, { statusJidList: [msg.key.participant] });
                }
            } catch (_) {}
        }
        return;
    }

    const sender = jid;
    const text = getText(msg);

    if (text === '.vv') {
        try {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                const targetMsg = { key: { remoteJid: jid, id: msg.message.extendedTextMessage.contextInfo.stanzaId, participant: msg.message.extendedTextMessage.contextInfo.participant }, message: quoted };
                const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const ownerJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                if (quoted.imageMessage || quoted.viewOnceMessageV2?.message?.imageMessage) {
                    await sock.sendMessage(ownerJid, { image: buffer, caption: `📥 *Saved View Once Photo*\n👤 From: ${pushName}\n💎 Owner: ${OWNER_NAME}` });
                } else if (quoted.videoMessage || quoted.viewOnceMessageV2?.message?.videoMessage) {
                    await sock.sendMessage(ownerJid, { video: buffer, caption: `📥 *Saved View Once Video*\n👤 From: ${pushName}\n💎 Owner: ${OWNER_NAME}` });
                }
                await sock.sendMessage(sender, { text: `✅ View Once මීඩියා එක ${OWNER_NAME} වෙත යවන ලදී!` }, { quoted: msg });
            }
        } catch (e) {
            await sock.sendMessage(sender, { text: '❌ View Once ලබාගැනීමේ දෝෂයක්.' }, { quoted: msg });
        }
        return;
    }

    if (text === '.save') {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted) {
            try {
                const targetMsg = { key: { remoteJid: 'status@broadcast', id: msg.message.extendedTextMessage.contextInfo.stanzaId, participant: msg.message.extendedTextMessage.contextInfo.participant }, message: quoted };
                const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const ownerJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                if (quoted.imageMessage) {
                    await sock.sendMessage(ownerJid, { image: buffer, caption: `📌 *Saved Status from ${pushName}*\n🤖 ${BOT_NAME}` });
                } else if (quoted.videoMessage) {
                    await sock.sendMessage(ownerJid, { video: buffer, caption: `📌 *Saved Status from ${pushName}*\n🤖 ${BOT_NAME}` });
                }
                await sock.sendMessage(sender, { text: `✅ ස්ටේටස් එක ${OWNER_NAME} වෙත යවන ලදී!` }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(sender, { text: '❌ ස්ටේටස් ඩවුන්ලෝඩ් කරගත නොහැකි විය.' }, { quoted: msg });
            }
        }
        return;
    }

    if (!text) return;

    const isCmd = text.startsWith(PREFIX);
    const parts = text.slice(PREFIX.length).trim().split(/\s+/);
    const command = isCmd ? (parts.shift() || '').toLowerCase() : '';
    const q = isCmd ? parts.join(' ') : '';

    if (!isCmd) return;

    switch (command) {
        case 'ping': {
            const start = Date.now();
            const sent = await sock.sendMessage(sender, { text: '🏓 Pinging...' }, { quoted: msg });
            const ms = Date.now() - start;
            await sock.sendMessage(sender, { text: `⚡ *${BOT_NAME} Latency:* \`${ms}ms\`\n👤 Owner: ${OWNER_NAME}`, edit: sent.key });
            break;
        }

        case 'alive':
            await sock.sendMessage(sender, {
                image: { url: ALIVE_IMG },
                caption: 
`┏━━━━━━━━━━━━━━━━━━━━━┓
┃  🤖 ${BOT_NAME} ACTIVE 🤖
┗━━━━━━━━━━━━━━━━━━━━━┛
👋 ආයුබෝවන් ${pushName}!
💎 Owner: ${OWNER_NAME}
⚡ Status: Fast & Online 🟢

📌 .menu ලෙස ටයිප් කර පහසුකම් ලබාගන්න.`
            }, { quoted: msg });

            await sock.sendMessage(sender, {
                audio: { url: 'https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3' },
                mimetype: 'audio/mp4',
                ptt: true
            }, { quoted: msg });
            break;

        case 'menu':
        case 'help':
            await sock.sendMessage(sender, {
                image: { url: ALIVE_IMG },
                caption:
`┏━━━━━━━━━━━━━━━━━━━━━┓
┃  🤖 ${MENU_TAG} 🤖
┗━━━━━━━━━━━━━━━━━━━━━┛
┃ 👤 Owner: ${OWNER_NAME}
┃ ⚡ Status: Online
┗━━━━━━━━━━━━━━━━━━━━━┛

👋 හායි ${pushName}! මෙන්න මගේ පහසුකම්:

[1] 🎵 Song Downloader (.song <name>)
[2] 🎬 Video Downloader (.video <name>)
[3] 👀 View Once Saver (.vv - Reply to View Once)
[4] 📌 Status Saver (.save - Reply to Status)

> Powered by ${OWNER_NAME}`
            }, { quoted: msg });
            break;

        case 'song':
        case 'play':
            await handleSong(sender, msg, q, pushName);
            break;

        case 'video':
        case 'mp4':
            await handleVideo(sender, msg, q, pushName);
            break;
    }
}

// ───────── Web server & Robust Pairing Routes ─────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/pair', async (req, res) => {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.json({ error: 'WhatsApp අංකය ඇතුළත් කර නැත!' });

    // Wait until sock is initialized
    let retries = 10;
    while (!sock && retries > 0) {
        await sleep(1000);
        retries--;
    }

    if (!sock) {
        return res.json({ error: 'සර්වර් එක තවමත් සූදානම් වෙමින් පවතී. තත්පර 10කින් නැවත උත්සාහ කරන්න.' });
    }

    try {
        if (sock.authState.creds.registered) {
            return res.json({ error: 'දැනටමත් බොට් කනෙක්ට් කර ඇත!' });
        }
        await sleep(2000);
        let code = await sock.requestPairingCode(phone);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ code });
    } catch (e) {
        console.error('Pairing error:', e.message);
        return res.json({ error: 'Pairing Code ලබාගැනීමේ දෝෂයක්. අංකය රටේ කේතය සමඟ නිවැරදිව ඇතුළත් කරන්න (උදා: 9477xxxxxxx).' });
    }
});

app.get('/health', (req, res) => res.send('OK'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🌐 [WEB] KALHARA-X-MD Web Server running on port ${PORT}`);
});

ensureYtDlp().finally(() => startBot());
