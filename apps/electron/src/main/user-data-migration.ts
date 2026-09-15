import { app } from 'electron'
import os from 'node:os'
import { migrateLegacyUserDataDir } from './user-data-migration-core'
import { isLocalPlatform } from './platform'

// Side effect at import time: this must stay the first import in index.ts so
// the rename lands before any module (onboarding-state's Conf store, auth)
// resolves paths under userData.
migrateLegacyUserDataDir({
  appDataDir: app.getPath('appData'),
  productName: app.getName(),
  envOverride: process.env['LODY_ELECTRON_USER_DATA_DIR']
})

// The CLI data dir follows the same rename; the desktop pins LODY_DATA_DIR for
// every CLI child, so the CLI-side migration alone would never see the legacy
// path. Safe to run before cli-service spawns anything.
if (isLocalPlatform()) {
  migrateLegacyUserDataDir({
    appDataDir: os.homedir(),
    productName: '.molly',
    legacyProductNames: ['.geon', '.folio']
  })
}
