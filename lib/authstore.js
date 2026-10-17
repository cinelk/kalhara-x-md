'use strict';
// WhatsApp login (session) storage.
//  • MONGODB_URI set  → session is kept in MongoDB (survives restarts / sleeping / redeploys)
//  • not set          → local files (lost when a free host restarts)
const fs = require('fs');
const { initAuthCreds, BufferJSON, proto, useMultiFileAuthState } = require('@whiskeysockets/baileys');

const crypto = require('crypto');
const ME = crypto.randomBytes(6).toString('hex'); // id of THIS running instance
let col = null;
let hb = null;
async function collection(uri) {
  if (col) return col;
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  col = client.db(process.env.MONGODB_DB || 'kalhara').collection('auth');
  return col;
}

async function useAuthState(folder) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('💾 Session storage: local files  (set MONGODB_URI to keep the session after restarts)');
    const r = await useMultiFileAuthState(folder);
    return { ...r, clear: async () => { try { fs.rmSync(folder, { recursive: true, force: true }); fs.mkdirSync(folder, { recursive: true }); } catch (_) {} } };
  }
  const c = await collection(uri);
  console.log('💾 Session storage: MongoDB ✅');
  const enc = (v) => JSON.stringify(v, BufferJSON.replacer);
  const read = async (id) => { const d = await c.findOne({ _id: id }); return d ? JSON.parse(d.v, BufferJSON.reviver) : null; };
  const creds = (await read('creds')) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let v = await read(`${type}-${id}`);
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            data[id] = v;
          }));
          return data;
        },
        set: async (data) => {
          const ops = [];
          for (const t of Object.keys(data)) {
            for (const id of Object.keys(data[t])) {
              const v = data[t][id];
              const _id = `${t}-${id}`;
              ops.push(v
                ? { updateOne: { filter: { _id }, update: { $set: { v: enc(v) } }, upsert: true } }
                : { deleteOne: { filter: { _id } } });
            }
          }
          if (ops.length) await c.bulkWrite(ops, { ordered: false });
        }
      }
    },
    saveCreds: () => c.updateOne({ _id: 'creds' }, { $set: { v: enc(creds) } }, { upsert: true }),
    clear: () => c.deleteMany({})
  };
}

// Only ONE instance may use the WhatsApp session at a time (Koyeb keeps the old instance alive
// for a short while during redeploys → two instances on one session = "Couldn't link device" / Bad MAC)
async function tryAcquire(c) {
  try {
    await c.updateOne({ _id: 'lock', $or: [{ owner: ME }, { until: { $lt: Date.now() } }] },
      { $set: { owner: ME, until: Date.now() + 45000 } }, { upsert: true });
    return true;
  } catch (e) {
    if (e.code === 11000) return false; // someone else holds the lock
    throw e;
  }
}
async function lockSession() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return true;
  const c = await collection(uri);
  if (!(await tryAcquire(c))) return false;
  if (!hb) {
    hb = setInterval(async () => {
      try {
        // re-creates the lock if it was deleted; exits only if ANOTHER instance really owns it
        if (!(await tryAcquire(c))) { console.error('🔒 Another instance took the session lock → exiting'); process.exit(0); }
      } catch (_) {}
    }, 15000);
  }
  return true;
}
async function unlockSession() {
  if (col) await col.updateOne({ _id: 'lock', owner: ME }, { $set: { until: 0 } });
}

module.exports = { useAuthState, lockSession, unlockSession };
