'use strict';
// All settings can be changed with environment variables (Koyeb → Environment variables)
module.exports = {
  PREFIX: process.env.PREFIX || '.',
  BOT_NAME: process.env.BOT_NAME || 'KALHARA-X-MD',
  OWNER_NAME: process.env.OWNER_NAME || 'DMP KALHARA',
  OWNER_NUMBER: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''), // e.g. 94771234567 (optional)
  ALIVE_IMG: process.env.ALIVE_IMG || 'https://i.postimg.cc/tCjcvzdQ/96029.png',
  CONNECTED_IMG: process.env.CONNECTED_IMG || 'https://i.postimg.cc/MKSL3Y0k/96032.png',
  AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN !== 'false',
  AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT !== 'false',
  MAX_DURATION_SEC: 20 * 60
};
