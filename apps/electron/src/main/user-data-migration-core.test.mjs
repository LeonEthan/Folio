import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrateLegacyUserDataDir } from './user-data-migration-core.ts'

const tempAppData = () => fs.mkdtempSync(path.join(os.tmpdir(), 'geon-userdata-migration-'))

void test('renames the legacy Folio userData dir when the Geon one is absent', () => {
  const appData = tempAppData()
  fs.mkdirSync(path.join(appData, 'Folio', 'Local Storage'), { recursive: true })
  const migrated = migrateLegacyUserDataDir({
    appDataDir: appData,
    productName: 'Geon',
    log: () => {}
  })
  assert.equal(migrated, true)
  assert.ok(fs.existsSync(path.join(appData, 'Geon', 'Local Storage')))
  assert.ok(!fs.existsSync(path.join(appData, 'Folio')))
})

void test('leaves an existing Geon userData dir untouched', () => {
  const appData = tempAppData()
  fs.mkdirSync(path.join(appData, 'Folio'), { recursive: true })
  fs.mkdirSync(path.join(appData, 'Geon'), { recursive: true })
  const migrated = migrateLegacyUserDataDir({
    appDataDir: appData,
    productName: 'Geon',
    log: () => {}
  })
  assert.equal(migrated, false)
  assert.ok(fs.existsSync(path.join(appData, 'Folio')))
})

void test('does nothing without a legacy dir', () => {
  const appData = tempAppData()
  const migrated = migrateLegacyUserDataDir({
    appDataDir: appData,
    productName: 'Geon',
    log: () => {}
  })
  assert.equal(migrated, false)
})

void test('skips migration when a dev userData override is set', () => {
  const appData = tempAppData()
  fs.mkdirSync(path.join(appData, 'Folio'), { recursive: true })
  const migrated = migrateLegacyUserDataDir({
    appDataDir: appData,
    productName: 'Geon',
    envOverride: '/tmp/geon-dev-override',
    log: () => {}
  })
  assert.equal(migrated, false)
  assert.ok(!fs.existsSync(path.join(appData, 'Geon')))
})
