import { FROZEN_CAPABILITY_MATRIX } from './capability-matrix.ts';

/** The v3 profile adds authoring representation, never editor capabilities.
 * v2 remains frozen; each row keeps its original admission/render evidence.
 */
export const PPTD_PROJECTION_CAPABILITIES = FROZEN_CAPABILITY_MATRIX.rows
  .filter((row) => row.profileState === 'active')
  .map((row) => ({
    capabilityId: row.capabilityId,
    canonicalPath: row.canonicalPath,
    projectionVersion: 'v3' as const,
    representation: [
      'common.theme',
      'common.styleInheritance',
      'chart.seriesDefaults',
      'table.cellTextStyleRef',
      'table.styleRef',
    ].includes(row.capabilityId)
      ? 'v2 import resolves authoring references/defaults; v3 preserves resulting literal fields'
      : 'v4 fields preserved; canvas uses manifest.size, id/kind use elementId/elementType, asset src uses media paths',
  }));
