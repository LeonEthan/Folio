import { describe, it, expect } from 'vitest';
import { applyTextRewrites } from '@lody/shared';
import {
  readDesignElementReferences,
  validateDesignElementReferences,
} from '@lody/shared/design-element-reference';
import {
  buildDesignElementMentionInsertion,
  buildDesignElementMentionRewrites,
} from '../src/components/mentions/design-element-mention';
import {
  sanitizeMentionRanges,
  toPersistedMentionRanges,
} from '../src/components/mentions/mention-persistence';

describe('canonical element mentions', () => {
  it('restores the original identity and expands only its range alongside other content', () => {
    const reference = {
      artworkId: 'art',
      baselineRevisionId: 'a'.repeat(64),
      elementIds: ['title', 'subtitle'],
    };
    const insertion = buildDesignElementMentionInsertion(reference, 'Selected');
    const text = insertion.text + ' brighten, keep my attachment';
    const mentions = sanitizeMentionRanges(
      text,
      toPersistedMentionRanges([
        { start: 0, end: insertion.text.length, value: insertion.value, kind: insertion.kind },
      ])
    );
    const expanded = applyTextRewrites(text, buildDesignElementMentionRewrites(text, mentions));
    expect(readDesignElementReferences(expanded.text)).toEqual([reference]);
    expect(expanded.text.endsWith(' brighten, keep my attachment')).toBe(true);
    expect(expanded.spans?.[0]?.kind).toBe('design_element');
    expect(buildDesignElementMentionRewrites(text, [])).toEqual([]);
    const baseline = {
      revisionId: reference.baselineRevisionId,
      doc: { elements: [{ id: 'title' }, { id: 'subtitle' }, { id: 'other' }] },
    };
    expect(() => validateDesignElementReferences([reference], 'art', baseline)).not.toThrow();
    expect(() => validateDesignElementReferences([reference], 'other-art', baseline)).toThrow(
      'another artwork'
    );
    expect(() =>
      validateDesignElementReferences([reference], 'art', {
        ...baseline,
        revisionId: 'b'.repeat(64),
      })
    ).toThrow('stale');
    expect(() =>
      validateDesignElementReferences([reference], 'art', {
        ...baseline,
        doc: { elements: [{ id: 'other' }] },
      })
    ).toThrow('deleted');
  });
});
