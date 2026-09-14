/** Geon's lossless YAML artwork projection. No embedded canonical document or edit log. */
import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import {
  BENTO_DOC_V4_FIELDS,
  BENTO_ELEMENT_KINDS_V4,
  createVisualDocumentKernel,
  DIAGNOSTIC_CODES,
  sniffStaticV1FontMime,
  sniffStaticV1ImageMime,
  staticV1UnregisteredFontFamilies,
  type AssetIndex,
  type BentoDocV4,
  type BentoElementV4,
  type Diagnostic,
  type ImportResult,
  type ValidationResult,
} from './contracts.ts';

/** Bundled licensed default for omitted fontFamily (OFL Inter via @fontsource/inter). */
export const AUTHORING_DEFAULT_FONT_FAMILY = 'Inter';

export const ARTWORK_ENTRY = 'design.yaml';
export const ARTWORK_PAGE = 'pages/canvas.yaml';

export interface YamlArtworkProject {
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
}
declare const validatedYaml: unique symbol;
export type ValidatedYamlArtwork = YamlArtworkProject & { readonly [validatedYaml]: true };

type Raw = Record<string, unknown>;
const record = (v: unknown): v is Raw => v !== null && typeof v === 'object' && !Array.isArray(v);
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const mediaPath = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^media\/[^/\\]+$/.test(v) &&
  !v.split('').some((character) => character.charCodeAt(0) < 32) &&
  !['media/.', 'media/..'].includes(v);

/** Transform only asset-bearing schema fields; text, URLs and chart data are not assets. */
export function mapV3Assets<T>(
  value: T,
  map: (src: string, kind: 'image' | 'font', path: string) => string
): T {
  const out = structuredClone(value) as T & { manifest: Raw; pages: Raw[] };
  const originalSources = new WeakMap<object, string>();
  const source = (v: Raw, kind: 'image' | 'font', at: string) => {
    if (!originalSources.has(v)) originalSources.set(v, v.src as string);
    v.src = map(originalSources.get(v)!, kind, at);
  };
  const fill = (v: unknown, at: string) => {
    if (record(v) && v.type === 'image') source(v, 'image', `${at}.src`);
  };
  const style = (v: unknown, at: string) => {
    if (record(v)) fill(v.fill, `${at}.fill`);
  };
  const fonts = out.manifest.customFonts;
  if (Array.isArray(fonts))
    fonts.forEach((font, i) => {
      if (record(font)) source(font, 'font', `manifest#customFonts[${i}].src`);
    });
  out.pages.forEach((page, pi) => {
    const at = `${(out.manifest.pages as string[])[pi]}#`;
    fill(page.background, `${at}background`);
    if (!Array.isArray(page.elements)) return;
    page.elements.forEach((element, i) => {
      if (!record(element)) return;
      const elAt = `${at}elements[${i}]`;
      if (element.kind === 'image' || (element as Raw).elementType === 'image')
        source(element, 'image', `${elAt}.src`);
      fill(element.fill, `${elAt}.fill`);
      if (record(element.chart)) fill(element.chart.fill, `${elAt}.chart.fill`);
      if (record(element.table)) {
        const table = element.table;
        if (Array.isArray(table.rows))
          table.rows.forEach((row, r) => {
            if (Array.isArray(row))
              row.forEach((cell, c) => style(cell, `${elAt}.table.rows[${r}][${c}]`));
          });
        if (record(table.style)) {
          for (const slot of [
            'cellStyle',
            'firstRowStyle',
            'lastRowStyle',
            'firstColumnStyle',
            'lastColumnStyle',
          ])
            style(table.style[slot], `${elAt}.table.style.${slot}`);
          if (Array.isArray(table.style.bodyStyles))
            table.style.bodyStyles.forEach((s, j) =>
              style(s, `${elAt}.table.style.bodyStyles[${j}]`)
            );
        }
      }
    });
  });
  return out;
}

export function artworkToDocument(project: YamlArtworkProject): BentoDocV4 {
  const {
    manifest,
    pages: [page],
  } = project;
  if (!page) throw Error('Exactly one page required');
  const elements = page.elements.map((element, index) => ({
    ...structuredClone(element),
    zIndex: element.zIndex ?? index,
  }));
  return {
    schemaVersion: 4,
    canvas: { width: manifest.size[0], height: manifest.size[1] },
    background: structuredClone(page.background) ?? { type: 'solid', color: '#FFFFFF' },
    ...(manifest.customFonts !== undefined ? { fonts: structuredClone(manifest.customFonts) } : {}),
    elements,
    diagnostics: structuredClone(page.diagnostics ?? []),
  };
}

/** @deprecated YAML artwork uses artworkToDocument. */
export const v3ToDocument = artworkToDocument;

/** Same acceptance domains as manual save; replay is validation, never output repair. */
export function assertProjectionDocument(doc: BentoDocV4): void {
  // Saved BentoDoc is JSON data. Reject values YAML would silently coerce or
  // omit, while allowing shared (non-cyclic) objects produced by editor code.
  const ancestors = new Set<object>();
  const jsonData = (value: unknown, depth: number): void => {
    if (depth > 40) throw Error('Document nesting exceeds limit');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (
      typeof value !== 'object' ||
      value === null ||
      (!Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    )
      throw Error('Document must contain only finite JSON values');
    if (ancestors.has(value)) throw Error('Cyclic document');
    ancestors.add(value);
    for (const child of Object.values(value)) jsonData(child, depth + 1);
    ancestors.delete(value);
  };
  jsonData(doc, 0);
  const keys = (v: unknown, allowed: readonly string[], at: string) => {
    if (!record(v) || Object.keys(v).some((k) => !allowed.includes(k)))
      throw Error(`${at}: unknown field or invalid object`);
  };
  keys(
    doc,
    ['schemaVersion', 'canvas', 'background', 'fonts', 'elements', 'diagnostics'],
    'document'
  );
  if (doc.schemaVersion !== 4) throw Error('Unsupported BentoDoc schemaVersion');
  keys(doc.canvas, ['width', 'height'], 'canvas');
  if (!Array.isArray(doc.elements) || !Array.isArray(doc.diagnostics))
    throw Error('elements and diagnostics must be arrays');
  doc.diagnostics.forEach((d) => {
    keys(d, ['code', 'path', 'message'], 'diagnostic');
    if (
      !Object.hasOwn(DIAGNOSTIC_CODES, d.code) ||
      typeof d.path !== 'string' ||
      typeof d.message !== 'string'
    )
      throw Error('Invalid diagnostic');
  });
  if (doc.fonts !== undefined && !Array.isArray(doc.fonts)) throw Error('fonts must be an array');
  (doc.fonts ?? []).forEach((font) => keys(font, ['family', 'src', 'weight', 'style'], 'font'));
  for (const element of doc.elements) {
    if (element.kind === 'chart') {
      keys(element.chart.data, ['cols', 'rows'], 'chart.data');
      // Defaults have no editor command and are resolved on v2 import. They
      // are not persisted in the projection as a second style authority.
      if (element.chart.seriesDefaults !== undefined)
        throw Error('Unresolved chart.seriesDefaults are not canonical editable state');
    }
  }
  const kernel = createVisualDocumentKernel({
    schemaVersion: 4,
    canvas: { width: 1, height: 1 },
    background: { type: 'solid', color: '#ffffff' },
    elements: [],
    diagnostics: [],
  });
  const result = kernel.apply({
    batchId: 'yaml-projection-validation',
    actor: 'authoring',
    baseRevision: 0,
    commands: [
      { type: 'setCanvasSize', ...doc.canvas },
      // The legacy top-level chart.fill key remains in the v4 field table.
      // It has no UI writer, but if present it still needs full fill validation.
      ...doc.elements.flatMap((element) => {
        const fill = (element as BentoElementV4 & { fill?: BentoDocV4['background'] }).fill;
        return element.kind === 'chart' && fill !== undefined
          ? [{ type: 'setBackground' as const, background: fill }]
          : [];
      }),
      { type: 'setBackground', background: doc.background },
      ...(doc.fonts ?? []).map((font) => ({ type: 'addFontRegistration' as const, font })),
      ...doc.elements.map((element) => ({ type: 'createElement' as const, element })),
    ],
  });
  if (!result.ok) throw Error(result.error.message);
  const missing = staticV1UnregisteredFontFamilies(doc.elements, [
    ...(doc.fonts ?? []).map((f) => f.family),
    AUTHORING_DEFAULT_FONT_FAMILY,
  ]).filter((family) => family !== AUTHORING_DEFAULT_FONT_FAMILY);
  if (missing.length) throw Error(`Unregistered fonts: ${missing.join(', ')}`);
}

const REMOTE_URL_RE = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;
const KIND_SET = new Set<string>(BENTO_ELEMENT_KINDS_V4);
const PPTD_PAGE_FIELDS = new Set(['notes', 'animations', 'pageType']);

export function validateYaml(
  manifest: Raw,
  manifestFile: string,
  loadPage: (rel: string) => unknown,
  readMedia: (rel: string) => Uint8Array | undefined
): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  const fail = (at: string, message: string, code: Diagnostic['code'] = 'PPTD-E001') =>
    diagnostics.push({ code, path: at, message });
  if (manifestFile.endsWith('.pptd') || manifest.version === 'v2' || manifest.version === 'v3') {
    fail(`${manifestFile}#`, 'leftover PPTD is not admitted (GEON-E-PPTD)', 'PPTD-E001');
    return { ok: false, diagnostics };
  }
  if (manifest.theme !== undefined) {
    fail(`${manifestFile}#theme`, 'PPTD theme/$ref is not admitted (GEON-E-PPTD)');
    return { ok: false, diagnostics };
  }
  const exact = (v: Raw, keys: string[], at: string) =>
    Object.keys(v).forEach((k) => {
      if (!keys.includes(k)) fail(`${at}.${k}`, `Unknown artwork field: ${k}`);
    });
  exact(manifest, ['title', 'size', 'pages', 'customFonts'], `${manifestFile}#`);
  if (manifest.title !== undefined && typeof manifest.title !== 'string')
    fail(`${manifestFile}#title`, 'title must be a string');
  if (
    !Array.isArray(manifest.size) ||
    manifest.size.length !== 2 ||
    !manifest.size.every((v) => typeof v === 'number' && Number.isInteger(v) && v > 0)
  )
    fail(`${manifestFile}#size`, 'size must be a positive integer pair', 'PPTD-E002');
  if (!Array.isArray(manifest.pages) || manifest.pages.some((rel) => typeof rel !== 'string')) {
    fail(`${manifestFile}#pages`, 'pages must be a string array');
    return { ok: false, diagnostics };
  }
  if (manifest.pages.length !== 1 || manifest.pages[0] !== ARTWORK_PAGE) {
    fail(
      `${manifestFile}#pages`,
      `pages 必须恰为 1 页（单画布产品范围；common.multiPage 行 excluded，实际 ${manifest.pages.length} 页）`,
      'PPTD-E011'
    );
    return { ok: false, diagnostics };
  }
  const pagePath = manifest.pages[0];
  const page = loadPage(pagePath);
  if (!record(page)) {
    fail(`${pagePath}#`, 'Page must be a mapping');
    return { ok: false, diagnostics };
  }
  for (const key of Object.keys(page)) {
    if (PPTD_PAGE_FIELDS.has(key))
      fail(
        `${pagePath}#${key}`,
        `PPTD page field "${key}" is not admitted (GEON-E-PPTD)`,
        'PPTD-E011'
      );
  }
  exact(page, ['background', 'elements', 'diagnostics'], `${pagePath}#`);
  if (!Array.isArray(page.elements)) fail(`${pagePath}#elements`, 'elements must be an array');
  else
    page.elements.forEach((element, index) => {
      const at = `${pagePath}#elements[${index}]`;
      if (!record(element)) {
        fail(at, 'Element must be a mapping');
        return;
      }
      if ('elementId' in element || 'elementType' in element || 'content' in element) {
        fail(at, 'PPTD elementId/elementType/HTML content is not admitted (GEON-E-PPTD)');
        return;
      }
      if (typeof element.id !== 'string' || typeof element.kind !== 'string') {
        fail(at, 'Expected Bento id/kind');
        return;
      }
      if (!KIND_SET.has(element.kind))
        fail(at, `kind "${element.kind}" is not in the element vocabulary`, 'PPTD-E003');
      else {
        const allowed = new Set<string>([
          ...BENTO_DOC_V4_FIELDS.elements.common,
          ...BENTO_DOC_V4_FIELDS.elements[
            element.kind as keyof typeof BENTO_DOC_V4_FIELDS.elements
          ],
        ]);
        for (const key of Object.keys(element)) {
          if (!allowed.has(key)) fail(`${at}.${key}`, `Unknown artwork field: ${key}`);
        }
      }
      if (record(element.chart) && element.chart.seriesDefaults !== undefined)
        fail(`${at}.chart.seriesDefaults`, 'PPTD seriesDefaults is not admitted (GEON-E-PPTD)');
    });
  if (diagnostics.length) return { ok: false, diagnostics };
  const project = { manifest, pages: [page] } as unknown as YamlArtworkProject;
  try {
    const bound = mapV3Assets(project, (src, kind, at) => {
      if (REMOTE_URL_RE.test(src)) {
        fail(at, `Remote ${kind} URL is not admitted: ${src}`, 'PPTD-E004');
        return src;
      }
      if (!mediaPath(src)) {
        fail(at, 'Asset must be a local media/<name> path', 'PPTD-E005');
        return src;
      }
      const bytes = readMedia(src);
      if (!bytes) {
        fail(at, `Missing asset: ${src}`, 'PPTD-E005');
        return src;
      }
      if ((kind === 'font' ? sniffStaticV1FontMime(bytes) : sniffStaticV1ImageMime(bytes)) === null)
        fail(at, `Invalid ${kind} bytes: ${src}`, 'PPTD-E005');
      return `asset:${hash(bytes)}`;
    });
    assertProjectionDocument(artworkToDocument(bound));
  } catch (error) {
    fail(`${pagePath}#`, error instanceof Error ? error.message : String(error), 'PPTD-E013');
  }
  return diagnostics.length
    ? { ok: false, diagnostics }
    : { ok: true, document: project as ValidatedYamlArtwork, diagnostics: [] };
}

/** @deprecated YAML artwork uses validateYaml. */
export const validateV3 = validateYaml;

export function importYaml(project: ValidatedYamlArtwork, assets: AssetIndex): ImportResult {
  try {
    const bound = mapV3Assets(project, (src) => {
      const asset = Object.hasOwn(assets, src) ? assets[src] : undefined;
      if (typeof asset !== 'string' || !/^asset:[a-f0-9]{64}$/.test(asset))
        throw Error(`Missing or invalid asset index: ${src}`);
      return asset;
    });
    const document = artworkToDocument(bound);
    assertProjectionDocument(document);
    const sourceMap = Object.fromEntries(document.elements.map((e) => [e.id, [e.id]]));
    return { status: 'ok', document, sourceMap, profileVersion: 'v1', degradations: [] };
  } catch (error) {
    return {
      status: 'unsupported',
      issues: [
        {
          code: 'PPTD-E013',
          path: `${ARTWORK_ENTRY}#`,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

/** @deprecated YAML artwork uses importYaml. */
export const importV3 = importYaml;

const yamlStringify = (value: unknown) =>
  new TextEncoder().encode(
    stringify(value, {
      aliasDuplicateObjects: false,
      defaultStringType: 'QUOTE_DOUBLE',
      lineWidth: 80,
    })
  );

/** Pure deterministic projection; caller owns any subsequent workspace writes. */
export function exportAuthoring(
  document: BentoDocV4,
  assets: ReadonlyMap<string, Uint8Array>
): Map<string, Uint8Array> {
  assertProjectionDocument(document);
  const project: YamlArtworkProject = {
    manifest: {
      size: [document.canvas.width, document.canvas.height],
      pages: [ARTWORK_PAGE],
      ...(document.fonts !== undefined ? { customFonts: structuredClone(document.fonts) } : {}),
    },
    pages: [
      {
        background: structuredClone(document.background),
        diagnostics: structuredClone(document.diagnostics),
        elements: structuredClone(document.elements),
      },
    ],
  };
  const snapshot = new Map<string, Uint8Array>();
  const projected = mapV3Assets(project, (src, kind) => {
    if (!/^asset:[a-f0-9]{64}$/.test(src)) throw Error(`Invalid canonical asset: ${src}`);
    const digest = src.slice(6);
    const bytes = assets.get(digest);
    if (!bytes || hash(bytes) !== digest) throw Error(`Missing or corrupt asset: ${src}`);
    if ((kind === 'font' ? sniffStaticV1FontMime(bytes) : sniffStaticV1ImageMime(bytes)) === null)
      throw Error(`Invalid ${kind} bytes: ${src}`);
    const rel = `media/${digest}`;
    snapshot.set(rel, new Uint8Array(bytes));
    return rel;
  });
  snapshot.set(ARTWORK_ENTRY, yamlStringify(projected.manifest));
  snapshot.set(ARTWORK_PAGE, yamlStringify(projected.pages[0]));
  return snapshot;
}

/** @deprecated Use exportAuthoring. The snapshot is YAML, not PPTD. */
export const exportPptd = exportAuthoring;
