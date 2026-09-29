'use strict';

// ─── Share links ─────────────────────────────────────────────────────────────
// The whole diagram (name, text or SQL, box positions) is compressed into the URL's
// #hash, so nothing is stored on a server. Opening such a link adds it as a new tab.

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const squeeze = (bytes, how) => new Response(new Blob([bytes]).stream().pipeThrough(how)).arrayBuffer().then(b => new Uint8Array(b));

async function shareLink() {
  const d = {
    n: activeDoc().name,
    m: state.mode,
    s: state.mode === 'text' ? state.text : state.sql,
    p: Object.fromEntries(Object.entries(pos).map(([k, p]) => [k, [p.x, p.y]])),
  };
  const z = await squeeze(new TextEncoder().encode(JSON.stringify(d)), new CompressionStream('deflate-raw'));
  return location.href.split('#')[0] + '#d=' + b64url(z);
}

async function copyShareLink() {
  closeMenus();
  try {
    await navigator.clipboard.writeText(await shareLink());
    toast('Link copied. Anyone with it can open a copy of this diagram.');
  } catch {
    toast('Could not copy the link.');
  }
}
$('#shareBtn').onclick = copyShareLink;

async function openShared() {
  const m = location.hash.match(/^#d=([\w-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search); // a reload shouldn't add it again
  try {
    const raw = await squeeze(unb64url(m[1]), new DecompressionStream('deflate-raw'));
    const d = JSON.parse(new TextDecoder().decode(raw));
    const p = Object.fromEntries(Object.entries(d.p ?? {}).map(([k, [x, y]]) => [k, { x, y }]));
    const doc = d.m === 'sql'
      ? { mode: 'sql', sql: d.s, text: '', sqlStale: false, textStale: true }
      : { mode: 'text', text: d.s };
    newDoc(d.n || 'Shared', d.s, { ...doc, pos: p });
  } catch {
    toast('That link is broken or incomplete.');
  }
}
window.addEventListener('hashchange', openShared);
openShared();
