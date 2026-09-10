/**
 * When an already-open design editor must be torn down and re-created from the
 * store: only if it last loaded or saved a different revision than the store
 * holds. A canvas that is not open is not stale — the next attach reads the
 * store — so this is not a guess about files on disk.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { openDesignCanvasNeedsReload } from './design-canvas-sync-core.ts'

void test('an editor that already holds the store revision is left alone', () => {
  assert.equal(openDesignCanvasNeedsReload('rev-a', 'rev-a'), false)
})

void test('an editor whose loaded revision is not the store revision must reload', () => {
  assert.equal(openDesignCanvasNeedsReload('rev-a', 'rev-b'), true)
})

void test('a canvas that is not open is not reloaded — the next attach reads the store', () => {
  assert.equal(openDesignCanvasNeedsReload(undefined, 'rev-b'), false)
})
