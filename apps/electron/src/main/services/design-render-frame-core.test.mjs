import assert from 'node:assert/strict'
import test from 'node:test'
import { FRAME_MATCH_FRACTION, frameIsInversionOf } from './design-render-frame-core.ts'

const pixel = (r, g, b, a = 255) => [r, g, b, a]
const invertedPixel = (r, g, b, a = 255) => [255 - r, 255 - g, 255 - b, a]

void test('verifies an exact inversion pair', () => {
  const plain = Uint8Array.from([
    ...pixel(242, 246, 247),
    ...pixel(18, 34, 64),
    ...pixel(127, 127, 127)
  ])
  const inverted = Uint8Array.from([
    ...invertedPixel(242, 246, 247),
    ...invertedPixel(18, 34, 64),
    ...invertedPixel(127, 127, 127)
  ])
  assert.equal(frameIsInversionOf(plain, inverted), true)
})

void test('verifies BGRA order the same way', () => {
  const plain = Uint8Array.from([247, 246, 242, 255, 64, 34, 18, 255])
  const inverted = Uint8Array.from([8, 9, 13, 255, 191, 221, 237, 255])
  assert.equal(frameIsInversionOf(plain, inverted), true)
})

void test('tolerates small raster differences', () => {
  const plain = Uint8Array.from(pixel(100, 150, 200))
  const inverted = Uint8Array.from([157, 103, 56, 255])
  assert.equal(frameIsInversionOf(plain, inverted), true)
})

void test('rejects a frozen dark frame pair', () => {
  const splash = Uint8Array.from([
    ...pixel(20, 38, 76),
    ...pixel(22, 40, 80),
    ...pixel(240, 120, 110)
  ])
  assert.equal(frameIsInversionOf(splash, splash), false)
})

void test('rejects a stale splash against an inverted artwork', () => {
  const splash = Uint8Array.from([...pixel(20, 38, 76), ...pixel(22, 40, 80)])
  const invertedArtwork = Uint8Array.from([
    ...invertedPixel(242, 246, 247),
    ...invertedPixel(240, 244, 245)
  ])
  assert.equal(frameIsInversionOf(splash, invertedArtwork), false)
  assert.equal(frameIsInversionOf(invertedArtwork, splash), false)
})

void test('rejects changed alpha and mismatched shapes', () => {
  const plain = Uint8Array.from(pixel(10, 20, 30))
  const alphaChanged = Uint8Array.from([245, 235, 225, 0])
  assert.equal(frameIsInversionOf(plain, alphaChanged), false)
  assert.equal(frameIsInversionOf(plain, Uint8Array.from([])), false)
  assert.equal(frameIsInversionOf(plain, Uint8Array.from([...invertedPixel(10, 20, 30), 0])), false)
})

void test('rejects when too many pixels stop matching', () => {
  const total = 200
  const plain = new Uint8Array(total * 4)
  const inverted = new Uint8Array(total * 4)
  for (let i = 0; i < total; i++) {
    plain.set(pixel(240, 242, 244), i * 4)
    inverted.set(
      i < total * (1 - FRAME_MATCH_FRACTION) + 1 ? pixel(0, 0, 0) : invertedPixel(240, 242, 244),
      i * 4
    )
  }
  assert.equal(frameIsInversionOf(plain, inverted), false)
})
