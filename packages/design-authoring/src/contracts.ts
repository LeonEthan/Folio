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
