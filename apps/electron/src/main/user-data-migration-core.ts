import fs from 'node:fs'
import path from 'node:path'

/**
 * One-time rename of the pre-Geon userData directory (`Folio` → productName).
 * Pure core with injectable paths so it is unit-testable without Electron;
 * the Electron wrapper lives in user-data-migration.ts.
 */
export function migrateLegacyUserDataDir(options: {
  appDataDir: string
  productName: string
  legacyProductName?: string
  envOverride?: string | undefined
  log?: (message: string) => void
}): boolean {
  const {
    appDataDir,
    productName,
    legacyProductName = 'Folio',
    envOverride,
    log = console.warn
  } = options
  if (envOverride?.trim()) return false
  const current = path.join(appDataDir, productName)
  const legacy = path.join(appDataDir, legacyProductName)
  if (current === legacy || fs.existsSync(current) || !fs.existsSync(legacy)) return false
  fs.renameSync(legacy, current)
  log(`[user-data-migration] Renamed legacy userData ${legacy} -> ${current}`)
  return true
}
