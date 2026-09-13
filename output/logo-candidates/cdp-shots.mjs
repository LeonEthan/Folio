// CDP screenshot driver for the running Folio dev instance.
// Usage: node cdp-shots.mjs <outdir>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? '.'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list')
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost'))
      if (page) return page
    } catch {}
    await sleep(1000)
  }
  throw new Error('no debuggable page target found')
}

const target = await getTarget()
console.log('target:', target.url)
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
}
function send(method, params = {}) {
  const id = ++seq
  return new Promise((res) => {
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function shot(name) {
  const { result } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(result.data, 'base64'))
  console.log('saved', name)
}
async function evaljs(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: false })
  return r.result?.result?.value
}
async function clickButton(pattern, label) {
  const found = await evaljs(`(() => {
    const re = ${pattern};
    const btns = [...document.querySelectorAll('button, a[role=button], [role=button]')];
    const b = btns.find((x) => re.test(x.textContent || '') && !x.disabled);
    if (b) { b.click(); return b.textContent.trim().slice(0, 40); }
    return null;
  })()`)
  console.log(`click[${label}]:`, found)
  return found
}

await send('Page.enable')
await send('Runtime.enable')
await sleep(2500)

// 1. Intro ceremony (folio-mark top-left)
await shot('01-ceremony-intro.png')

// 2. Skip intro -> provider/ceremony screen (folio-icon)
await clickButton('/skip|跳过/i', 'skip-intro')
await sleep(2000)
await shot('02-ceremony-provider.png')

// 3. Skip provider setup -> completion summary
await clickButton('/skip|跳过|稍后再说|explore/i', 'skip-provider')
await sleep(2000)
await shot('03-onboarding-summary.png')

// 4. Enter Folio -> main shell (workspace identity logo in sidebar / chat landing)
await clickButton('/enter folio|进入|开始|continue/i', 'enter')
await sleep(4000)
await shot('04-main-shell.png')

ws.close()
process.exit(0)
