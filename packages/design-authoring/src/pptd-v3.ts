/** Folio's lossless projection profile. No embedded canonical document or edit log. */
import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import {
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
  type PptdV3Project,
  type PptdV3Element,
  type ValidatedPptdV3,
  type ValidationResult,
} from './contracts.ts';

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
      if (element.elementType === 'image') source(element, 'image', `${elAt}.src`);
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

export function v3ToDocument(project: PptdV3Project): BentoDocV4 {
  const {
    manifest,
    pages: [page],
  } = project;
  if (!page) throw Error('Exactly one page required');
  return {
    schemaVersion: 4,
    canvas: { width: manifest.size[0], height: manifest.size[1] },
    background: structuredClone(page.background),
    ...(manifest.customFonts !== undefined ? { fonts: structuredClone(manifest.customFonts) } : {}),
    elements: page.elements.map(
      ({ elementId, elementType, ...fields }) =>
        ({ ...structuredClone(fields), id: elementId, kind: elementType }) as BentoElementV4
    ),
    diagnostics: structuredClone(page.diagnostics ?? []),
  };
}

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
    batchId: 'pptd-v3-validation',
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
  const missing = staticV1UnregisteredFontFamilies(
    doc.elements,
    (doc.fonts ?? []).map((f) => f.family)
  );
  if (missing.length) throw Error(`Unregistered fonts: ${missing.join(', ')}`);
}

export function validateV3(
  manifest: Raw,
  manifestFile: string,
  loadPage: (rel: string) => unknown,
  readMedia: (rel: string) => Uint8Array | undefined
): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  const fail = (at: string, message: string, code: Diagnostic['code'] = 'PPTD-E001') =>
    diagnostics.push({ code, path: at, message });
  const exact = (v: Raw, keys: string[], at: string) =>
    Object.keys(v).forEach((k) => {
      if (!keys.includes(k)) fail(`${at}.${k}`, `Unknown v3 field: ${k}`);
    });
  exact(manifest, ['version', 'title', 'size', 'pages', 'customFonts'], `${manifestFile}#`);
  if (manifest.title !== undefined && typeof manifest.title !== 'string')
    fail(`${manifestFile}#title`, 'title must be a string');
  if (
    !Array.isArray(manifest.size) ||
    manifest.size.length !== 2 ||
    !manifest.size.every((v) => typeof v === 'number' && Number.isInteger(v) && v > 0)
  )
    fail(`${manifestFile}#size`, 'size must be a positive integer pair', 'PPTD-E002');
  if (
    !Array.isArray(manifest.pages) ||
    manifest.pages.length !== 1 ||
    typeof manifest.pages[0] !== 'string' ||
    !/^pages\/[^/\\]+\.page$/.test(manifest.pages[0]) ||
    manifest.pages[0] === 'pages/..page'
  ) {
    fail(`${manifestFile}#pages`, 'Exactly one local pages/<name>.page is required');
    return { ok: false, diagnostics };
  }
  const pagePath = manifest.pages[0];
  const page = loadPage(pagePath);
  if (!record(page)) {
    fail(`${pagePath}#`, 'Page must be a mapping');
    return { ok: false, diagnostics };
  }
  exact(page, ['background', 'elements', 'diagnostics'], `${pagePath}#`);
  if (!Array.isArray(page.elements)) fail(`${pagePath}#elements`, 'elements must be an array');
  else
    page.elements.forEach((element, index) => {
      if (
        !record(element) ||
        'id' in element ||
        'kind' in element ||
        typeof element.elementId !== 'string' ||
        typeof element.elementType !== 'string'
      )
        fail(
          `${pagePath}#elements[${index}]`,
          'Expected elementId/elementType; canonical id/kind aliases are not v3 fields'
        );
    });
  if (diagnostics.length) return { ok: false, diagnostics };
  const project = { manifest, pages: [page] } as unknown as PptdV3Project;
  try {
    const bound = mapV3Assets(project, (src, kind, at) => {
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
    assertProjectionDocument(v3ToDocument(bound));
  } catch (error) {
    fail(`${pagePath}#`, error instanceof Error ? error.message : String(error), 'PPTD-E013');
  }
  return diagnostics.length
    ? { ok: false, diagnostics }
    : { ok: true, document: project as ValidatedPptdV3, diagnostics: [] };
}

export function importV3(project: ValidatedPptdV3, assets: AssetIndex): ImportResult {
  try {
    const bound = mapV3Assets(project, (src) => {
      const asset = Object.hasOwn(assets, src) ? assets[src] : undefined;
      if (typeof asset !== 'string' || !/^asset:[a-f0-9]{64}$/.test(asset))
        throw Error(`Missing or invalid asset index: ${src}`);
      return asset;
    });
    const document = v3ToDocument(bound);
    assertProjectionDocument(document);
    const sourceMap = Object.fromEntries(document.elements.map((e) => [e.id, [e.id]]));
    return { status: 'ok', document, sourceMap, profileVersion: 'v1', degradations: [] };
  } catch (error) {
    return {
      status: 'unsupported',
      issues: [
        {
          code: 'PPTD-E013',
          path: 'design.pptd#',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

/** Pure deterministic projection; caller owns any subsequent workspace writes. */
export function exportPptd(
  document: BentoDocV4,
  assets: ReadonlyMap<string, Uint8Array>
): Map<string, Uint8Array> {
  assertProjectionDocument(document);
  const project: PptdV3Project = {
    manifest: {
      version: 'v3',
      size: [document.canvas.width, document.canvas.height],
      pages: ['pages/design.page'],
      ...(document.fonts !== undefined ? { customFonts: structuredClone(document.fonts) } : {}),
    },
    pages: [
      {
        background: structuredClone(document.background),
        diagnostics: structuredClone(document.diagnostics),
        elements: document.elements.map(
          ({ id, kind, ...fields }) =>
            ({ elementId: id, elementType: kind, ...structuredClone(fields) }) as PptdV3Element
        ),
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
  snapshot.set(
    'design.pptd',
    new TextEncoder().encode(
      stringify(projected.manifest, {
        aliasDuplicateObjects: false,
        defaultStringType: 'QUOTE_DOUBLE',
        lineWidth: 80,
      })
    )
  );
  snapshot.set(
    'pages/design.page',
    new TextEncoder().encode(
      stringify(projected.pages[0], {
        aliasDuplicateObjects: false,
        defaultStringType: 'QUOTE_DOUBLE',
        lineWidth: 80,
      })
    )
  );
  return snapshot;
}
