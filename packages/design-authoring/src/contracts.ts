/**
 * Vendored Bento contracts seam.
 *
 * All authoring modules import contracts through this single module so the
 * vendored path (packages/design-bento/vendor, pinned upstream snapshot)
 * appears exactly once in this package. The vendored contracts are pure TS
 * with no node builtins, so they are safe to bundle for both the CLI daemon
 * (vite SSR, noExternal) and the self-contained skill scripts (esbuild).
 */

export * from '../../design-bento/vendor/packages/contracts/src/index.ts';

export * from '../../design-bento/vendor/packages/contracts/src/pptd-v3.ts';
export { createVisualDocumentKernel } from '../../design-bento/vendor/packages/kernel/src/kernel.ts';
import type {
  ValidatedPptd as LegacyValidatedPptd,
  ValidationResult as FrozenValidationResult,
} from '../../design-bento/vendor/packages/contracts/src/validation.ts';
import type {
  Diagnostic as FrozenDiagnostic,
  DiagnosticCode as FrozenDiagnosticCode,
} from '../../design-bento/vendor/packages/contracts/src/diagnostics.ts';
import type {
  BentoDocV4,
  BentoElementV4,
} from '../../design-bento/vendor/packages/contracts/src/bentodoc-v4.ts';
import type { ValidatedPptdV3 } from '../../design-bento/vendor/packages/contracts/src/pptd-v3.ts';
export type ValidatedPptdV2 = LegacyValidatedPptd;
export type { FrozenDiagnostic, FrozenDiagnosticCode, FrozenValidationResult };
export type LiveDiagnosticCode = FrozenDiagnosticCode extends `PPTD-${infer Rest}`
  ? `GEON-${Rest}`
  : never;
export type LiveDiagnostic = {
  code: LiveDiagnosticCode;
  path: string;
  message: string;
};
export type ValidatedArtwork = {
  manifest: {
    title?: string;
    size: [number, number];
    pages: string[];
    customFonts?: BentoDocV4['fonts'];
  };
  pages: {
    background: BentoDocV4['background'];
    elements: BentoElementV4[];
    diagnostics?: BentoDocV4['diagnostics'];
  }[];
};
export type ValidatedPptd = LegacyValidatedPptd | ValidatedPptdV3 | ValidatedArtwork;
export type FrozenAuthoringValidationResult =
  | {
      ok: true;
      document: ValidatedPptd;
      diagnostics: FrozenDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: FrozenDiagnostic[];
    };
export type ValidationResult =
  | {
      ok: true;
      document: ValidatedPptd;
      diagnostics: LiveDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: LiveDiagnostic[];
    };
export function isPptdV3(project: ValidatedPptd): project is ValidatedPptdV3 {
  return 'version' in project.manifest && project.manifest.version === 'v3';
}
export function isArtworkProjection(project: ValidatedPptd): project is ValidatedArtwork {
  return !('version' in project.manifest);
}
