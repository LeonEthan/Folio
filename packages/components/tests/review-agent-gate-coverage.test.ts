import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(__dirname, '..', 'src', path), 'utf8');

describe('Folio developer workflow retirement', () => {
  it('keeps GitHub authentication and auto-review subscriptions out of settings', () => {
    expect(read('components/settings/settings-tabs.tsx')).not.toContain("id: 'github'");
    expect(read('components/settings/machine-agent-settings.tsx')).not.toContain(
      'ReviewPolicySection'
    );
    expect(read('components/settings/settings-data-cache.tsx')).not.toContain(
      'getWorkspaceRepositories'
    );
    // The remaining worktree setup/cleanup consumer still owns this query.
    expect(read('components/settings/settings-data-cache.tsx')).toContain(
      'listWorkspaceReposWithStatus'
    );
  });

  it('retires remote review activity while retaining generic conversation and file consumers', () => {
    const conversation = read('components/sessions/session-chat-interface.tsx');
    expect(conversation).not.toMatch(/useGitHubPrDetails|useAutoReview|AutoReviewMenuItem/);
    expect(conversation).toContain('FloatingPermissionRequest');
    expect(conversation).toContain('SessionChatInputArea');
    const diff = read('components/sessions/session-conversation-diff-panel.tsx');
    expect(diff).not.toMatch(/useGitHubReviewComments|githubCreatePRReviewComment/);
    expect(diff).toContain('useSessionAllChangesDiffData');
    expect(diff).toContain('onSendToChat');
    expect(read('components/sessions/session-detail.tsx')).not.toContain('PrTabContainer');
  });
});
