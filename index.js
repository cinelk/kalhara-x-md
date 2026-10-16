/**
 * KALHARA-X-MD MINI BOT (Fixed & Full Version)
 * Commands: .song / .play, .video / .mp4, .movie, .menu, .ping, .alive, .tagall
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

// ───────── Config ─────────
const PREFIX = '.';
const PORT = process.env.PORT || 3000;
const AUTO_STATUS_SEEN = true;
const AUTO_STATUS_REACT = false;
const MAX_DURATION_SEC = 20 * 60;   // විනාඩි 20ට වැඩි වීඩියෝ skip
const MENU_TAG = 'KALHARA-X MINI BOT';

const authFolder = path.join(__dirname, 'auth_info');
const tmpDir = path.join(os.tmpdir(), 'kalhara-bot');
fs.mkdirSync(tmpDir, { recursive: true });

const app = express();
let sock = null;
let starting = false;

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
    try { fs.existsSync(p) && fs.unlinkSync(p); } catch (_) {}
}

// ───────── Job Polling / Direct API Downloader for Audio (.song) ─────────
async function handleSong(sender, msg, q) {
    if (!q) {
        return sock.sendMessage(sender, { text: '🎵 *කරුණාකර සින්දුවේ නම ඇතුළත් කරන්න!*\n*උදාහරණ:* `.song lelena`' }, { quoted: msg });
    }
    await sock.sendMessage(sender, { text: `🔍 *සොයමින්:* _${q}_\n⌛ Audio ෆයිල් එක සූදානම් කරමින් පවතී...` }, { quoted: msg });

    try {
        const search = await yts(q);
        const video = search.videos.find((v) => v.seconds > 0 && v.seconds <= MAX_DURATION_SEC);
        if (!video) {
            return sock.sendMessage(sender, { text: '❌ සින්දුව සොයාගත නොහැකි විය (නැත්නම් වීඩියෝව ඉතා දිගයි).' }, { quoted: msg });
        }

        await sock.sendMessage(sender, {
            image: { url: video.thumbnail },
            caption: `🎵 *${video.title}*\n⏱️ ${video.timestamp}\n👤 ${video.author?.name || ''}\n\n⬇️ Audio එක ඩවුන්ලෝඩ් වෙමින් පවතී...`
        }, { quoted: msg });

        let downloadUrl = '';

        // Try Asitha Top API for Audio (fo: 2 = MP3)
        try {
            const backupRes = await axios.get('https://back.asitha.top/api/ytapi', {
                params: { url: video.url, fo: 2, qu: 128 },
                timeout: 15000
            });
            const bData = backupRes.data?.result || backupRes.data;
            downloadUrl = bData?.dl_url || bData?.download || bData?.url;
        } catch (e) {}

        // Fallback Vyt worker API
        if (!downloadUrl) {
            try {
                const alt = await axios.get(`https://api.vyt.workers.dev/dl?url=${encodeURIComponent(video.url)}`, { timeout: 15000 });
                downloadUrl = alt.data?.dl_url || alt.data?.downloadUrl;
            } catch (e) {}
        }

        if (!downloadUrl) {
            return sock.sendMessage(sender, { text: '❌ සින්දුවේ ඩවුන්ලෝඩ් ලින්ක් එක ලබාගැනීමට නොහැකි විය.' }, { quoted: msg });
        }

        const audioRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 60000 });
        const buffer = Buffer.from(audioRes.data);

        await sock.sendMessage(sender, {
            audio: buffer,
            mimetype: 'audio/mp4',
            ptt: false,
            fileName: `${cleanName(video.title)}.mp3`,
            caption: `🎵 *${video.title}*\n\n> *Powered by KALHARA-X-MD*`
        }, { quoted: msg });

    } catch (err) {
        console.error('Song download error:', err.message);
        await sock.sendMessage(sender, { text: '❌ සින්දුව ඩවුන්ලෝඩ් කිරීමේදී දෝෂයක් ඇති විය.' }, { quoted: msg });
    }
}

// ───────── Video Downloader (.video / .mp4) ─────────
async function handleVideo(sender, msg, q) {
    if (!q) {
        return sock.sendMessage(sender, { text: '🎬 *කරුණාකර වීඩියෝවේ නම ඇතුළත් කරන්න!*\n*උදාහරණ:* `.video cctv song`' }, { quoted: msg });
    }
    await sock.sendMessage(sender, { text: `🔍 *වීඩියෝව සොයමින්:* _${q}_\n⌛ වීඩියෝ ෆයිල් එක සූදානම් කරමින් පවතී...` }, { quoted: msg });

    try {
        const search = await yts(q);
        const video = search.videos.find((v) => v.seconds > 0 && v.seconds <= MAX_DURATION_SEC);
        if (!video) {
            return sock.sendMessage(sender, { text: '❌ වීඩියෝව සොයාගත නොහැකි විය (නැත්නම් ඉතා දිගයි).' }, { quoted: msg });
        }

        let downloadUrl = '';

        // Try Asitha Top API for Video (fo: 1 = MP4, qu: 360 or 480)
        try {
            const vidRes = await axios.get('https://back.asitha.top/api/ytapi', {
                params: { url: video.url, fo: 1, qu: 360 },
                timeout: 20000
            });
            const vData = vidRes.data?.result || vidRes.data;
            downloadUrl = vData?.dl_url || vData?.download || vData?.url;
        } catch (e) {}

        // Fallback fgmods API for video
        if (!downloadUrl) {
            try {
                const altVid = await axios.get(`https://api.fgmods.xyz/api/downloader/ytmp4?url=${encodeURIComponent(video.url)}&apikey=fg-mikey`, { timeout: 20000 });
                downloadUrl = altVid.data?.result?.dl_url || altVid.data?.result?.download;
            } catch (e) {}
        }

        if (!downloadUrl) {
            return sock.sendMessage(sender, { text: '❌ වීඩියෝ ඩවුන්ලෝඩ් ලින්ක් එක ලබාගැනීමට නොහැකි විය.' }, { quoted: msg });
        }

        await sock.sendMessage(sender, {
            video: { url: downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${cleanName(video.title)}.mp4`,
            caption: `🎬 *${video.title}*\n⏱️ ${video.timestamp}\n\n> *Powered by KALHARA-X-MD*`
        }, { quoted: msg });

    } catch (err) {
        console.error('Video download error:', err.message);
        await sock.sendMessage(sender, { text: '❌ වීඩියෝව ඩවුන්ලෝඩ් කිරීමේදී දෝෂයක් ඇති විය.' }, { quoted: msg });
    }
}

// ───────── Movie search (iTunes API) ─────────
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
            '1': '🎵 *සින්දුවක් (MP3) ඩවුන්ලෝඩ් කිරීමට:*\n\n`.song` එකට පස්සේ නම ටයිප් කරන්න.\n*උදාහරණය:* `.song lelena`',
            '2': '🎬 *වීඩියෝවක් (MP4) ඩවුන්ලෝඩ් කිරීමට:*\n\n`.video` එකට පස්සේ නම ටයිප් කරන්න.\n*උදාහරණය:* `.video song`',
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
const pairPage = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KALHARA-X-MD Pair</title>
<style>
body{font-family:system-ui;background:#0b0f19;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{background:#151b2b;padding:28px;border-radius:16px;width:min(92vw,360px);text-align:center}
input,button{width:100%;padding:12px;border-radius:10px;border:0;margin-top:12px;font-size:16px;box-sizing:border-box}
button{background:#22c55e;color:#000;font-weight:700}
#o{margin-top:16px;font-size:26px;letter-spacing:3px;font-weight:700;word-break:break-all}
</style></head><body><div class="c">
<h2>🚀 KALHARA-X-MD</h2><p>WhatsApp අංකය (රට කේතය සමඟ)</p>
<input id="p" placeholder="94771234567" inputmode="numeric">
<button onclick="g()">Get Pair Code</button><div id="o"></div></div>
<script>
async function g(){const o=document.getElementById('o');o.textContent='...';
const r=await fetch('/pair?phone='+encodeURIComponent(document.getElementById('p').value));
const d=await r.json();o.textContent=d.code||d.error;}
</script></body></html>`;

app.get('/', (req, res) => {
    const publicIndex = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
    res.type('html').send(pairPage);
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/pair', async (req, res) => {
    let phone = (req.query.phone || '').replace(/[^0-9]/g, '');
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
        return res.json({ error: 'Pairing Code එක ලබාගැනීමට නොහැකි විය. අංකය නිවැරදිදැයි බලන්න.' });
    }
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
    console.log(`\n🌐 [WEB] KALHARA-X-MD Web Server running!`);
    console.log(`👉 [URL] Open browser: http://localhost:${PORT}\n`);
});

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

startBot();
