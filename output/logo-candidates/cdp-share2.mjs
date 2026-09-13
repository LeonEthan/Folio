// Open session header "More actions" -> "Share as image…" -> screenshot dialog.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
const OUT = process.argv[2] ?? '.'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const res = await fetch('http://127.0.0.1:9222/json/list')
const target = (await res.json()).find((t) => t.type === 'page' && t.url.includes('localhost'))
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let seq = 0; const pending = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => { const id = ++seq; return new Promise((r) => { pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) }) }
const shot = async (name) => {
  const { result } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(result.data, 'base64'))
  console.log('saved', name)
}
const evaljs = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value

await send('Page.enable')
await sleep(500)

console.log('more-actions click:', await evaljs(`(() => {
  const els = [...document.querySelectorAll('button, [role=button]')]
    .filter((x) => x.getBoundingClientRect().width > 0)
    .filter((x) => /more actions/i.test((x.getAttribute('aria-label') || '') + ' ' + (x.title || '')));
  if (!els.length) return 'none';
  els.sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x);
  els[0].click(); return 'clicked at x=' + Math.round(els[0].getBoundingClientRect().x) + ' of ' + els.length;
})()`))
await sleep(1200)
await shot('06-session-menu.png')

console.log('menu:', await evaljs(`(() => [...document.querySelectorAll('[role=menuitem]')]
  .filter((x) => x.getBoundingClientRect().width > 0)
  .map((x) => (x.textContent || '').trim()))()`))

console.log('share-as-image click:', await evaljs(`(() => {
  const els = [...document.querySelectorAll('[role=menuitem]')]
    .filter((x) => x.getBoundingClientRect().width > 0);
  const b = els.find((x) => /share as image/i.test(x.textContent || ''));
  if (!b) return 'not found';
  b.click(); return 'clicked';
})()`))
await sleep(3000)
await shot('07-share-image-dialog.png')

ws.close()
process.exit(0)
