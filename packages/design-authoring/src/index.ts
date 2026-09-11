/**
 * @folio/design-authoring — PPTD intake for the Folio design platform.
 *
 * Migrated from the pinned upstream authoring package (see source-manifest.json
 * and README.md). Scope: PPTD snapshot validation, PPTD → BentoDoc v4 import,
 * BentoDoc schema migration, and secure authoring snapshot collection.
 * Explicitly not migrated: immutable revision CAS store, quality orchestration,
 * PPTD authoring generators.
 */

export { intakeAuthoring, type AuthoringIntakeResult } from './intake.ts';
export {
  validate,
  validateSnapshot,
  PPTD_VALIDATE_BACKING,
  type ValidateOptions,
} from './validate.ts';
export { importPptd } from './import.ts';
export {
  loadBentoDocV4,
  UnsupportedSchemaVersionError,
  BentoDocUnknownFieldError,
} from './migrate.ts';
export {
  collectAuthoring,
  digestAuthoring,
  assertAuthoringEntry,
  isAuthoringRelPath,
  AuthoringSnapshotError,
} from './collect-authoring.ts';
export { listSemanticAssetRefs, type SemanticAssetRef } from './semantic-assets.ts';
export {
  FROZEN_CAPABILITY_MATRIX,
  CapabilityMatrixHashMismatchError,
} from './capability-matrix.ts';

export { exportPptd } from './pptd-v3.ts';
export { PPTD_PROJECTION_CAPABILITIES } from './projection-capabilities.ts';
