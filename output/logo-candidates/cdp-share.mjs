// Open a session and trigger "Share as image" dialog, screenshot it.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? '.'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const listRes = await fetch('http://127.0.0.1:9222/json/list')
const targets = await listRes.json()
const target = targets.find((t) => t.type === 'page' && t.url.includes('localhost'))
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
}
const send = (method, params = {}) => {
  const id = ++seq
  return new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
}
const shot = async (name) => {
  const { result } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(result.data, 'base64'))
  console.log('saved', name)
}
const evaljs = async (expression) => (await send('Runtime.evaluate', { expression })).result?.result?.value
const click = async (pattern, label, extra = '') => {
  const r = await evaljs(`(() => {
    const re = ${pattern};
    const els = [...document.querySelectorAll('button, a, [role=button], [role=menuitem]')];
    const vis = els.filter((x) => x.getBoundingClientRect().width > 0);
    const b = vis.find((x) => re.test(((x.textContent || '') + ' ' + (x.getAttribute('aria-label') || '') + ' ' + (x.title || '')).trim()));
    if (b) { ${extra}; b.click(); return (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 50); }
    return null;
  })()`)
  console.log(`click[${label}]:`, r)
  return r
}

await send('Page.enable')
await sleep(800)

// open first session in sidebar
await click('/Spring Book Sale Poster/i', 'open-session')
await sleep(3500)
await shot('05-session.png')

// list candidate share controls for diagnostics
console.log('share-ish controls:', await evaljs(`(() => [...document.querySelectorAll('button, [role=button]')]
  .filter((x) => x.getBoundingClientRect().width > 0)
  .map((x) => (x.getAttribute('aria-label') || x.title || x.textContent || '').trim())
  .filter((s) => /share|分享|image|图/i.test(s)).slice(0, 20))()`))

await click('/share|分享/i', 'share')
await sleep(1500)
await shot('06-share-menu.png')

console.log('menu items:', await evaljs(`(() => [...document.querySelectorAll('[role=menuitem], [role=menu] *, button')]
  .filter((x) => x.getBoundingClientRect().width > 0)
  .map((x) => (x.textContent || '').trim()).filter((s) => s && s.length < 40).slice(0, 30))()`))

await click('/share as image|生成图片|分享图|image/i', 'share-as-image')
await sleep(2500)
await shot('07-share-image-dialog.png')

ws.close()
process.exit(0)
