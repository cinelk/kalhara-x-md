const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const fs = require('fs');
const path = require('path');

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

            // Auto Welcome Message to Connected Number
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

🌟 *ප්‍රධාන කාර්යයන් (MAIN FEATURES):*
🎵 Media Downloader (Songs, Videos, Movies, TikTok, FB)
👥 Advanced Group Management Tools
🎨 Image to Sticker & Utility Tools
🤖 AI & Auto Status Reaction / Seen

💡 *භාවිතය සඳහා:*
ඕනෑම චැට් එකක *.menu* ලෙස ටයිප් කර යවන්න.

> 🛠️ *Developer Note:*
> හදපු කෙනාව හැමදාම මතක් කරන්න! 
> *Crafted with ❤️ by DMP • KALHARA*
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

    // Messages Upsert Event
    sock.ev.on('messages.upsert', async (m) => {
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
        const textMessage = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const cmd = textMessage.toLowerCase().split(' ')[0];
        const args = textMessage.split(' ').slice(1).join(' ');

        // Ping Command
        if (cmd === 'ping' || cmd === '.ping') {
            const start = Date.now();
            await sock.sendMessage(sender, { text: '⚡ *KALHARA-X-MD Latency:* `' + (Date.now() - start) + 'ms` 🚀' }, { quoted: msg });
            return;
        }

        // Alive Command
        if (cmd === '.alive') {
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
        if (cmd === '.menu' || cmd === '.help') {
            const mainText = `
┌──────────────────────────┐
│    🚀 *KALHARA-X-MD BOT* 🚀    
└──────────────────────────┘
│ 👤 *Owner:* DMP • KALHARA
│ ⚡ *Status:* Active & Running
│ ⚙️ *Prefix:* [ . ]
│ 📅 *Date:* ${new Date().toLocaleDateString()}
└──────────────────────────┘

⚡ *COMMAND CATEGORIES:*

  [1] 🛠️ *General Cmd List*
  [2] 👥 *Group Cmd List*
  [3] 📥 *Download Cmd List*
  [4] 🎨 *Tools & Fun List*

📌 _Reply with the number (1-4) to select category!_
📌 _ඔබට අවශ්‍ය ප්‍රවර්ගයේ අංකය Reply කරන්න!_

───────────────
*</> Powered by DMP KALHARA*
`;
            await sock.sendMessage(sender, { text: mainText }, { quoted: msg });
            return;
        }

        // Sub Menu Selection Logic
        if (textMessage === '1') {
            const genText = `
╭─── 🛠️ *GENERAL COMMANDS* ───
│
├ 🎀 *.alive* - Check if bot is online
├ ⚡ *.ping* - Test latency speed
├ ⚙️ *.settings* - Bot configuration
├ 🔒 *.privacy* - Privacy settings
├ 🖼️ *.getdp* - Get profile picture
│
╰─────────────────────────────
> *KALHARA-X-MD System*
`;
            await sock.sendMessage(sender, { text: genText }, { quoted: msg });
            return;
        }

        if (textMessage === '2') {
            const groupText = `
╭─── 👥 *GROUP COMMANDS* ───
│
├ 📢 *.tagall* - Tag all group members
├ 🚫 *.ban* - Ban member from bot
├ ✅ *.unban* - Unban member
├ 👑 *.promote* - Promote to Admin
├ 🔽 *.demote* - Demote from Admin
├ 🚪 *.kick* - Remove member
├ 🔒 *.mute* - Close group chat
├ 🔓 *.unmute* - Open group chat
├ ✏️ *.setname* - Change group title
├ 📝 *.setdesc* - Change group rules
│
╰─────────────────────────────
> *KALHARA-X-MD System*
`;
            await sock.sendMessage(sender, { text: groupText }, { quoted: msg });
            return;
        }

        if (textMessage === '3') {
            const downText = `
╭─── 📥 *DOWNLOAD COMMANDS* ───
│
├ 🎬 *.movie* <name> - Search & Download Movie
├ 🎵 *.song* <name> - Download Audio / MP3
├ 🎥 *.video* <name> - Download HD Video
├ 📱 *.tt* <url> - TikTok Video Downloader
├ 📘 *.fb* <url> - Facebook Video/Reel
├ 📦 *.apk* <app> - Download Android App
├ 🖼️ *.img* <query> - Search & HD Image Download
├ ☁️ *.mediafire* <url> - Mediafire Downloader
│
╰─────────────────────────────
> *KALHARA-X-MD System*
`;
            await sock.sendMessage(sender, { text: downText }, { quoted: msg });
            return;
        }

        if (textMessage === '4') {
            const toolsText = `
╭─── 🎨 *TOOLS & FUN COMMANDS* ───
│
├ ✂️ *.sticker* - Convert Image to Sticker
├ 🖼️ *.toimg* - Convert Sticker to Image
├ 🎧 *.tomp3* - Extract Audio from Video
├ 🔗 *.tourl* - Upload media & get public link
├ 🔤 *.fancy* <text> - Custom font styles
├ 🎭 *.emojimix* - Mix two emojis
├ 💻 *.hack* - Fake hacking prank
├ 🔲 *.toqr* - Generate QR code
│
╰─────────────────────────────
> *KALHARA-X-MD System*
`;
            await sock.sendMessage(sender, { text: toolsText }, { quoted: msg });
            return;
        }

        // Movie / Film Downloader Command Handler
        if (cmd === '.movie' || cmd === '.film') {
            if (!args) {
                await sock.sendMessage(sender, { text: '🎬 *කරුණාකර චිත්‍රපටයේ නම ඇතුළත් කරන්න!*\n*Usage:* `.movie Spiderman`' }, { quoted: msg });
                return;
            }
            await sock.sendMessage(sender, { text: `🔍 *Searching for Movie:* _${args}_\n\n⌛ චිත්‍රපටය සොයමින් පවතී, සුළු මොහොතක් රැඳී සිටින්න...` }, { quoted: msg });
            return;
        }

        // Song Downloader Command Handler
        if (cmd === '.song') {
            if (!args) {
                await sock.sendMessage(sender, { text: '🎵 *කරුණාකර සින්දුවේ නම ඇතුළත් කරන්න!*\n*Usage:* `.song Alan Walker Faded`' }, { quoted: msg });
                return;
            }
            await sock.sendMessage(sender, { text: `🎶 *Searching Song:* _${args}_\n\n⌛ ඩවුන්ලෝඩ් වෙමින් පවතී...` }, { quoted: msg });
            return;
        }

        // Tagall Command
        if (cmd === '.tagall') {
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

    });
}

startBot();

// Express Pair Route with Delay & Robust Exception Handling
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
            // Give WebSocket 4 seconds to ensure handshake is ready
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
