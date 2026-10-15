const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let sock;
let isSocketOpen = false;
const authFolder = path.join(__dirname, 'auth_info');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        browser: ["Ubuntu", "Chrome", "20.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            isSocketOpen = true;
            console.log('\n🎉 [SUCCESS] KALHARA-X-MD MINI BOT WhatsApp සමඟ සාර්ථකව සම්බන්ධ විය!\n');

            try {
                const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const welcomeMsg = `
╭───────────━━━━━━───────────╮
│  🚀 *KALHARA-X-MD MINI BOT* 🚀
╰───────────━━━━━━───────────╯

👋 *ආයුබෝවන් පැතුම්!* 
ඔබගේ KALHARA-X-MD Mini Bot පද්ධතිය සක්‍රීය විය! 🎉

📌 *.menu* ලෙස ටයිප් කර Navigation Menu එක ලබාගන්න.
`;
                await sock.sendMessage(userJid, { text: welcomeMsg });
            } catch (e) {
                console.error('Welcome message sending failed:', e);
            }

        } else if (connection === 'close') {
            isSocketOpen = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`සම්බන්ධතාවය නතර විය (Code: ${statusCode}). Reconnecting:`, shouldReconnect);
            if (shouldReconnect) {
                setTimeout(startBot, 2000);
            }
        } else if (connection === 'connecting') {
            isSocketOpen = false;
        }
    });

    // Messages Upsert Event (Mini Bot Navigation & Fixed Downloader)
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;

            // Auto Status Seen / Auto Reaction
            if (msg.key.remoteJid === 'status@broadcast') {
                try {
                    await sock.readMessages([msg.key]);
                    await sock.sendMessage('status@broadcast', {
                        react: { text: '💚', key: msg.key }
                    }, { statusJidList: [msg.key.participant] });
                } catch (err) {}
                return;
            }

            const sender = msg.key.remoteJid;
            
            const messageType = Object.keys(msg.message)[0];
            const textMessage = (
                messageType === 'conversation' ? msg.message.conversation :
                messageType === 'extendedTextMessage' ? msg.message.extendedTextMessage.text :
                messageType === 'imageMessage' ? msg.message.imageMessage.caption :
                messageType === 'videoMessage' ? msg.message.videoMessage.caption : ''
            ).trim();

            if (!textMessage) return;

            const prefix = '.';
            const isCmd = textMessage.startsWith(prefix);
            const command = isCmd ? textMessage.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
            const args = textMessage.trim().split(/ +/).slice(1);
            const q = args.join(' ');

            // Ping Command
            if (command === 'ping') {
                const start = Date.now();
                await sock.sendMessage(sender, { text: '⚡ *KALHARA-X-MD Latency:* `' + (Date.now() - start) + 'ms` 🚀' }, { quoted: msg });
                return;
            }

            // Alive Command
            if (command === 'alive') {
                const aliveText = `
👋 *KALHARA-X-MD Active!* 🤖
👤 *Developer:* DMP • KALHARA 💎
⚡ *Response Speed:* Ultra Fast
📌 *Type .menu for Mini-Bot Menu!*
`;
                await sock.sendMessage(sender, { text: aliveText }, { quoted: msg });
                return;
            }

            // Mini-Bot Main Menu Command
            if (command === 'menu' || command === 'help') {
                const mainText = `
┌──────────────────────────┐
│  🤖 *KALHARA-X MINI BOT* 🤖  
└──────────────────────────┘
│ 👤 *Owner:* DMP • KALHARA
│ ⚡ *Status:* Online (24/7)
└──────────────────────────┘

👇 *ඔබට අවශ්‍ය දේ තෝරා ගැනීමට අදාළ අංකය Reply කරන්න:*

  *[1]* 🎵 *Song Downloader (.song)*
  *[2]* 🎬 *Movie Search (.movie)*
  *[3]* 👥 *Group Commands*
  *[4]* 🛠️ *Bot Status (.ping / .alive)*

───────────────
*</> Powered by DMP KALHARA*
`;
                await sock.sendMessage(sender, { text: mainText }, { quoted: msg });
                return;
            }

            // Interactive Reply Numbers Logic
            if (textMessage === '1') {
                await sock.sendMessage(sender, { text: '🎵 *සින්දුවක් ඩවුන්ලෝඩ් කිරීමට:* \n\n`.song` එකට පස්සේ සින්දුවේ නම ටයිප් කරන්න.\n*උදාහරණයක්:* `.song lelena`' }, { quoted: msg });
                return;
            }
            if (textMessage === '2') {
                await sock.sendMessage(sender, { text: '🎬 *චිත්‍රපටයක් සෙවීමට:* \n\n`.movie` එකට පස්සේ නම ටයිප් කරන්න.\n*උදාහරණයක්:* `.movie Spiderman`' }, { quoted: msg });
                return;
            }
            if (textMessage === '3') {
                await sock.sendMessage(sender, { text: '👥 *ගෲප් කමාන්ඩ්ස්:* \n\n├ *.tagall* - ගෲප් එකේ හැමෝම Tag කිරීමට' }, { quoted: msg });
                return;
            }
            if (textMessage === '4') {
                const start = Date.now();
                await sock.sendMessage(sender, { text: '⚡ *Bot Status:* Online 🟢\n⚡ *Latency:* `' + (Date.now() - start) + 'ms`' }, { quoted: msg });
                return;
            }

            // 🎵 100% FIXED SONG DOWNLOADER COMMAND
            if (command === 'song' || command === 'play') {
                if (!q) {
                    await sock.sendMessage(sender, { text: '🎵 *කරුණාකර සින්දුවේ නම ඇතුළත් කරන්න!*\n*උදාහරණ:* `.song lelena`' }, { quoted: msg });
                    return;
                }

                await sock.sendMessage(sender, { text: `🔍 *සින්දුව සොයමින් පවතී:* _${q}_\n\n⌛ මොහොතක් රැඳී සිටින්න, Audio ෆයිල් එක ලෑස්ති කරමින් පවතී...` }, { quoted: msg });

                try {
                    let videoUrl = '';
                    let videoTitle = q;

                    // Step 1: Search YouTube using Vyt Worker API
                    try {
                        const searchRes = await axios.get(`https://api.vyt.workers.dev/search?q=${encodeURIComponent(q)}`);
                        if (searchRes.data && searchRes.data.length > 0) {
                            videoUrl = searchRes.data[0].url;
                            videoTitle = searchRes.data[0].title;
                        }
                    } catch (e) {}

                    // Fallback search using asitha.top if primary fails
                    if (!videoUrl) {
                        try {
                            const bSearch = await axios.get(`https://back.asitha.top/api/ytsearch?q=${encodeURIComponent(q)}`);
                            const vData = bSearch.data?.result?.[0] || bSearch.data?.[0];
                            if (vData) {
                                videoUrl = vData.url;
                                videoTitle = vData.title || q;
                            }
                        } catch (e) {}
                    }

                    if (!videoUrl) {
                        await sock.sendMessage(sender, { text: '❌ සමාවෙන්න, අදාළ ගීතය YouTube එකෙන් සොයාගත නොහැකි විය.' }, { quoted: msg });
                        return;
                    }

                    // Step 2: Fetch Direct MP3 Audio Link
                    let audioDlUrl = '';
                    try {
                        const dlRes = await axios.get(`https://back.asitha.top/api/ytapi1?url=${encodeURIComponent(videoUrl)}&fx=2&qu=128`);
                        audioDlUrl = dlRes.data?.result?.dl_url || dlRes.data?.result?.download || dlRes.data?.dl_url;
                    } catch (e) {}

                    // Secondary backup download API
                    if (!audioDlUrl) {
                        try {
                            const altRes = await axios.get(`https://api.vyt.workers.dev/dl?url=${encodeURIComponent(videoUrl)}`);
                            audioDlUrl = altRes.data?.dl_url || altRes.data?.downloadUrl;
                        } catch (e) {}
                    }

                    if (!audioDlUrl) {
                        await sock.sendMessage(sender, { text: '❌ සින්දුවේ Audio File එක ඩවුන්ලෝඩ් කරගැනීමේ ලින්ක් එක ලබාගැනීමට නොහැකි විය.' }, { quoted: msg });
                        return;
                    }

                    // Step 3: Send MP3 Audio File to WhatsApp
                    await sock.sendMessage(sender, {
                        audio: { url: audioDlUrl },
                        mimetype: 'audio/mp4',
                        ptt: false,
                        fileName: `${videoTitle}.mp3`,
                        caption: `🎵 *${videoTitle}* \n\n> *Crafted by DMP • KALHARA*`
                    }, { quoted: msg });

                } catch (apiErr) {
                    console.error('Song Download Error:', apiErr);
                    await sock.sendMessage(sender, { text: '❌ සින්දුව ඩවුන්ලෝඩ් කිරීමේදී සර්වර් දෝෂයක් ඇති විය.' }, { quoted: msg });
                }
                return;
            }

            // Tagall Command
            if (command === 'tagall') {
                if (!sender.endsWith('@g.us')) {
                    await sock.sendMessage(sender, { text: '❌ මෙම කමාන්ඩ් එක භාවිතා කළ හැක්කේ ගෲප් ඇතුළත පමණි!' }, { quoted: msg });
                    return;
                }
                try {
                    const groupMetadata = await sock.groupMetadata(sender);
                    const participants = groupMetadata.participants;
                    let mentionText = `📢 *TAGGING ALL MEMBERS*\n\n👥 *Group:* ${groupMetadata.subject}\n\n`;
                    let mentions = [];
                    for (let mem of participants) {
                        mentionText += `👉 @${mem.id.split('@')[0]}\n`;
                        mentions.push(mem.id);
                    }
                    await sock.sendMessage(sender, { text: mentionText, mentions: mentions }, { quoted: msg });
                } catch (err) {
                    console.error(err);
                }
                return;
            }

        } catch (err) {
            console.error('Message upsert error:', err);
        }
    });
}

startBot();

// Express Pair Route
app.get('/pair', async (req, res) => {
    let phoneNumber = req.query.phone;
    if (!phoneNumber) {
        return res.json({ error: 'WhatsApp අංකය ඇතුළත් කර නැත!' });
    }

    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    if (!sock) {
        return res.json({ error: 'සර්වර් එක සූදානම් වෙමින් පවතී. තත්පර කීපයකින් නැවත උත්සාහ කරන්න.' });
    }

    try {
        if (!sock.authState.creds.registered) {
            await new Promise((resolve) => setTimeout(resolve, 4000));
            let code = await sock.requestPairingCode(phoneNumber);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            return res.json({ code: code });
        } else {
            return res.json({ error: 'මෙම අංකය දැනටමත් සම්බන්ධ කර ඇත!' });
        }
    } catch (codeErr) {
        console.error('Pairing Code Error:', codeErr);
        return res.json({ error: 'Pairing Code එක ලබාගැනීමට නොහැකි විය. අංකය නිවැරදිදැයි බලන්න.' });
    }
});

app.listen(PORT, () => {
    console.log(`\n🌐 [WEB] KALHARA-X-MD Web Server running!`);
    console.log(`👉 [URL] Open browser: http://localhost:${PORT}\n`);
});
