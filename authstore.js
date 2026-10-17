'use strict';
// WhatsApp login (session) storage.
//  • MONGODB_URI set  → session is kept in MongoDB (survives restarts / sleeping / redeploys)
//  • not set          → local files (lost when a free host restarts)
const fs = require('fs');
const { initAuthCreds, BufferJSON, proto, useMultiFileAuthState } = require('@whiskeysockets/baileys');

let col = null;
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

module.exports = { useAuthState };
