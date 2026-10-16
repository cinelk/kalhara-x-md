/**
 * KALHARA-X-MD MINI BOT (yt-dlp version)
 * Commands: .song / .play, .video / .mp4, .movie, .menu, .ping, .alive, .tagall
 *
 * .song lelena            -> සින්දුව search කරලා audio එක එවනවා
 * .song <youtube url>     -> ඒ link එකේ audio එක එවනවා
 * .video cctv song        -> video එක search කරලා එවනවා
 * .video <youtube url>    -> ඒ link එකේ video එක එවනවා
 */
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    normalizeMessageContent,
    getContentType
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const yts = require('yt-search');
const { execFile } = require('child_process');

// ───────── Config ─────────
const PREFIX = '.';
const PORT = process.env.PORT || 3000;
const AUTO_STATUS_SEEN = true;
const AUTO_STATUS_REACT = false;
const MAX_DURATION_SEC = 20 * 60;      // විනාඩි 20ට වැඩි ඒවා skip
const MAX_AUDIO_MB = 60;
const MAX_VIDEO_MB = 64;
const MENU_TAG = 'KALHARA-X MINI BOT';
const COOKIES_FILE = path.join(__dirname, 'cookies.txt'); // optional (YouTube block වුණොත්)

const authFolder = path.join(__dirname, 'auth_info');
const binDir = path.join(__dirname, 'bin');
const tmpDir = path.join(os.tmpdir(), 'kalhara-bot');
fs.mkdirSync(tmpDir, { recursive: true });

const app = express();
let sock = null;
let starting = false;
let YTDLP = 'yt-dlp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── Helpers ─────────
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

function getQuotedText(msg) {
    const content = normalizeMessageContent(msg.message);
    const q = content?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!q) return '';
    return q.conversation || q.extendedTextMessage?.text || '';
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

// ───────── yt-dlp setup (auto download if missing) ─────────
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
        console.log('⬇️  yt-dlp බාගත කරමින්...', url);
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxRedirects: 10 });
        fs.writeFileSync(local, Buffer.from(res.data));
        fs.chmodSync(local, 0o755);
    }
    YTDLP = local;

    try {
        await run(YTDLP, ['-U'], { timeout: 60000 }); // update (standalone binary only)
    } catch (_) {}

    const v = await run(YTDLP, ['--version'], { timeout: 20000 });
    console.log('✅ yt-dlp ready:', v.trim());
}

// ───────── Resolve query / URL -> video info ─────────
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
        // YouTube නොවන link (facebook, tiktok, ...) - yt-dlp support කරනවා නම් වැඩ කරයි
        return { title: 'Media', url: q, timestamp: '', seconds: 0, thumbnail: null, author: { name: '' } };
    }
    const search = await yts(q);
    return search.videos.find((v) => v.seconds > 0 && v.seconds <= MAX_DURATION_SEC) || null;
}

// ───────── Download with yt-dlp ─────────
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
        // ffmpeg නැතුවත් වැඩ කරන single-file mp4 (≤480p)
        args.push('-f', 'best[height<=480][ext=mp4]/best[ext=mp4]/best[height<=480]/best');
    }
    if (fs.existsSync(COOKIES_FILE)) args.push('--cookies', COOKIES_FILE);
    args.push(url);

    try {
        await run(YTDLP, args, { timeout: 5 * 60 * 1000 });
    } catch (e) {
        const err = e.stderr || e.message || '';
        console.error('yt-dlp error:', err.slice(0, 600));
        const ex = new Error(err);
        ex.blocked = /Sign in to confirm|not a bot|HTTP Error 403|429|Too Many Requests/i.test(err);
        ex.tooBig = /larger than max-filesize|File is larger/i.test(err);
        throw ex;
    }

    const file = fs.readdirSync(tmpDir).find((f) => f.startsWith(id + '.') && !f.endsWith('.part'));
    if (!file) {
        const ex = new Error('output file not found');
        ex.tooBig = true; // max-filesize නිසා skip වුණා වෙන්න පුළුවන්
        throw ex;
    }
    return path.join(tmpDir, file);
}

function errorText(err, what) {
    if (err.blocked) {
        return `❌ YouTube මේ server එක block කරලා (bot check). \n\n💡 Colab/datacenter IP වලදී මේක සාමාන්‍යයි. cookies.txt එකක් දාන්න, නැත්නම් Railway/VPS/Termux එකක run කරන්න.`;
    }
    if (err.tooBig) {
        return `❌ ${what} එක ඉතා විශාලයි (WhatsApp limit එකට වඩා). කෙටි එකක් උත්සාහ කරන්න.`;
    }
    return `❌ ${what} ඩවුන්ලෝඩ් කිරීමේදී දෝෂයක් ඇති විය.`;
}

// ───────── .song / .play ─────────
async function handleSong(sender, msg, q) {
    if (!q) {
        return sock.sendMessage(sender, { text: '🎵 *සින්දුවේ නම හෝ YouTube link එක දෙන්න!*\n*උදාහරණ:*\n`.song lelena`\n`.song https://youtu.be/xxxxxxxxxxx`' }, { quoted: msg });
    }
    await sock.sendMessage(sender, { text: `🔍 *සොයමින්:* _${q}_` }, { quoted: msg });

    let file;
    try {
        const video = await resolveVideo(q);
        if (!video) {
            return sock.sendMessage(sender, { text: '❌ සින්දුව සොයාගත නොහැකි විය (නැත්නම් ඉතා දිගයි).' }, { quoted: msg });
        }
        if (video.seconds && video.seconds > MAX_DURATION_SEC) {
            return sock.sendMessage(sender, { text: '❌ මේ වීඩියෝව ඉතා දිගයි (විනාඩි 20ට වඩා).' }, { quoted: msg });
        }

        const info = `🎵 *${video.title}*\n${video.timestamp ? `⏱️ ${video.timestamp}\n` : ''}${video.author?.name ? `👤 ${video.author.name}\n` : ''}\n⬇️ Audio එක ඩවුන්ලෝඩ් වෙමින් පවතී...`;
        if (video.thumbnail) {
            await sock.sendMessage(sender, { image: { url: video.thumbnail }, caption: info }, { quoted: msg }).catch(() =>
                sock.sendMessage(sender, { text: info }, { quoted: msg })
            );
        } else {
            await sock.sendMessage(sender, { text: info }, { quoted: msg });
        }

        file = await download(video.url, 'audio');

        await sock.sendMessage(sender, {
            audio: { url: file },
            mimetype: 'audio/mp4',
            ptt: false,
            fileName: `${cleanName(video.title)}.m4a`
        }, { quoted: msg });
    } catch (err) {
        console.error('Song error:', err.message);
        await sock.sendMessage(sender, { text: errorText(err, 'සින්දුව') }, { quoted: msg });
    } finally {
        safeUnlink(file);
    }
}

// ───────── .video / .mp4 ─────────
async function handleVideo(sender, msg, q) {
    if (!q) {
        return sock.sendMessage(sender, { text: '🎬 *වීඩියෝවේ නම හෝ link එක දෙන්න!*\n*උදාහරණ:*\n`.video cctv song`\n`.video https://youtu.be/xxxxxxxxxxx`' }, { quoted: msg });
    }
    await sock.sendMessage(sender, { text: `🔍 *වීඩියෝව සොයමින්:* _${q}_\n⌛ සූදානම් කරමින් පවතී...` }, { quoted: msg });

    let file;
    try {
        const video = await resolveVideo(q);
        if (!video) {
            return sock.sendMessage(sender, { text: '❌ වීඩියෝව සොයාගත නොහැකි විය (නැත්නම් ඉතා දිගයි).' }, { quoted: msg });
        }
        if (video.seconds && video.seconds > MAX_DURATION_SEC) {
            return sock.sendMessage(sender, { text: '❌ මේ වීඩියෝව ඉතා දිගයි (විනාඩි 20ට වඩා).' }, { quoted: msg });
        }

        file = await download(video.url, 'video');

        await sock.sendMessage(sender, {
            video: { url: file },
            mimetype: 'video/mp4',
            fileName: `${cleanName(video.title)}.mp4`,
            caption: `🎬 *${video.title}*\n${video.timestamp ? `⏱️ ${video.timestamp}\n` : ''}\n> *Powered by KALHARA-X-MD*`
        }, { quoted: msg });
    } catch (err) {
        console.error('Video error:', err.message);
        await sock.sendMessage(sender, { text: errorText(err, 'වීඩියෝව') }, { quoted: msg });
    } finally {
        safeUnlink(file);
    }
}

// ───────── .movie (iTunes API) ─────────
async function handleMovie(sender, msg, q) {
    if (!q) {
        return sock.sendMessage(sender, { text: '🎬 *චිත්‍රපටයේ නම ඇතුළත් කරන්න!*\n*උදාහරණ:* `.movie Spiderman`' }, { quoted: msg });
    }
    try {
        const r = await axios.get('https://itunes.apple.com/search', {
            params: { term: q, media: 'movie', limit: 3 },
            timeout: 15000
        });
        const list = r.data?.results || [];
        if (!list.length) {
            return sock.sendMessage(sender, { text: '❌ චිත්‍රපටය සොයාගත නොහැකි විය.' }, { quoted: msg });
        }
        for (const m of list) {
            const year = m.releaseDate ? m.releaseDate.slice(0, 4) : 'N/A';
            const desc = (m.longDescription || m.shortDescription || '').slice(0, 400);
            const caption = `🎬 *${m.trackName}* (${year})\n🎭 ${m.primaryGenreName || 'N/A'}\n🔞 ${m.contentAdvisoryRating || 'N/A'}\n\n📝 ${desc}`;
            const poster = (m.artworkUrl100 || '').replace('100x100', '600x600');
            if (poster) {
                await sock.sendMessage(sender, { image: { url: poster }, caption }, { quoted: msg });
            } else {
                await sock.sendMessage(sender, { text: caption }, { quoted: msg });
            }
        }
    } catch (err) {
        console.error('Movie error:', err.message);
        await sock.sendMessage(sender, { text: '❌ චිත්‍රපට සෙවීමේදී දෝෂයක් ඇති විය.' }, { quoted: msg });
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
            browser: ['Ubuntu', 'Chrome', '20.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: true
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log('\n🎉 [SUCCESS] KALHARA-X-MD MINI BOT WhatsApp සමඟ සාර්ථකව සම්බන්ධ විය!\n');
                try {
                    const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    await sock.sendMessage(userJid, {
                        text:
`╭───────────━━━━━━───────────╮
│  🚀 KALHARA-X-MD MINI BOT 🚀
╰───────────━━━━━━───────────╯

👋 ආයුබෝවන්!
ඔබගේ KALHARA-X-MD Mini Bot පද්ධතිය සක්‍රීය විය! 🎉

📌 .menu ලෙස ටයිප් කර Menu එක ලබාගන්න.`
                    });
                } catch (e) {}
            } else if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`සම්බන්ධතාවය නතර විය (Code: ${statusCode}). Reconnecting: ${shouldReconnect}`);
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
        console.error('startBot error:', e);
        starting = false;
        setTimeout(startBot, 5000);
        return;
    }
    starting = false;
}

async function handleMessage(msg) {
    if (!msg || !msg.message) return;
    const jid = msg.key.remoteJid;

    if (jid === 'status@broadcast') {
        if (msg.key.fromMe) return;
        try {
            if (AUTO_STATUS_SEEN) await sock.readMessages([msg.key]);
            if (AUTO_STATUS_REACT && msg.key.participant) {
                await sock.sendMessage('status@broadcast', {
                    react: { text: '💚', key: msg.key }
                }, { statusJidList: [msg.key.participant] });
            }
        } catch (_) {}
        return;
    }

    const sender = jid;
    const text = getText(msg);
    if (!text) return;

    const isCmd = text.startsWith(PREFIX);
    const parts = text.slice(PREFIX.length).trim().split(/\s+/);
    const command = isCmd ? (parts.shift() || '').toLowerCase() : '';
    const q = isCmd ? parts.join(' ') : '';

    // Menu reply numbers
    if (!isCmd && /^[1-5]$/.test(text) && getQuotedText(msg).includes(MENU_TAG)) {
        const replies = {
            '1': '🎵 *සින්දුවක් ඩවුන්ලෝඩ් කිරීමට:*\n\n`.song` එකට පස්සේ නම හෝ YouTube link එක ටයිප් කරන්න.\n*උදාහරණය:* `.song lelena`',
            '2': '🎬 *වීඩියෝවක් ඩවුන්ලෝඩ් කිරීමට:*\n\n`.video` එකට පස්සේ නම හෝ link එක ටයිප් කරන්න.\n*උදාහරණය:* `.video cctv song`',
            '3': '🎬 *චිත්‍රපටයක් සෙවීමට:*\n\n`.movie` එකට පස්සේ නම ටයිප් කරන්න.\n*උදාහරණය:* `.movie Spiderman`',
            '4': '👥 *ගෲප් කමාන්ඩ්ස්:*\n\n├ *.tagall* - ගෲප් එකේ හැමෝම Tag කිරීමට',
            '5': '⚡ *Bot Status:* Online 🟢\n📌 `.ping` / `.alive` භාවිතා කරන්න'
        };
        return sock.sendMessage(sender, { text: replies[text] }, { quoted: msg });
    }

    if (!isCmd) return;

    switch (command) {
        case 'ping': {
            const start = Date.now();
            const sent = await sock.sendMessage(sender, { text: '🏓 Pinging...' }, { quoted: msg });
            const ms = Date.now() - start;
            await sock.sendMessage(sender, { text: `⚡ *KALHARA-X-MD Latency:* \`${ms}ms\` 🚀`, edit: sent.key });
            break;
        }

        case 'alive':
            await sock.sendMessage(sender, {
                text: `👋 KALHARA-X-MD Active! 🤖\n👤 Developer: DMP • KALHARA 💎\n📌 Type .menu for Mini-Bot Menu!`
            }, { quoted: msg });
            break;

        case 'menu':
        case 'help':
            await sock.sendMessage(sender, {
                text:
`┌──────────────────────────┐
│  🤖 ${MENU_TAG} 🤖
└──────────────────────────┘
│ 👤 Owner: DMP • KALHARA
│ ⚡ Status: Online
└──────────────────────────┘

👇 අවශ්‍ය අංකය මේ message එකට Reply කරන්න:

[1] 🎵 Song Downloader (.song)
[2] 🎬 Video Downloader (.video)
[3] 🎬 Movie Search (.movie)
[4] 👥 Group Commands
[5] 🛠️ Bot Status (.ping / .alive)

───────────────
</> Powered by DMP KALHARA`
            }, { quoted: msg });
            break;

        case 'song':
        case 'play':
            await handleSong(sender, msg, q);
            break;

        case 'video':
        case 'mp4':
            await handleVideo(sender, msg, q);
            break;

        case 'movie':
            await handleMovie(sender, msg, q);
            break;

        case 'tagall': {
            if (!sender.endsWith('@g.us')) {
                return sock.sendMessage(sender, { text: '❌ මෙම කමාන්ඩ් එක භාවිතා කළ හැක්කේ ගෲප් ඇතුළත පමණි!' }, { quoted: msg });
            }
            const meta = await sock.groupMetadata(sender);
            const mentions = meta.participants.map((p) => p.id);
            let t = `📢 *TAGGING ALL MEMBERS*\n\n👥 *Group:* ${meta.subject}\n\n`;
            for (const id of mentions) t += `👉 @${id.split('@')[0]}\n`;
            await sock.sendMessage(sender, { text: t, mentions }, { quoted: msg });
            break;
        }
    }
}

// ───────── Web server (Pairing) ─────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/pair', async (req, res) => {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.json({ error: 'WhatsApp අංකය ඇතුළත් කර නැත!' });
    if (!sock) return res.json({ error: 'සර්වර් එක සූදානම් වෙමින් පවතී. තත්පර කීපයකින් නැවත උත්සාහ කරන්න.' });

    try {
        if (sock.authState.creds.registered) {
            return res.json({ error: 'දැනටමත් සම්බන්ධ කර ඇත!' });
        }
        await sleep(3000);
        let code = await sock.requestPairingCode(phone);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ code });
    } catch (e) {
        console.error('Pairing error:', e.message);
        return res.json({ error: 'Pairing Code එක ලබාගැනීමට නොහැකි විය. අංකය නිවැරදිදැයි බලන්න (රට කේතය සමඟ).' });
    }
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
    console.log(`\n🌐 [WEB] KALHARA-X-MD Web Server running on port ${PORT}`);
    console.log(`👉 Open: http://localhost:${PORT}\n`);
});

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

// tmp folder එකේ පරණ files අයින් කරන්න (විනාඩි 30කට වඩා පරණ)
setInterval(() => {
    try {
        for (const f of fs.readdirSync(tmpDir)) {
            const p = path.join(tmpDir, f);
            if (Date.now() - fs.statSync(p).mtimeMs > 30 * 60 * 1000) safeUnlink(p);
        }
    } catch (_) {}
}, 10 * 60 * 1000);

ensureYtDlp()
    .catch((e) => console.error('⚠️ yt-dlp setup failed:', e.message))
    .finally(() => startBot());
