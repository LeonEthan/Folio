// CDP flow driver: ceremony -> provider -> summary -> main shell
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? '.'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const listRes = await fetch('http://127.0.0.1:9222/json/list')
const targets = await listRes.json()
const target = targets.find((t) => t.type === 'page' && t.url.includes('localhost'))
if (!target) throw new Error('no page target')
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
  return new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
}
async function shot(name) {
  const { result } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(result.data, 'base64'))
  console.log('saved', name)
}
async function evaljs(expression) {
  const r = await send('Runtime.evaluate', { expression })
  return r.result?.result?.value
}
async function clickButton(pattern, label) {
  const found = await evaljs(`(() => {
    const re = ${pattern};
    const btns = [...document.querySelectorAll('button, a[role=button], [role=button]')];
    const vis = btns.filter((x) => x.getBoundingClientRect().width > 0 && !x.disabled);
    const b = vis.find((x) => re.test((x.textContent || '').trim()));
    if (b) { b.click(); return b.textContent.trim().slice(0, 50); }
    return vis.map((x) => (x.textContent || '').trim().slice(0, 24)).join(' | ');
  })()`)
  console.log(`click[${label}]:`, found)
  return found
}

await send('Page.enable')
await sleep(1000)

await clickButton('/configure folio|配置 folio|skip intro|跳过/i', 'configure')
await sleep(3000)
await shot('02-ceremony-provider.png')

await clickButton('/skip|跳过|set up later|稍后/i', 'skip-provider')
await sleep(2500)
await shot('03-onboarding-summary.png')

await clickButton('/enter folio|进入 folio|continue|继续/i', 'enter')
await sleep(5000)
await shot('04-main-shell.png')

console.log('current url:', await evaljs('location.href'))
ws.close()
process.exit(0)
