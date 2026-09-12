import assert from 'node:assert/strict'
import test from 'node:test'
import { capturePresentedFrame } from './design-render-frame-core.ts'

const frame = (name, empty = false) => ({ name, isEmpty: () => empty })

class FrameSource {
  listener
  queued = []
  stopped = true

  listen(listener) {
    this.listener = listener
    return () => {
      this.listener = undefined
    }
  }

  start() {
    this.stopped = false
  }

  stop() {
    this.stopped = true
  }

  invalidate() {
    const next = this.queued.shift()
    if (next) this.listener?.(next)
  }
}

void test('returns the repaint requested after the first native frame', async () => {
  const source = new FrameSource()
  source.queued.push(frame('possibly queued'), frame('fresh repaint'))
  const result = await capturePresentedFrame(source, new AbortController().signal)
  assert.equal(result.name, 'fresh repaint')
  assert.equal(source.listener, undefined)
  assert.equal(source.stopped, true)
})

void test('retries empty native images without using their pixels as evidence', async () => {
  const source = new FrameSource()
  source.queued.push(frame('empty', true), frame('first full frame'), frame('fresh repaint'))
  const result = await capturePresentedFrame(source, new AbortController().signal)
  assert.equal(result.name, 'fresh repaint')
})

void test('abort removes the listener and stops offscreen painting', async () => {
  const source = new FrameSource()
  const controller = new AbortController()
  const captured = capturePresentedFrame(source, controller.signal)
  controller.abort(Error('deadline'))
  await assert.rejects(captured, /deadline/)
  assert.equal(source.listener, undefined)
  assert.equal(source.stopped, true)
})

void test('an already-aborted capture never starts painting', async () => {
  const source = new FrameSource()
  const controller = new AbortController()
  controller.abort(Error('already done'))
  await assert.rejects(capturePresentedFrame(source, controller.signal), /already done/)
  assert.equal(source.listener, undefined)
  assert.equal(source.stopped, true)
})

void test('synchronous setup failure performs the same cleanup', async () => {
  const source = new FrameSource()
  source.start = () => {
    source.stopped = false
    throw Error('start failed')
  }
  await assert.rejects(capturePresentedFrame(source, new AbortController().signal), /start failed/)
  assert.equal(source.listener, undefined)
  assert.equal(source.stopped, true)
})

void test('repaint request failure performs the same cleanup', async () => {
  const source = new FrameSource()
  let firstRequest = true
  source.invalidate = () => {
    if (!firstRequest) throw Error('repaint failed')
    firstRequest = false
    source.listener?.(frame('first frame'))
  }
  await assert.rejects(
    capturePresentedFrame(source, new AbortController().signal),
    /repaint failed/
  )
  assert.equal(source.listener, undefined)
  assert.equal(source.stopped, true)
})
