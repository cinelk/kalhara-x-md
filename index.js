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
            console.log('\n🎉 [SUCCESS] KALHARA-X-MD WhatsApp සමඟ සාර්ථකව සම්බන්ධ විය!\n');

            try {
                const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const welcomeMsg = `
╭───────────━━━━━━───────────╮
│  🚀 *KALHARA-X-MD CONNECTED!* 🚀
╰───────────━━━━━━───────────╯

👋 *ආයුබෝවන්!* 
ඔබගේ WhatsApp ගිණුම *KALHARA-X-MD* බොට් පද්ධතිය සමඟ සාර්ථකව සම්බන්ධ විය! 🎉

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ *SYSTEM INFORMATION:*
👤 *Bot Developer:* DMP • KALHARA 💎
🤖 *Bot Name:* KALHARA-X-MD
⚡ *Status:* Online & Ultra Fast
📌 *Prefix:* [ . ]
━━━━━━━━━━━━━━━━━━━━━━━━━━
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

    // Messages Upsert Event (Commands & Downloader Logic)
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
👋 *Hey! KALHARA-X-MD is Online & Active!* 🤖

👤 *Developer:* DMP • KALHARA 💎
⚡ *Response Speed:* Super Fast
📌 *Type .menu for command list!*
`;
                await sock.sendMessage(sender, { text: aliveText }, { quoted: msg });
                return;
            }

            // Main Menu Command
            if (command === 'menu' || command === 'help') {
                const mainText = `
┌──────────────────────────┐
│    🚀 *KALHARA-X-MD BOT* 🚀    
└──────────────────────────┘
│ 👤 *Owner:* DMP • KALHARA
│ ⚡ *Status:* Active & Running
│ ⚙️ *Prefix:* [ . ]
└──────────────────────────┘

⚡ *COMMAND CATEGORIES:*
  [1] 🛠️ *General Cmd List*
  [2] 👥 *Group Cmd List*
  [3] 📥 *Download Cmd List*
  [4] 🎨 *Tools & Fun List*

📌 _Reply with the number (1-4) to select category!_
`;
                await sock.sendMessage(sender, { text: mainText }, { quoted: msg });
                return;
            }

            // Sub Menu Selection Logic
            if (textMessage === '1') {
                await sock.sendMessage(sender, { text: '╭─── 🛠️ *GENERAL COMMANDS* ───\n├ 🎀 *.alive*\n├ ⚡ *.ping*\n╰─────────────────────────────' }, { quoted: msg });
                return;
            }
            if (textMessage === '2') {
                await sock.sendMessage(sender, { text: '╭─── 👥 *GROUP COMMANDS* ───\n├ 📢 *.tagall*\n╰─────────────────────────────' }, { quoted: msg });
                return;
            }
            if (textMessage === '3') {
                await sock.sendMessage(sender, { text: '╭─── 📥 *DOWNLOAD COMMANDS* ───\n├ 🎵 *.song* <name>\n├ 🎬 *.movie* <name>\n╰─────────────────────────────' }, { quoted: msg });
                return;
            }
            if (textMessage === '4') {
                await sock.sendMessage(sender, { text: '╭─── 🎨 *TOOLS & FUN* ───\n├ ✂️ *.sticker*\n╰─────────────────────────────' }, { quoted: msg });
                return;
            }


            // 🎵 Song Downloader Command (using asitha.top API)
            if (command === 'song' || command === 'play') {
                if (!q) {
                    await sock.sendMessage(sender, { text: '🎵 *කරුණාකර සින්දුවේ නම හෝ YouTube Link එක ඇතුළත් කරන්න!*\n*උදාහරණ:* `.song lelena`' }, { quoted: msg });
                    return;
                }

                await sock.sendMessage(sender, { text: `🔍 *Searching for:* _${q}_\n\n⌛ සින්දුව සෙවීම සහ ඩවුන්ලෝඩ් කිරීම සිදුකරමින් පවතී...` }, { quoted: msg });

                try {
                    let ytUrl = q;

                    // Text එකක් දුන්නොත් YouTube Search කරලා Link එක අරගන්නවා
                    if (!q.startsWith('http://') && !q.startsWith('https://')) {
                        const searchRes = await axios.get(`https://back.asitha.top/api/ytsearch?q=${encodeURIComponent(q)}`);
                        const firstVideo = searchRes.data?.result?.[0] || searchRes.data?.[0];
                        
                        if (!firstVideo || !firstVideo.url) {
                            await sock.sendMessage(sender, { text: '❌ සමාවෙන්න, අදාළ ගීතය හමුවුණේ නැත.' }, { quoted: msg });
                            return;
                        }
                        ytUrl = firstVideo.url;
                    }

                    // asitha.top YouTube Downloader API එක කැඳවීම (fx=2 for MP3 Audio)
                    const downloadRes = await axios.get(`https://back.asitha.top/api/ytapi1?url=${encodeURIComponent(ytUrl)}&fx=2&qu=128`);
                    const audioData = downloadRes.data?.result || downloadRes.data;

                    const downloadUrl = audioData?.dl_url || audioData?.download || audioData?.url;
                    const title = audioData?.title || 'Downloaded Song';

                    if (!downloadUrl) {
                        await sock.sendMessage(sender, { text: '❌ ගීතයේ audio file එක ලබාගැනීමට නොහැකි විය.' }, { quoted: msg });
                        return;
                    }

                    // Audio File එක WhatsApp එකට යැවීම
                    await sock.sendMessage(sender, {
                        audio: { url: downloadUrl },
                        mimetype: 'audio/mp4',
                        ptt: false,
                        fileName: `${title}.mp3`,
                        caption: `🎵 *${title}*\n\n> *Powered by KALHARA-X-MD*`
                    }, { quoted: msg });

                } catch (apiErr) {
                    console.error('Song download error:', apiErr);
                    await sock.sendMessage(sender, { text: '❌ සින්දුව ඩවුන්ලෝඩ් කිරීමේදී සර්වර් දෝෂයක් ඇති විය.' }, { quoted: msg });
                }
                return;
            }

                    // Send Audio File to WhatsApp
                    await sock.sendMessage(sender, {
                        audio: { url: audioUrl },
                        mimetype: 'audio/mp4',
                        ptt: false,
                        fileName: `${video.title}.mp3`,
                        caption: `🎵 *${video.title}*\n⏱️ *Duration:* ${video.timestamp}\n🔗 *Link:* ${video.url}\n\n> *Powered by KALHARA-X-MD*`
                    }, { quoted: msg });

                } catch (apiErr) {
                    console.error('Song download error:', apiErr);
                    await sock.sendMessage(sender, { text: '❌ සින්දුව ඩවුන්ලෝඩ් කිරීමේදී සර්වර් දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.' }, { quoted: msg });
                }
                return;
            }

            // 🎬 Movie / Video Search Command
            if (command === 'movie' || command === 'film') {
                if (!q) {
                    await sock.sendMessage(sender, { text: '🎬 *කරුණාකර චිත්‍රපටයේ නම ඇතුළත් කරන්න!*\n*උදාහරණ:* `.movie Spiderman`' }, { quoted: msg });
                    return;
                }
                await sock.sendMessage(sender, { text: `🔍 *Searching Movie:* _${q}_\n\n⌛ තොරතුරු සෙමින් පවතී...` }, { quoted: msg });
                await sock.sendMessage(sender, { text: `🎬 *Movie Search Results for:* ${q}\n\n📌 මෙම චිත්‍රපටයට අදාළ ලින්ක් සහ විස්තර ඉක්මනින් ලබා දෙනු ඇත.\n> *KALHARA-X-MD System*` }, { quoted: msg });
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
    console.log(`\n🌐 [WEB] KALHARA-X-MD Web Server running
