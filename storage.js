'use strict';
// Where crew worlds are saved.
// - If SUPABASE_URL + SUPABASE_SERVICE_KEY are set: a `rooms` table in Supabase (survives restarts;
//   needed on hosts like Render's free tier whose disk is wiped when the server sleeps).
// - Otherwise: JSON files in DATA_DIR (fine for local play).
const fs = require('fs');
const path = require('path');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (id) => path.join(dir, `${id}.json`);
  return {
    kind: `files in ${dir}`,
    async load(id) {
      try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; }
    },
    async save(id, state) {
      fs.writeFileSync(file(id) + '.tmp', JSON.stringify(state));
      fs.renameSync(file(id) + '.tmp', file(id));
    },
  };
}

function supabaseStore(url, key) {
  const base = url.replace(/\/$/, '') + '/rest/v1/rooms';
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    kind: 'Supabase',
    async load(id) {
      const res = await fetch(`${base}?id=eq.${encodeURIComponent(id)}&select=state`, { headers });
      if (!res.ok) throw new Error(`Supabase load failed: ${res.status} ${await res.text()}`);
      const rows = await res.json();
      return rows[0] ? rows[0].state : null;
    },
    async save(id, state) {
      const res = await fetch(base, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id, state, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Supabase save failed: ${res.status} ${await res.text()}`);
    },
  };
}

module.exports = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? supabaseStore(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : fileStore(process.env.DATA_DIR || path.join(__dirname, 'data'));
