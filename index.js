// Messages Upsert Event (Fixing Commands Issue)
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
            
            // Extract Message Text Properly
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

            // Sub Menu Selection Logic (Replying 1, 2, 3, 4)
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
│
╰─────────────────────────────
> *KALHARA-X-MD System*
`;
                await sock.sendMessage(sender, { text: toolsText }, { quoted: msg });
                return;
            }

        } catch (err) {
            console.error('Message upsert error:', err);
        }
    });
