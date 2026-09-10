/**
 * Intake tests: synthetic PPTD fixtures only (no captured content).
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { intakeAuthoring } from '../src/intake.ts';
import {
  loadBentoDocV4,
  BentoDocUnknownFieldError,
  UnsupportedSchemaVersionError,
} from '../src/migrate.ts';
import { collectAuthoring, AuthoringSnapshotError } from '../src/collect-authoring.ts';

/** Minimal valid 8-bit RGB PNG encoder for synthetic fixtures. */
function syntheticPng(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const d = y * (stride + 1) + 1 + x * 3;
      raw[d] = rgb[0];
      raw[d + 1] = rgb[1];
      raw[d + 2] = rgb[2];
    }
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ])
  );
}

const enc = new TextEncoder();

const VALID_PAGE = `background:
  type: solid
  color: "#FFFFFF"
elements:
  - elementId: title
    elementType: text
    bounds: [10, 10, 200, 40]
    content:
      text: "Hello"
      fontSize: 24
      bold: true
  - elementId: band
    elementType: shape
    bounds: [10, 60, 100, 100]
    shapeName: rect
    fill:
      type: solid
      color: "#1F6B8A"
  - elementId: photo
    elementType: image
    bounds: [120, 60, 64, 64]
    src: media/pic.png
    fit:
      mode: cover
`;

function snapshotWith(overrides: Record<string, Uint8Array | undefined>): Map<string, Uint8Array> {
  const snapshot = new Map<string, Uint8Array>([
    [
      'design.pptd',
      enc.encode('version: v2\ntitle: Test\nsize: [320, 200]\npages:\n  - pages/main.page\n'),
    ],
    ['pages/main.page', enc.encode(VALID_PAGE)],
    ['media/pic.png', syntheticPng(8, 8, [31, 107, 138])],
  ]);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) snapshot.delete(key);
    else snapshot.set(key, value);
  }
  return snapshot;
}

describe('intakeAuthoring', () => {
  it('imports a minimal valid project (text, shape, image) into BentoDoc v4', () => {
    const result = intakeAuthoring('design.pptd', snapshotWith({}));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.document.schemaVersion).toBe(4);
    expect(result.document.canvas).toEqual({ width: 320, height: 200 });
    expect(result.document.elements.map((el) => el.kind)).toEqual(['text', 'shape', 'image']);
    expect(result.assets.size).toBe(1);
    const [hash] = result.assets.keys();
    const image = result.document.elements[2];
    expect(image?.kind === 'image' && image.src).toBe(`asset:${hash}`);
    expect(result.profileVersion).toBe('v1');
    expect(result.sourceMap).toEqual({
      title: ['title'],
      band: ['band'],
      photo: ['photo'],
    });
  });

  it('rejects a missing media reference with PPTD-E005', () => {
    const result = intakeAuthoring('design.pptd', snapshotWith({ 'media/pic.png': undefined }));
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(
      result.diagnostics.some((d) => d.code === 'PPTD-E005' && d.message.includes('media/pic.png'))
    ).toBe(true);
  });

  it('rejects a remote image URL with PPTD-E004', () => {
    const result = intakeAuthoring(
      'design.pptd',
      snapshotWith({
        'pages/main.page': enc.encode(
          VALID_PAGE.replace('media/pic.png', 'https://example.com/x.png')
        ),
      })
    );
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.diagnostics.some((d) => d.code === 'PPTD-E004')).toBe(true);
  });

  it('rejects an out-of-vocabulary elementType with PPTD-E003', () => {
    const result = intakeAuthoring(
      'design.pptd',
      snapshotWith({
        'pages/main.page': enc.encode(
          VALID_PAGE.replace('elementType: shape', 'elementType: widget')
        ),
      })
    );
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.diagnostics.some((d) => d.code === 'PPTD-E003')).toBe(true);
  });

  it('rejects unknown fields with PPTD-E001', () => {
    const result = intakeAuthoring(
      'design.pptd',
      snapshotWith({
        'pages/main.page': enc.encode(
          VALID_PAGE.replace('shapeName: rect', 'shapeName: rect\n    bogus: 1')
        ),
      })
    );
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.diagnostics.some((d) => d.code === 'PPTD-E001' && d.path.includes('bogus'))).toBe(
      true
    );
  });

  it('rejects multi-page manifests with the matrix-derived excluded capability code', () => {
    const result = intakeAuthoring(
      'design.pptd',
      snapshotWith({
        'design.pptd': enc.encode(
          'version: v2\nsize: [320, 200]\npages:\n  - pages/main.page\n  - pages/second.page\n'
        ),
      })
    );
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(
      result.diagnostics.some((d) => d.code === 'PPTD-E011' && d.message.includes('multiPage'))
    ).toBe(true);
  });

  it('rejects a media reference escaping media/ with PPTD-E005', () => {
    const result = intakeAuthoring(
      'design.pptd',
      snapshotWith({
        'pages/main.page': enc.encode(VALID_PAGE.replace('media/pic.png', '../escape.png')),
      })
    );
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.diagnostics.some((d) => d.code === 'PPTD-E005')).toBe(true);
  });
});

describe('bundled minimal example', () => {
  it('passes intake (the skill example cannot drift from the schema)', () => {
    const exampleRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'skills',
      'graphic-design',
      'examples',
      'minimal'
    );
    const snapshot = new Map<string, Uint8Array>([
      ['poster.pptd', new Uint8Array(readFileSync(path.join(exampleRoot, 'poster.pptd')))],
      [
        'pages/poster.page',
        new Uint8Array(readFileSync(path.join(exampleRoot, 'pages', 'poster.page'))),
      ],
      [
        'media/swatch.png',
        new Uint8Array(readFileSync(path.join(exampleRoot, 'media', 'swatch.png'))),
      ],
    ]);
    const result = intakeAuthoring('poster.pptd', snapshot);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.document.canvas).toEqual({ width: 720, height: 960 });
    expect(result.document.elements).toHaveLength(4);
  });
});

describe('loadBentoDocV4', () => {
  it('returns a v4 document unchanged', () => {
    const result = intakeAuthoring('design.pptd', snapshotWith({}));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(loadBentoDocV4(result.document)).toEqual(result.document);
  });

  it('rejects unknown fields and unsupported schema versions', () => {
    expect(() => loadBentoDocV4({ schemaVersion: 4, bogus: true })).toThrow(
      BentoDocUnknownFieldError
    );
    expect(() => loadBentoDocV4({ schemaVersion: 99 })).toThrow(UnsupportedSchemaVersionError);
  });
});

describe('collectAuthoring', () => {
  it('collects only allowlisted relpaths and requires the design.pptd entry', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'folio-collect-'));
    mkdirSync(path.join(dir, 'pages'));
    writeFileSync(path.join(dir, 'design.pptd'), 'version: v2\n');
    writeFileSync(path.join(dir, 'pages', 'a.page'), 'elements: []\n');
    writeFileSync(path.join(dir, 'unrelated.txt'), 'ignored\n');
    const snapshot = collectAuthoring(dir);
    expect([...snapshot.keys()].sort()).toEqual(['design.pptd', 'pages/a.page']);
  });

  it('refuses a missing entry and symlinked entries', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'folio-collect-'));
    expect(() => collectAuthoring(dir)).toThrow(AuthoringSnapshotError);
    writeFileSync(path.join(dir, 'design.pptd'), 'version: v2\n');
    symlinkSync('design.pptd', path.join(dir, 'linked.pptd'));
    // non-allowlisted symlink in pages/ is rejected rather than silently skipped
    mkdirSync(path.join(dir, 'pages'));
    symlinkSync('../design.pptd', path.join(dir, 'pages', 'evil.page'));
    expect(() => collectAuthoring(dir)).toThrow(AuthoringSnapshotError);
  });
});
