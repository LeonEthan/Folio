import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { DesignTurnOutcome } from '@lody/shared';
import enMessages from '../../../locales/en.json';
import {
  DESIGN_RESULT_STATUSES,
  MAX_DESIGN_REPAIR_DIAGNOSTICS,
  MAX_DESIGN_REPAIR_REQUEST_LENGTH,
  buildDesignRepairRequest,
  getDesignCandidateStandingCopy,
  getDesignResultHintCopy,
  getDesignResultNoticeCopy,
  getDesignResultStatusCopy,
  redactDesignText,
  resolveDesignCandidateStanding,
  resolveDesignResultCard,
  resolveDesignResultCardActions,
  resolveDesignThumbnail,
  shortDesignId,
  type DesignCandidateStanding,
  type DesignResultCardState,
  type DesignResultNotice,
} from '../src/lib/design-turn-result';

const sha = (seed: string) => seed.repeat(64).slice(0, 64);

const rawOutcome = (status: string, extra: Record<string, unknown> = {}) => ({
  version: 1,
  status,
  turnId: 'turn-1',
  artworkId: 'artwork-1',
  timestamp: '2026-09-10T00:00:00.000Z',
  ...extra,
});
const outcome = (status: string, extra: Record<string, unknown> = {}): DesignTurnOutcome =>
  rawOutcome(status, extra) as unknown as DesignTurnOutcome;
const resultState = (
  status: string,
  extra: Record<string, unknown> = {}
): DesignResultCardState => ({
  kind: 'result',
  outcome: outcome(status, extra),
});

const en = enMessages as unknown as Record<string, string>;
/** The English renderer, so a copy assertion checks the shipped string. */
const t = ((key: string, defaultValue?: string, values?: Record<string, unknown>) => {
  const template = en[key] ?? defaultValue ?? key;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    values && name in values ? String(values[name]) : match
  );
}) as unknown as TFunction;

describe('design result card state', () => {
  it('renders a card for every durable status this build understands', () => {
    for (const status of DESIGN_RESULT_STATUSES) {
      expect(resolveDesignResultCard(rawOutcome(status), true), status).toMatchObject({
        kind: 'result',
      });
    }
    expect(DESIGN_RESULT_STATUSES).toEqual([
      'committed',
      'candidate',
      'invalid',
      'no_artifact',
      'failed',
      'cancelled',
    ]);
  });

  it('claims generating only while the turn recorded no outcome at all', () => {
    expect(resolveDesignResultCard(undefined, true)).toEqual({ kind: 'live' });
    // A recorded outcome is the fact, even while presence still says working.
    expect(resolveDesignResultCard(rawOutcome('committed'), true).kind).toBe('result');
    expect(resolveDesignResultCard(undefined, false)).toEqual({ kind: 'none' });
    expect(resolveDesignResultCard(null, true)).toEqual({ kind: 'live' });
  });

  it('says nothing for a payload it cannot read instead of guessing', () => {
    // A future version, a truncated object, a string, a blank id: all read as
    // absent, and never as "still generating" or as a half-rendered card.
    for (const unreadable of [
      { ...rawOutcome('committed'), version: 99 },
      { status: 'committed' },
      'committed',
      { ...rawOutcome('committed'), turnId: '' },
      { ...rawOutcome('queued') },
    ]) {
      expect(resolveDesignResultCard(unreadable, true), JSON.stringify(unreadable)).toEqual({
        kind: 'none',
      });
    }
  });

  it('drops ids that are not content addresses', () => {
    const state = resolveDesignResultCard(
      rawOutcome('candidate', { candidateId: '../../design.json', revisionId: 'abc' }),
      false
    );
    expect(state).toEqual({ kind: 'result', outcome: outcome('candidate') });
  });
});

describe('design candidate standing', () => {
  it('maps the store answer to what the card may show', () => {
    expect(resolveDesignCandidateStanding({ status: 'pending' })).toEqual({ status: 'pending' });
    expect(resolveDesignCandidateStanding({ status: 'adopted' })).toEqual({ status: 'adopted' });
    expect(resolveDesignCandidateStanding({ status: 'unavailable', reason: 'missing' })).toEqual({
      status: 'missing',
    });
    expect(resolveDesignCandidateStanding({ status: 'unavailable', reason: 'unreadable' })).toEqual(
      {
        status: 'unreadable',
      }
    );
  });

  it('treats anything else — including a future shape — as unknown, never actionable', () => {
    expect(resolveDesignCandidateStanding({ status: 'queued' })).toEqual({ status: 'unknown' });
    expect(resolveDesignCandidateStanding({ status: 'unavailable', reason: 'elsewhere' })).toEqual({
      status: 'unknown',
    });
    expect(resolveDesignCandidateStanding(null)).toEqual({ status: 'unknown' });
    expect(resolveDesignCandidateStanding(undefined)).toEqual({ status: 'unknown' });
  });
});

describe('design result card actions', () => {
  const base = { canLocate: true, canRepair: true, canReachDesign: true, hasCandidateId: true };
  const candidate = resultState('candidate', { candidateId: sha('a') });
  const invalid = resultState('invalid', {
    diagnostics: [{ code: 'PPTD-E101', message: 'bad pages' }],
  });

  it('offers apply only for a candidate that exists and differs from the canvas', () => {
    expect(
      resolveDesignResultCardActions({ ...base, state: candidate, standing: { status: 'pending' } })
    ).toMatchObject({ locate: true, adopt: true, discard: true, repair: false });
    expect(
      resolveDesignResultCardActions({ ...base, state: candidate, standing: { status: 'adopted' } })
    ).toMatchObject({ adopt: false, discard: true });
    for (const status of ['missing', 'unreadable', 'unknown', 'loading'] as const) {
      expect(
        resolveDesignResultCardActions({
          ...base,
          state: candidate,
          standing: { status } satisfies DesignCandidateStanding,
        })
      ).toMatchObject({ adopt: false, discard: false });
    }
  });

  it('offers nothing when the candidate id or the design channel is missing', () => {
    expect(
      resolveDesignResultCardActions({
        ...base,
        state: candidate,
        standing: { status: 'pending' },
        hasCandidateId: false,
      })
    ).toMatchObject({ adopt: false, discard: false });
    expect(
      resolveDesignResultCardActions({
        ...base,
        state: candidate,
        standing: { status: 'pending' },
        canReachDesign: false,
      })
    ).toMatchObject({ adopt: false, discard: false });
  });

  it('offers repair only for a rejected artifact that carries diagnostics', () => {
    expect(
      resolveDesignResultCardActions({ ...base, state: invalid, standing: { status: 'unknown' } })
    ).toMatchObject({ repair: true });
    expect(
      resolveDesignResultCardActions({
        ...base,
        state: resultState('invalid'),
        standing: { status: 'unknown' },
      })
    ).toMatchObject({ repair: false });
    for (const status of [
      'committed',
      'candidate',
      'no_artifact',
      'failed',
      'cancelled',
    ] as const) {
      expect(
        resolveDesignResultCardActions({
          ...base,
          state: resultState(status, { diagnostics: [{ code: 'x', message: 'y' }] }),
          standing: { status: 'unknown' },
        })
      ).toMatchObject({ repair: false });
    }
    expect(
      resolveDesignResultCardActions({
        ...base,
        canRepair: false,
        state: invalid,
        standing: { status: 'unknown' },
      })
    ).toMatchObject({ repair: false });
  });

  it('never offers an action a live card could take on its own', () => {
    expect(
      resolveDesignResultCardActions({
        ...base,
        state: { kind: 'live' },
        standing: { status: 'unknown' },
      })
    ).toEqual({ locate: true, adopt: false, discard: false, repair: false });
  });
});

describe('design text redaction', () => {
  it('elides absolute paths whole, including the ones with spaces in them', () => {
    expect(redactDesignText('ENOENT: open /Users/me/design.json')).toBe('ENOENT: open [path]');
    expect(redactDesignText('cannot read("/Users/me/My Files/design.json")')).toBe(
      'cannot read("[path]")'
    );
    expect(
      redactDesignText('ENOENT: open /Users/me/Library/Application Support/Folio/design.json')
    ).toBe('ENOENT: open [path]');
    expect(redactDesignText('cannot read "C:\\Users\\me\\design.json"')).toBe(
      'cannot read "[path]"'
    );
    expect(redactDesignText('cannot read C:\\Users\\First Last\\design.json now')).toBe(
      'cannot read [path] now'
    );
  });

  it('keeps relative paths, URLs, and the rest of the message intact', () => {
    expect(redactDesignText('pages/1/text.md is empty')).toBe('pages/1/text.md is empty');
    expect(redactDesignText('open /x please retry')).toBe('open /x please retry');
    expect(redactDesignText('see https://example.com/a/b for details')).toBe(
      'see https://example.com/a/b for details'
    );
  });

  it('removes credential-looking tokens and key assignments', () => {
    expect(redactDesignText('request failed with sk-abcdef1234567890')).toBe(
      'request failed with [redacted]'
    );
    expect(redactDesignText('Authorization: Bearer abcdefgh12345678')).toBe('[redacted]');
    expect(redactDesignText('api_key=supersecretvalue')).toBe('[redacted]');
    expect(redactDesignText('ghp_abcdefghijklmnop rejected')).toBe('[redacted] rejected');
  });
});

describe('design repair request', () => {
  const invalidOutcome = outcome('invalid', {
    diagnostics: [
      { code: 'PPTD-E101', message: 'pages/1 is missing text.md' },
      { code: 'design_manifest_unreadable', message: 'open /Users/me/folio/manifest.json' },
      { code: 'design_import_failed', message: 'request rejected for key sk-abcdef1234567890' },
    ],
  });

  it('composes status and bounded diagnostics in the product language', () => {
    const request = buildDesignRepairRequest(invalidOutcome, t);
    expect(request).toContain('regenerate design.pptd');
    expect(request).toContain('[PPTD-E101] pages/1 is missing text.md');
    expect(request).toContain('open [path]');
    expect(request).toContain('[redacted]');
    expect(request).not.toContain('/Users/me');
    expect(request).not.toContain('sk-abcdef1234567890');
  });

  it('bounds how many diagnostics travel and how long the request may be', () => {
    const many = Array.from({ length: 40 }, (_value, index) => ({
      code: `PPTD-E${index}`,
      message: 'x'.repeat(500),
    }));
    const request = buildDesignRepairRequest(outcome('invalid', { diagnostics: many }), t);
    expect(request.length).toBeLessThanOrEqual(MAX_DESIGN_REPAIR_REQUEST_LENGTH);
    expect(request.endsWith('\u2026')).toBe(true);

    const limited = buildDesignRepairRequest(
      outcome('invalid', {
        diagnostics: many
          .slice(0, MAX_DESIGN_REPAIR_DIAGNOSTICS + 5)
          .map((entry) => ({ ...entry, message: 'short' })),
      }),
      t
    );
    expect(limited).toContain(`1. [PPTD-E0] short`);
    expect(limited).toContain(
      `${MAX_DESIGN_REPAIR_DIAGNOSTICS}. [PPTD-E${MAX_DESIGN_REPAIR_DIAGNOSTICS - 1}] short`
    );
    expect(limited).not.toContain(`. [PPTD-E${MAX_DESIGN_REPAIR_DIAGNOSTICS}] short`);
  });

  it('renders an id short enough for a card while the full value stays available', () => {
    expect(shortDesignId(sha('a'))).toBe(`${sha('a').slice(0, 12)}\u2026`);
    expect(shortDesignId('short')).toBe('short');
  });
});

describe('design thumbnail resolution', () => {
  const png = `data:image/png;base64,${Buffer.from('not really a png').toString('base64')}`;

  it('takes the bytes the design channel returned, and nothing else', () => {
    expect(resolveDesignThumbnail({ status: 'ok', dataUri: png })).toEqual({
      status: 'ready',
      dataUri: png,
    });
  });

  it('renders no image for every answer that is not a PNG data URI', () => {
    const answers: unknown[] = [
      undefined,
      null,
      {},
      // The two honest absences the channel reports.
      { status: 'unavailable', reason: 'missing' },
      { status: 'unavailable', reason: 'unreadable' },
      // An answer this build does not know, including one with no status at all.
      { status: 'ok' },
      { dataUri: png },
      { status: 'ok', dataUri: '' },
      // Every other URL a card must never put in `src`, however it arrived.
      { status: 'ok', dataUri: 'https://example.com/a.png' },
      { status: 'ok', dataUri: 'blob:file:///a.png' },
      { status: 'ok', dataUri: 'lody-resource://abc' },
      { status: 'ok', dataUri: 'javascript:alert(1)' },
      { status: 'ok', dataUri: 'data:text/html;base64,PHNjcmlwdD4=' },
      { status: 'ok', dataUri: 'data:image/svg+xml;base64,PHN2Zz4=' },
      { status: 'ok', dataUri: 'data:image/png,notbase64' },
      { status: 'ok', dataUri: `data:image/png;base64,nope${'A'.repeat(9 * 1024 * 1024)}` },
      { status: 'ok', dataUri: 42 },
    ];
    for (const answer of answers) {
      expect(resolveDesignThumbnail(answer as never), JSON.stringify(answer)?.slice(0, 80)).toEqual(
        { status: 'none' }
      );
    }
  });
});

describe('design result copy', () => {
  it('names every string the card renders, in the shipped en locale', () => {
    const copies = [
      ...DESIGN_RESULT_STATUSES.map((status) => getDesignResultStatusCopy(status)),
      getDesignResultStatusCopy('live'),
      ...DESIGN_RESULT_STATUSES.map((status) => getDesignResultHintCopy(status)),
      getDesignResultHintCopy('live'),
      ...(['loading', 'pending', 'adopted', 'missing', 'unreadable', 'unknown'] as const).map(
        (status) => getDesignCandidateStandingCopy({ status })
      ),
      ...(
        [
          { kind: 'adopted', revisionId: sha('a') },
          { kind: 'alreadyCurrent' },
          { kind: 'refused' },
          { kind: 'discarded' },
          { kind: 'discardMissing' },
          { kind: 'repairSent' },
          { kind: 'repairBlocked' },
          { kind: 'failed' },
        ] satisfies DesignResultNotice[]
      ).map((notice) => getDesignResultNoticeCopy(notice)),
      // Not part of a copy table: the preview image's alt text, which the card
      // passes to `t` directly.
      { key: 'design.result.thumbnailAlt', defaultValue: "Preview of this turn's design" },
    ];
    expect(copies.length).toBe(6 + 1 + 6 + 1 + 6 + 8 + 1);
    for (const copy of copies) {
      expect(typeof en[copy.key], copy.key).toBe('string');
      expect(copy.defaultValue.length, copy.key).toBeGreaterThan(0);
    }
  });

  it('keeps the shipped copy free of absolute paths and credentials', () => {
    for (const [key, value] of Object.entries(en)) {
      if (!key.startsWith('design.result.')) continue;
      expect(redactDesignText(value), key).toBe(value);
    }
  });
});
