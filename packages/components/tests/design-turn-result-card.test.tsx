// @vitest-environment jsdom

/**
 * P2.5 result card, rendered the way the conversation surface renders it.
 *
 * Every test drives the real component with injected candidate answers, so the
 * card's promises are checked against the store's actual vocabulary: a candidate
 * that exists and differs, one the canvas already matches, a refusal, a
 * candidate that is gone. The repair path asserts the one thing that matters
 * about it — nothing is sent until the user clicks, and what is sent carries no
 * absolute paths.
 */

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider, createStore } from 'jotai';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  getLodySessionPresenceKey,
  type LodyPresenceInstanceId,
  type MachineId,
  type SessionId,
} from '@lody/shared';
import { lodyPresenceNowMsAtom, lodyPresenceStatesAtom } from '../src/atoms/presence';
import {
  DesignTurnResultActionsProvider,
  DesignTurnResultCard,
  DesignTurnResultCardView,
} from '../src/components/sessions/design-turn-result-card';
import { initI18n } from '../src/i18n';

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const CANDIDATE_ID = sha('c');
const REVISION_ID = sha('e');
const SESSION_ID = 'session-1' as SessionId;
const ARTWORK_ID = 'artwork-1';

const outcome = (status: string, extra: Record<string, unknown> = {}) => ({
  version: 1,
  status,
  turnId: 'turn-1',
  artworkId: ARTWORK_ID,
  timestamp: '2026-09-10T00:00:00.000Z',
  ...extra,
});
const candidateOutcome = outcome('candidate', { candidateId: CANDIDATE_ID });

function fakeActions() {
  return {
    onLocate: vi.fn(),
    onRepair: vi.fn(async (_request: string) => true),
    candidateState: vi.fn(async (_candidateId: string) => ({ status: 'pending' })),
    onAdopt: vi.fn(async (_candidateId: string) => ({
      status: 'adopted',
      revisionId: REVISION_ID,
    })),
    onDiscard: vi.fn(async (_candidateId: string) => ({ removed: true })),
  };
}

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(async () => {
  await initI18n('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  root = undefined;
  container.remove();
  delete window.ipc;
  vi.restoreAllMocks();
});

function render(node: React.ReactElement) {
  flushSync(() => root?.render(node));
}

const settle = async () => {
  await act(async () => {});
};

const status = () =>
  container.querySelector('[data-design-result-status]')?.getAttribute('data-design-result-status');

const text = () => container.textContent ?? '';

const labels = () =>
  [...container.querySelectorAll('button')].map((button) => (button.textContent ?? '').trim());

const button = (label: string) =>
  [...container.querySelectorAll('button')].find(
    (entry) => (entry.textContent ?? '').trim() === label
  );

async function press(label: string) {
  const target = button(label);
  if (!target) throw new Error(`No button "${label}". Buttons: ${labels().join(' | ')}`);
  await act(async () => {
    target.click();
  });
  await settle();
}

describe('DesignTurnResultCardView statuses', () => {
  it('gives every durable status its own label and hint', async () => {
    const cases: Array<[string, string, string]> = [
      ['committed', 'Committed', "This turn's design was saved to the canvas."],
      ['candidate', 'Candidate kept', 'kept as a candidate to apply or discard'],
      ['invalid', 'Artifact rejected', 'failed the storage-layer structure check'],
      ['no_artifact', 'No artifact', 'produced no design.pptd'],
      ['failed', 'Failed', 'failed before an artifact could be collected'],
      ['cancelled', 'Cancelled', 'was stopped; nothing was collected'],
    ];
    for (const [state, label, hint] of cases) {
      render(
        <DesignTurnResultCardView
          key={state}
          outcome={outcome(state)}
          generating={false}
          actions={fakeActions()}
        />
      );
      await settle();
      expect(status(), state).toBe(state);
      expect(text(), state).toContain(label);
      expect(text(), state).toContain(hint);
    }
  });

  it('claims generating only while the turn recorded no outcome, and acts on nothing', async () => {
    const actions = fakeActions();
    render(<DesignTurnResultCardView outcome={undefined} generating={true} actions={actions} />);
    await settle();
    expect(status()).toBe('live');
    expect(text()).toContain('Generating');
    // Live is a claim about this moment only: no read, no write, no auto-action.
    expect(actions.candidateState).not.toHaveBeenCalled();
    expect(actions.onAdopt).not.toHaveBeenCalled();
    expect(actions.onDiscard).not.toHaveBeenCalled();
    expect(actions.onRepair).not.toHaveBeenCalled();
    expect(actions.onLocate).not.toHaveBeenCalled();
    // Locate is a view action and stays available; nothing else is offered.
    expect(labels()).toEqual(['Show on canvas']);

    render(<DesignTurnResultCardView outcome={undefined} generating={false} actions={actions} />);
    await settle();
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for an outcome this build cannot read', async () => {
    render(
      <DesignTurnResultCardView
        outcome={{ ...outcome('committed'), version: 99 }}
        generating={true}
        actions={fakeActions()}
      />
    );
    await settle();
    expect(container.innerHTML).toBe('');
  });

  it('shows a shortened ref while the full id stays inspectable', async () => {
    render(
      <DesignTurnResultCardView
        outcome={outcome('committed', { revisionId: REVISION_ID })}
        generating={false}
        actions={fakeActions()}
      />
    );
    await settle();
    const ref = container.querySelector(`code[title="${REVISION_ID}"]`);
    expect(ref?.textContent).toBe(`Revision ${REVISION_ID.slice(0, 12)}…`);
    expect(text()).not.toContain(REVISION_ID);
  });
});

describe('DesignTurnResultCardView candidate actions', () => {
  it('reads the candidate once, asks in-card before applying, then reports the store answer', async () => {
    const actions = fakeActions();
    actions.candidateState
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'adopted' });
    render(
      <DesignTurnResultCardView outcome={candidateOutcome} generating={false} actions={actions} />
    );
    await settle();
    expect(actions.candidateState).toHaveBeenCalledTimes(1);
    expect(actions.candidateState).toHaveBeenCalledWith(CANDIDATE_ID);
    expect(text()).toContain('Not applied: the canvas currently differs from this candidate.');

    await press('Apply');
    expect(text()).toContain('Apply and replace the current canvas?');
    expect(actions.onAdopt).not.toHaveBeenCalled();

    await press('Cancel');
    expect(text()).not.toContain('Apply and replace the current canvas?');
    expect(actions.onAdopt).not.toHaveBeenCalled();

    await press('Apply');
    await press('Apply');
    expect(actions.onAdopt).toHaveBeenCalledTimes(1);
    expect(actions.onAdopt).toHaveBeenCalledWith(CANDIDATE_ID);
    expect(text()).toContain(
      `Applied: the canvas now shows the candidate (revision ${REVISION_ID.slice(0, 12)}…).`
    );
    // The card re-reads the standing instead of assuming its own write landed.
    expect(actions.candidateState).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Applied: the canvas matches this candidate.');
    expect(button('Apply')).toBeUndefined();
    expect(button('Discard')).toBeDefined();
  });

  it('reports an already-matching canvas without inventing a new revision', async () => {
    const actions = fakeActions();
    actions.candidateState
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'adopted' });
    actions.onAdopt.mockResolvedValue({ status: 'adopted', alreadyCurrent: true });
    render(
      <DesignTurnResultCardView outcome={candidateOutcome} generating={false} actions={actions} />
    );
    await settle();
    await press('Apply');
    await press('Apply');
    expect(text()).toContain(
      'The canvas already matched this candidate; no new revision was written.'
    );
    expect(button('Apply')).toBeUndefined();
  });

  it('keeps the candidate and says so when the canvas moved before the write', async () => {
    const actions = fakeActions();
    actions.onAdopt.mockResolvedValue({ status: 'rejected' });
    render(
      <DesignTurnResultCardView outcome={candidateOutcome} generating={false} actions={actions} />
    );
    await settle();
    await press('Apply');
    await press('Apply');
    expect(text()).toContain(
      'The canvas changed again after your confirmation, so nothing was overwritten. The candidate is still kept.'
    );
    // Still kept means still offerable: the refusal is not a discard.
    expect(button('Apply')).toBeDefined();
    expect(button('Discard')).toBeDefined();
    expect(actions.onDiscard).not.toHaveBeenCalled();
  });

  it('offers nothing for a candidate that is already gone, and tolerates a discard of it', async () => {
    const actions = fakeActions();
    actions.candidateState.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'missing',
    });
    render(
      <DesignTurnResultCardView outcome={candidateOutcome} generating={false} actions={actions} />
    );
    await settle();
    expect(text()).toContain('This candidate was discarded or no longer exists');
    expect(button('Apply')).toBeUndefined();
    expect(button('Discard')).toBeUndefined();
  });

  it('discards only the candidate and never applies anything', async () => {
    const actions = fakeActions();
    actions.candidateState
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'unavailable', reason: 'missing' });
    render(
      <DesignTurnResultCardView outcome={candidateOutcome} generating={false} actions={actions} />
    );
    await settle();
    await press('Discard');
    expect(actions.onDiscard).toHaveBeenCalledTimes(1);
    expect(actions.onDiscard).toHaveBeenCalledWith(CANDIDATE_ID);
    expect(actions.onAdopt).not.toHaveBeenCalled();
    expect(actions.onRepair).not.toHaveBeenCalled();
    expect(text()).toContain('Candidate discarded; the canvas is unchanged.');
    expect(text()).toContain('This candidate was discarded or no longer exists');
    expect(button('Apply')).toBeUndefined();
    expect(button('Discard')).toBeUndefined();
  });

  it('reports a candidate that was already gone when discard ran', async () => {
    const actions = fakeActions();
    actions.onDiscard.mockResolvedValue({ removed: false });
    render(
      <DesignTurnResultCardView outcome={candidateOutcome} generating={false} actions={actions} />
    );
    await settle();
    await press('Discard');
    expect(text()).toContain('The candidate was already gone; the canvas is unchanged.');
  });
});

describe('DesignTurnResultCardView repair', () => {
  const invalidOutcome = outcome('invalid', {
    diagnostics: [
      { code: 'PPTD-E101', message: 'pages/1 is missing text.md' },
      {
        code: 'design_manifest_unreadable',
        message: 'open /Users/me/Library/Application Support/Folio/x.json',
      },
    ],
  });

  it('sends the composed request only when the user asks, with no path in it', async () => {
    const actions = fakeActions();
    render(
      <DesignTurnResultCardView outcome={invalidOutcome} generating={false} actions={actions} />
    );
    await settle();
    expect(actions.onRepair).not.toHaveBeenCalled();
    expect(text()).not.toContain('/Users/me');

    await press('Ask the agent to fix');
    expect(actions.onRepair).toHaveBeenCalledTimes(1);
    const request = actions.onRepair.mock.calls[0][0];
    expect(request).toContain('regenerate design.pptd');
    expect(request).toContain('[PPTD-E101] pages/1 is missing text.md');
    expect(request).toContain('[path]');
    expect(request).not.toContain('/Users/me');
    expect(text()).toContain('Repair request sent.');
  });

  it('reports a blocked repair honestly and offers none where there is nothing to fix', async () => {
    const actions = fakeActions();
    actions.onRepair.mockResolvedValue(false);
    render(
      <DesignTurnResultCardView outcome={invalidOutcome} generating={false} actions={actions} />
    );
    await settle();
    await press('Ask the agent to fix');
    expect(text()).toContain(
      'The repair request could not be sent; the canvas and your draft are unchanged.'
    );

    render(
      <DesignTurnResultCardView
        key="committed"
        outcome={outcome('committed', { revisionId: REVISION_ID })}
        generating={false}
        actions={actions}
      />
    );
    await settle();
    expect(button('Ask the agent to fix')).toBeUndefined();

    render(
      <DesignTurnResultCardView
        key="invalid-empty"
        outcome={outcome('invalid')}
        generating={false}
        actions={actions}
      />
    );
    await settle();
    expect(button('Ask the agent to fix')).toBeUndefined();
  });
});

describe('DesignTurnResultCardView diagnostics', () => {
  it('keeps diagnostics collapsed, bounded, and free of paths', async () => {
    const diagnostics = Array.from({ length: 30 }, (_value, index) => ({
      code: `PPTD-E${index}`,
      message: `doc-${index} at /Users/me/Folio/design-${index}.json`,
    }));
    render(
      <DesignTurnResultCardView
        outcome={outcome('invalid', { diagnostics })}
        generating={false}
        actions={fakeActions()}
      />
    );
    await settle();
    expect(text()).not.toContain('doc-0');
    expect(button('Diagnostics (20)')).toBeDefined();

    await press('Diagnostics (20)');
    expect(container.querySelectorAll('li')).toHaveLength(20);
    expect(text()).toContain('doc-19');
    expect(text()).not.toContain('doc-20');
    expect(text()).not.toContain('/Users/me');
    expect(text()).toContain('[path]');

    await press('Hide diagnostics');
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
});

describe('DesignTurnResultCard through the design IPC', () => {
  function installDesignIpc() {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'design.candidateState') return { status: 'pending' };
      if (channel === 'design.adoptCandidate')
        return { status: 'adopted', revisionId: REVISION_ID };
      if (channel === 'design.discardCandidate') return { removed: true };
      throw new Error(`unexpected invoke ${channel}`);
    });
    window.ipc = { invoke, on: () => () => {}, send: () => {} };
    return invoke;
  }

  it('routes the candidate read and the apply through the design channel', async () => {
    const invoke = installDesignIpc();
    const onLocate = vi.fn();
    const onRepair = vi.fn(async (_request: string) => true);
    render(
      <DesignTurnResultActionsProvider onLocate={onLocate} onRepair={onRepair}>
        <DesignTurnResultCard
          sessionId={SESSION_ID}
          artworkId={ARTWORK_ID}
          outcome={candidateOutcome}
          isLatestUserTurn={false}
        />
      </DesignTurnResultActionsProvider>
    );
    await settle();
    expect(invoke).toHaveBeenCalledWith('design.candidateState', ARTWORK_ID, CANDIDATE_ID);

    await press('Show on canvas');
    expect(onLocate).toHaveBeenCalledTimes(1);

    await press('Apply');
    await press('Apply');
    expect(invoke).toHaveBeenCalledWith('design.adoptCandidate', ARTWORK_ID, CANDIDATE_ID);
    expect(onRepair).not.toHaveBeenCalled();
  });

  it('calls nothing at all while the trailing turn is still running', async () => {
    const invoke = installDesignIpc();
    const onRepair = vi.fn(async (_request: string) => true);
    const store = createStore();
    const updatedAt = 1_000_000;
    store.set(lodyPresenceNowMsAtom, updatedAt);
    store.set(lodyPresenceStatesAtom, {
      [getLodySessionPresenceKey(SESSION_ID, 'instance-1' as LodyPresenceInstanceId)]: {
        kind: 'session',
        sessionId: SESSION_ID,
        machineId: 'machine-1' as MachineId,
        instanceId: 'instance-1' as LodyPresenceInstanceId,
        status: { type: 'running' },
        updatedAt,
      },
    });
    render(
      <Provider store={store}>
        <DesignTurnResultActionsProvider onRepair={onRepair}>
          <DesignTurnResultCard
            sessionId={SESSION_ID}
            artworkId={ARTWORK_ID}
            outcome={undefined}
            isLatestUserTurn={true}
          />
        </DesignTurnResultActionsProvider>
      </Provider>
    );
    await settle();
    expect(status()).toBe('live');
    expect(text()).toContain('Generating');
    expect(invoke).not.toHaveBeenCalled();
    expect(onRepair).not.toHaveBeenCalled();
    expect(labels()).toEqual([]);
  });
});

describe('DesignTurnResultCard thumbnail', () => {
  const THUMBNAIL_PATH = `design-thumbnail/${sha('f')}.png`;
  const DATA_URI = `data:image/png;base64,${Buffer.from('rendered').toString('base64')}`;
  const committedWithThumbnail = outcome('committed', {
    revisionId: REVISION_ID,
    thumbnail: { path: THUMBNAIL_PATH, width: 320, height: 200 },
  });

  const image = () => container.querySelector<HTMLImageElement>('[data-design-result-thumbnail]');

  it('shows the preview the outcome recorded, at the size it recorded', async () => {
    const actions = {
      ...fakeActions(),
      thumbnail: vi.fn(async () => ({ status: 'ok', dataUri: DATA_URI })),
    };
    render(
      <DesignTurnResultCardView
        outcome={committedWithThumbnail}
        generating={false}
        actions={actions}
      />
    );
    await settle();

    expect(actions.thumbnail).toHaveBeenCalledTimes(1);
    expect(actions.thumbnail).toHaveBeenCalledWith(THUMBNAIL_PATH);
    const preview = image();
    expect(preview?.getAttribute('src')).toBe(DATA_URI);
    // The recorded pixel size is what reserves the box before the image decodes.
    expect(preview?.getAttribute('width')).toBe('320');
    expect(preview?.getAttribute('height')).toBe('200');
    expect(preview?.getAttribute('alt')).toBe("Preview of this turn's design");
  });

  it('reads nothing, and shows nothing, when the outcome carries no reference', async () => {
    const actions = {
      ...fakeActions(),
      thumbnail: vi.fn(async () => ({ status: 'ok', dataUri: DATA_URI })),
    };
    render(
      <DesignTurnResultCardView
        outcome={outcome('committed', { revisionId: REVISION_ID })}
        generating={false}
        actions={actions}
      />
    );
    await settle();

    expect(actions.thumbnail).not.toHaveBeenCalled();
    expect(image()).toBeNull();
    // The verdict is untouched: a card with no preview is still a full card.
    expect(status()).toBe('committed');
  });

  it('shows no image when the reference no longer resolves, and never an error', async () => {
    const actions = {
      ...fakeActions(),
      thumbnail: vi.fn(async () => ({ status: 'unavailable', reason: 'missing' })),
    };
    render(
      <DesignTurnResultCardView
        outcome={committedWithThumbnail}
        generating={false}
        actions={actions}
      />
    );
    await settle();

    expect(actions.thumbnail).toHaveBeenCalledTimes(1);
    expect(image()).toBeNull();
    expect(status()).toBe('committed');
    expect(text()).toContain("This turn's design was saved to the canvas.");
  });

  it('treats a failed read as an absent picture rather than a broken card', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const actions = {
      ...fakeActions(),
      thumbnail: vi.fn(async () => {
        throw new Error('the design worker is gone');
      }),
    };
    render(
      <DesignTurnResultCardView
        outcome={committedWithThumbnail}
        generating={false}
        actions={actions}
      />
    );
    await settle();

    expect(image()).toBeNull();
    expect(status()).toBe('committed');
    expect(warn).toHaveBeenCalled();
  });

  it('keeps the preview for a candidate the canvas already matches', async () => {
    const actions = {
      ...fakeActions(),
      thumbnail: vi.fn(async () => ({ status: 'ok', dataUri: DATA_URI })),
    };
    actions.candidateState.mockResolvedValue({ status: 'adopted' });
    render(
      <DesignTurnResultCardView
        outcome={outcome('candidate', {
          candidateId: CANDIDATE_ID,
          thumbnail: { path: THUMBNAIL_PATH, width: 320, height: 200 },
        })}
        generating={false}
        actions={actions}
      />
    );
    await settle();

    // The image describes what the turn produced, which stays true whatever the
    // candidate's later standing is — so it is not tied to the apply/discard
    // affordances above it.
    expect(image()?.getAttribute('src')).toBe(DATA_URI);
    expect(button('Apply')).toBeUndefined();
  });

  it('reads the preview through the design channel, once per recorded reference', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'design.thumbnail') return { status: 'ok', dataUri: DATA_URI };
      throw new Error(`unexpected invoke ${channel}`);
    });
    window.ipc = { invoke, on: () => () => {}, send: () => {} };
    render(
      <DesignTurnResultActionsProvider>
        <DesignTurnResultCard
          sessionId={SESSION_ID}
          artworkId={ARTWORK_ID}
          outcome={committedWithThumbnail}
          isLatestUserTurn={false}
        />
      </DesignTurnResultActionsProvider>
    );
    await settle();

    expect(invoke).toHaveBeenCalledWith('design.thumbnail', ARTWORK_ID, THUMBNAIL_PATH);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(image()?.getAttribute('src')).toBe(DATA_URI);
  });
});
