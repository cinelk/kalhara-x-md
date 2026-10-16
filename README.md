# KALHARA X MD – WhatsApp Mini Bot

## Commands
| Command | විස්තරය |
|---|---|
| `.song lelena` | නමෙන් සොයලා සින්දුව (audio) එවනවා |
| `.song <YouTube link>` | link එකේ audio එක එවනවා |
| `.video cctv song` | නමෙන් සොයලා video එක එවනවා |
| `.video <YouTube link>` | link එකේ video එක එවනවා |
| `.movie Spiderman` | චිත්‍රපට විස්තර |
| `.menu` `.ping` `.alive` `.tagall` | වෙනත් |

## Run (Node 20+)
```bash
npm install
node index.js
```
`yt-dlp` auto බාගත වෙනවා (`bin/` folder එකට). Browser එකේ `http://localhost:3000` open කරලා WhatsApp number එකට pair code එක ගන්න.

## YouTube block වුණොත්
Colab වගේ datacenter IP වලට YouTube "Sign in to confirm you're not a bot" දෙන්න පුළුවන්.
Browser එකකින් YouTube export කරලා ගත්ත `cookies.txt` (Netscape format) එක bot folder එකේ දාන්න. (Git එකට upload කරන්න එපා!)
