// Use trusted CDP mouse events to open the session dropdown and click "Share as image…".
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
const clickAt = async (x, y) => {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }
}
const centerOf = async (expression) => {
  const r = await evaljs(`(() => { const el = ${expression}; if (!el) return null;
    const b = el.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`)
  return r
}

await send('Page.enable')
await sleep(500)

const btn = await centerOf(`(() => {
  const els = [...document.querySelectorAll('button, [role=button]')]
    .filter((x) => x.getBoundingClientRect().width > 0)
    .filter((x) => /more actions/i.test((x.getAttribute('aria-label') || '') + ' ' + (x.title || '')));
  els.sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x);
  return els[0] || null;
})()`)
console.log('more-actions at:', JSON.stringify(btn))
if (!btn) process.exit(1)
await clickAt(btn.x, btn.y)
await sleep(1200)
await shot('06-session-menu.png')

const item = await centerOf(`(() => {
  const els = [...document.querySelectorAll('[role=menuitem], [data-radix-menu-content] div')]
    .filter((x) => x.getBoundingClientRect().width > 0);
  return els.find((x) => /share as image/i.test(x.textContent || '')) || null;
})()`)
console.log('share-as-image at:', JSON.stringify(item))
if (!item) {
  console.log('menu text dump:', await evaljs(`document.body.innerText.slice(0, 800)`))
  process.exit(1)
}
await clickAt(item.x, item.y)
await sleep(3500)
await shot('07-share-image-dialog.png')

ws.close()
process.exit(0)
