import { describe, expect, it } from 'vitest';
import { DesignSyncBaseline, type DesignReadSnapshot } from './sync-baseline';

const snapshot = (revisionId = 'v1'): DesignReadSnapshot => ({
  artworkId: 'art',
  draftId: 'draft',
  revisionId,
  files: new Map([
    ['design.pptd', Buffer.from('entry')],
    ['pages/one.pptd', Buffer.from('page')],
  ]),
});
const read = (
  service: DesignSyncBaseline,
  id: string,
  file: string,
  text: string,
  revisionId = 'v1'
) => {
  service.beginRead(id, snapshot(revisionId), file);
  service.finishRead(id, { text, isError: false, partial: false });
};
const current = { artworkId: 'art', draftId: 'draft', revisionId: 'v1' };

describe('design content delivery baseline', () => {
  it('requires complete successful exact content and a subsequent generation', () => {
    const service = new DesignSyncBaseline();
    service.beginGeneration('batch1');
    read(service, 'r1', 'design.pptd', 'entry');
    expect(() => service.checkWrite('batch1', current)).toThrow('DESIGN_READ_REQUIRED');
    read(service, 'r2', 'pages/one.pptd', 'page');
    expect(() => service.checkWrite('batch1', current)).toThrow('DESIGN_READ_REQUIRED');
    service.beginGeneration('batch2');
    expect(service.checkWrite('batch2', current).revisionId).toBe('v1');
  });

  it.each([
    { isError: true, partial: false, text: 'page' },
    { isError: false, partial: true, text: 'page' },
    { isError: false, partial: false, text: 'different' },
  ])('rejects failed/partial/different read %j', (result) => {
    const service = new DesignSyncBaseline();
    read(service, 'r1', 'design.pptd', 'entry');
    service.beginRead('r2', snapshot(), 'pages/one.pptd');
    service.finishRead('r2', result);
    service.finishRead('r2', { text: 'page', isError: false, partial: false });
    service.beginGeneration('batch');
    expect(() => service.checkWrite('batch', current)).toThrow('DESIGN_READ_REQUIRED');
  });

  it('does not mix revisions or replay a duplicate read call', () => {
    const service = new DesignSyncBaseline();
    read(service, 'r1', 'design.pptd', 'entry');
    read(service, 'r2', 'pages/one.pptd', 'page', 'v2');
    expect(() => service.beginRead('r1', snapshot(), 'pages/one.pptd')).toThrow('Duplicate');
    service.beginGeneration('batch');
    expect(() => service.checkWrite('batch', current)).toThrow('DESIGN_READ_REQUIRED');
  });

  it('never rebases an existing attempt when later reads succeed', () => {
    const service = new DesignSyncBaseline();
    read(service, 'r1', 'design.pptd', 'entry');
    read(service, 'r2', 'pages/one.pptd', 'page');
    service.beginGeneration('batch1');
    service.checkWrite('batch1', current);
    read(service, 'r3', 'design.pptd', 'entry', 'v2');
    read(service, 'r4', 'pages/one.pptd', 'page', 'v2');
    service.beginGeneration('batch2');
    expect(() => service.checkWrite('batch2', { ...current, revisionId: 'v2' })).toThrow(
      'DESIGN_READ_STALE'
    );
    expect(service.getAttempt()?.revisionId).toBe('v1');
  });
});

it('accumulates native 2000-line continuation ranges, retaining holes and revision boundaries', () => {
  const service = new DesignSyncBaseline();
  const text = Array.from({ length: 4001 }, (_, index) => `line ${index}`).join('\n');
  const large = { ...snapshot(), files: new Map([['pages/design.page', Buffer.from(text)]]) };
  const lines = text.split('\n');
  const deliver = (id: string, offset: number, count: number) => {
    service.beginRead(id, large, 'pages/design.page', { offset, limit: count });
    service.finishRead(id, {
      isError: false,
      partial: false,
      text: lines.slice(offset - 1, offset - 1 + count).join('\n'),
    });
  };
  deliver('first', 1, 2000);
  deliver('last', 4001, 1);
  deliver('duplicate-range', 1, 2000);
  service.beginGeneration('incomplete');
  expect(() => service.checkWrite('incomplete', current)).toThrow('DESIGN_READ_REQUIRED');
  deliver('middle', 2001, 2000);
  service.beginGeneration('complete');
  expect(service.checkWrite('complete', current).revisionId).toBe('v1');
});

it('never lends an established attempt to arguments generated before successful reads', () => {
  const service = new DesignSyncBaseline();
  service.beginGeneration('old');
  read(service, 'entry', 'design.pptd', 'entry');
  read(service, 'page', 'pages/one.pptd', 'page');
  service.beginGeneration('ready');
  service.checkWrite('ready', current);
  expect(() => service.checkWrite('old', current)).toThrow('DESIGN_READ_REQUIRED');
});

it('explicit resubmission alone changes baseline and invalidates all earlier generated arguments', () => {
  const service = new DesignSyncBaseline();
  read(service, 'entry1', 'design.pptd', 'entry');
  read(service, 'page1', 'pages/one.pptd', 'page');
  service.beginGeneration('old');
  service.checkWrite('old', current);
  service.beginGeneration('read-new');
  read(service, 'entry2', 'design.pptd', 'entry', 'v2');
  read(service, 'page2', 'pages/one.pptd', 'page', 'v2');
  const next = { ...current, revisionId: 'v2' };
  expect(() => service.resubmit('read-new', next)).toThrow('DESIGN_READ_STALE');
  service.beginGeneration('resubmit');
  service.resubmit('resubmit', next);
  expect(service.getAttempt()).toMatchObject({ revisionId: 'v2', explicitResubmission: true });
  expect(() => service.resubmit('resubmit', next)).toThrow('DESIGN_ATTEMPT_STALE');
  expect(() => service.checkWrite('resubmit', next)).toThrow('DESIGN_ATTEMPT_STALE');
  expect(() => service.checkWrite('old', next)).toThrow('DESIGN_ATTEMPT_STALE');
  service.beginGeneration('after');
  expect(service.checkWrite('after', next).revisionId).toBe('v2');
});
