import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { cloudOperations } from '@/lib/cloud-api-operations';
import type { WorktreeCleanupScriptConfig, WorktreeSetupScriptConfig } from '@lody/shared';
import { currentWorkspaceIdAtom } from '@/atoms/workspace-context';
import { useOrganization } from '@/hooks/useOrganization';

import { useCloudQuery } from '@lody/platform/react';

export type SettingsUsageRange = 'day' | 'week' | 'month' | 'total';

export type SettingsUsageTimelineData = {
  workspaceId: string;
  range: SettingsUsageRange;
  startMs: number;
  endMs: number;
  bucketSizeMs: number;
  totals: {
    tokens: number;
    costUSD: number;
    /** Token-type split of the range. Absent when the deployment does not report it. */
    breakdown?: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      reasoningOutputTokens: number;
    };
  };
  users?: Record<
    string,
    {
      name?: string;
      email?: string;
      image?: string | null;
    }
  >;
  buckets: SettingsUsageTimelineBucket[];
};

export type SettingsUsageTimelineBucket = {
  bucketStartMs: number;
  bucketLabel: string;
  tokens: number;
  costUSD: number;
  byModel: Array<{ modelId: string; tokens: number; costUSD: number }>;
  byUser: Array<{ userId: string; tokens: number; costUSD: number }>;
};

export type SettingsUsageCalendarData = {
  workspaceId: string;
  timezone: 'UTC';
  startMs: number;
  endMs: number;
  days: Array<{
    dayStartMs: number;
    date: string;
    tokens: number;
    costUSD: number;
    isFuture: boolean;
  }>;
};

/** Per-day breakdown behind a single usage-calendar cell. */
export type SettingsUsageDayData = {
  workspaceId: string;
  dayStartMs: number;
  date: string;
  totals: {
    tokens: number;
    costUSD: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    reasoningOutputTokens: number;
    webSearchRequests: number;
  };
  byModel: Array<{ modelId: string; tokens: number; costUSD: number }>;
  byUser: Array<{ userId: string; tokens: number; costUSD: number }>;
  users: Record<string, { name?: string; email?: string; image?: string | null }>;
};

export type SettingsWorkspaceRepository = {
  id: number;
  fullName: string;
  name: string;
  private: boolean;
};

export type SettingsWorkspaceRepoWithStatus = {
  repoFullName: string;
  name: string;
  repositoryId: number;
  private: boolean;
  enabled: boolean;
  worktreeSetup?: WorktreeSetupScriptConfig;
  worktreeCleanup?: WorktreeCleanupScriptConfig;
};

type SettingsDataCacheContextValue = {
  workspaceId: string | null;
  usageTimelineByRange: Partial<Record<SettingsUsageRange, SettingsUsageTimelineData | undefined>>;
  usageCalendar: SettingsUsageCalendarData | undefined;
};

const SettingsDataCacheContext = createContext<SettingsDataCacheContextValue | null>(null);

export function SettingsDataCacheProvider({ children }: { children: ReactNode }) {
  const { activeOrganization } = useOrganization();
  const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
  // Removal clears the atom before Better Auth drops its stale active organization.
  const workspaceId = activeOrganization?.id === currentWorkspaceId ? currentWorkspaceId : null;
  // Preload all stats ranges once at settings-root level to avoid re-fetch when switching tabs.
  const dayUsage = useCloudQuery(
    cloudOperations.usage.getWorkspaceUsageTimeline,
    workspaceId ? { workspaceId, range: 'day', granularity: 'hour' } : 'skip'
  ) as SettingsUsageTimelineData | undefined;
  const weekUsage = useCloudQuery(
    cloudOperations.usage.getWorkspaceUsageTimeline,
    workspaceId ? { workspaceId, range: 'week', granularity: 'hour' } : 'skip'
  ) as SettingsUsageTimelineData | undefined;
  const monthUsage = useCloudQuery(
    cloudOperations.usage.getWorkspaceUsageTimeline,
    workspaceId ? { workspaceId, range: 'month' } : 'skip'
  ) as SettingsUsageTimelineData | undefined;
  const totalUsage = useCloudQuery(
    cloudOperations.usage.getWorkspaceUsageTimeline,
    workspaceId ? { workspaceId, range: 'total' } : 'skip'
  ) as SettingsUsageTimelineData | undefined;
  const usageCalendar = useCloudQuery(
    cloudOperations.usage.getWorkspaceUsageCalendar,
    workspaceId ? { workspaceId } : 'skip'
  ) as SettingsUsageCalendarData | undefined;

  const usageTimelineByRange = useMemo(
    () => ({
      day: dayUsage,
      week: weekUsage,
      month: monthUsage,
      total: totalUsage,
    }),
    [dayUsage, monthUsage, totalUsage, weekUsage]
  );

  const value = useMemo<SettingsDataCacheContextValue>(
    () => ({
      workspaceId,
      usageTimelineByRange,
      usageCalendar,
    }),
    [usageTimelineByRange, usageCalendar, workspaceId]
  );

  return (
    <SettingsDataCacheContext.Provider value={value}>{children}</SettingsDataCacheContext.Provider>
  );
}

export function useSettingsDataCache() {
  const context = useContext(SettingsDataCacheContext);
  if (!context) {
    throw new Error('useSettingsDataCache must be used within SettingsDataCacheProvider');
  }
  return context;
}

/**
 * Fetch the breakdown behind one usage-calendar cell. Kept out of the provider
 * because it is on-demand: nothing is queried until a day is selected.
 */
export function useSettingsUsageDay(dayStartMs: number | null): {
  day: SettingsUsageDayData | undefined;
  loading: boolean;
} {
  const { workspaceId } = useSettingsDataCache();
  const day = useCloudQuery(
    cloudOperations.usage.getWorkspaceUsageDay,
    workspaceId && dayStartMs !== null ? { workspaceId, dayStartMs } : 'skip'
  ) as SettingsUsageDayData | undefined;

  return {
    day,
    loading: dayStartMs !== null && day?.dayStartMs !== dayStartMs,
  };
}
