import {
  DesignElementReferenceSchema,
  formatDesignElementReference,
  type DesignElementReference,
} from '@lody/shared/design-element-reference';
import type { TextRewrite } from '@lody/shared';
import type { MentionInsertRequest } from '@/ui/mention/index';

export function buildDesignElementMentionInsertion(
  reference: DesignElementReference,
  label: string
): MentionInsertRequest {
  return {
    text: '@' + label,
    value: JSON.stringify(DesignElementReferenceSchema.parse(reference)),
    kind: 'design_element',
    separate: true,
    suffix: ' ',
  };
}

export function buildDesignElementMentionRewrites(
  text: string,
  mentions: readonly { start: number; end: number; value: string; kind?: string }[]
): TextRewrite[] {
  return mentions
    .filter((mention) => mention.kind === 'design_element')
    .map((mention) => ({
      start: mention.start,
      end: mention.end,
      replacement: formatDesignElementReference(
        DesignElementReferenceSchema.parse(JSON.parse(mention.value))
      ),
      span: {
        kind: 'design_element',
        label: text.slice(mention.start, mention.end),
        target: mention.value,
      },
    }));
}
