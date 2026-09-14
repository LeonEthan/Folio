/**
 * Semantic asset enumeration (Issue #39, single source of truth).
 *
 * Only fields whose semantics carry images, image fills, or custom fonts.
 * Used by intake (to bind exact captured bytes) and by import (to check the
 * asset index). A profile change requires one coordinated update here.
 *
 * Order is stable and matches the historical import admission order:
 * background, elements in array order, theme.tableStyles in object order,
 * customFonts in array order. Paths match the historical import issue paths
 * byte-for-byte so `unsupported` attribution is preserved.
 */

import { isArtworkProjection, isPptdV3, type ValidatedPptd } from './contracts.ts';
import { mapV3Assets } from './pptd-v3.ts';

export interface SemanticAssetRef {
  /** media/ relative path as authored. */
  ref: string;
  /** PPTD YAML path for diagnostics (import `unsupported` attribution). */
  path: string;
  /** Source PPTD elementId when attributable. */
  sourceId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fillRef(fill: unknown): string | undefined {
  if (isRecord(fill) && fill.type === 'image' && typeof fill.src === 'string') return fill.src;
  return undefined;
}

export function listSemanticAssetRefs(
  validated: ValidatedPptd,
  pagePath: string
): SemanticAssetRef[] {
  const out: SemanticAssetRef[] = [];
  if (isArtworkProjection(validated) || isPptdV3(validated)) {
    mapV3Assets(validated, (ref, _kind, path) => {
      out.push({ ref, path });
      return ref;
    });
    return out;
  }
  const at = (sub: string): string => `${pagePath}#${sub}`;
  const page = validated.pages[0];
  if (page === undefined) return out;
  if (page.background !== undefined) {
    const ref = fillRef(page.background);
    if (ref !== undefined) out.push({ ref, path: at('background') });
  }
  page.elements.forEach((element, i) => {
    const elAt = (sub: string): string => at(`elements[${i}]${sub}`);
    switch (element.elementType) {
      case 'image':
        if (typeof element.src === 'string') {
          out.push({ ref: element.src, path: elAt('.src'), sourceId: element.elementId });
        }
        break;
      case 'shape':
      case 'icon': {
        const ref = fillRef((element as { fill?: unknown }).fill);
        if (ref !== undefined) out.push({ ref, path: elAt('.fill'), sourceId: element.elementId });
        break;
      }
      case 'table': {
        const table = element as unknown as Record<string, unknown>;
        const tableFill = fillRef(table.fill);
        if (tableFill !== undefined)
          out.push({ ref: tableFill, path: elAt('.fill'), sourceId: element.elementId });
        const rows = table.rows as unknown[][] | undefined;
        if (Array.isArray(rows)) {
          rows.forEach((row, r) => {
            if (!Array.isArray(row)) return;
            row.forEach((cell, c) => {
              const ref = fillRef((cell as Record<string, unknown>).fill);
              if (ref !== undefined) {
                out.push({
                  ref,
                  path: elAt(`.rows[${r}][${c}].fill`),
                  sourceId: element.elementId,
                });
              }
            });
          });
        }
        const style = table.style;
        if (isRecord(style)) {
          for (const slot of [
            'cellStyle',
            'firstRowStyle',
            'lastRowStyle',
            'firstColumnStyle',
            'lastColumnStyle',
          ] as const) {
            const slotStyle = (style as Record<string, unknown>)[slot];
            if (isRecord(slotStyle)) {
              const ref = fillRef((slotStyle as Record<string, unknown>).fill);
              if (ref !== undefined) {
                out.push({ ref, path: elAt(`.style.${slot}.fill`), sourceId: element.elementId });
              }
            }
          }
          if (Array.isArray((style as Record<string, unknown>).bodyStyles)) {
            ((style as Record<string, unknown>).bodyStyles as unknown[]).forEach((s, bi) => {
              const ref = fillRef((s as Record<string, unknown>).fill);
              if (ref !== undefined) {
                out.push({
                  ref,
                  path: elAt(`.style.bodyStyles[${bi}].fill`),
                  sourceId: element.elementId,
                });
              }
            });
          }
        }
        break;
      }
      case 'chart': {
        const ref = fillRef((element as { fill?: unknown }).fill);
        if (ref !== undefined) out.push({ ref, path: elAt('.fill'), sourceId: element.elementId });
        break;
      }
      case 'text':
      case 'line':
        break;
    }
  });
  const themeStyles = (validated.manifest.theme?.tableStyles ?? {}) as Record<string, unknown>;
  for (const [key, style] of Object.entries(themeStyles)) {
    const styleAt = `${pagePath}#theme.tableStyles.${key}`;
    if (!isRecord(style)) continue;
    for (const slot of [
      'cellStyle',
      'firstRowStyle',
      'lastRowStyle',
      'firstColumnStyle',
      'lastColumnStyle',
    ] as const) {
      const slotStyle = (style as Record<string, unknown>)[slot];
      if (isRecord(slotStyle)) {
        const ref = fillRef((slotStyle as Record<string, unknown>).fill);
        if (ref !== undefined) out.push({ ref, path: `${styleAt}.${slot}.fill` });
      }
    }
    if (Array.isArray((style as Record<string, unknown>).bodyStyles)) {
      ((style as Record<string, unknown>).bodyStyles as unknown[]).forEach((s, bi) => {
        const ref = fillRef((s as Record<string, unknown>).fill);
        if (ref !== undefined) out.push({ ref, path: `${styleAt}.bodyStyles[${bi}].fill` });
      });
    }
  }
  (validated.manifest.customFonts ?? []).forEach((font, i) => {
    if (typeof font.src === 'string') {
      out.push({ ref: font.src, path: `manifest#customFonts[${i}].src` });
    }
  });
  return out;
}
