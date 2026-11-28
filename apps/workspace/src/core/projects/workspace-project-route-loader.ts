import { notFound } from '@tanstack/react-router';

import type { WorkspaceMode } from '@/config/workspace-modes';
import {
  buildLocalizedProjectDetailPath,
  parseProjectEntryIntent,
} from '@/core/projects/project-entry';
import { syncDramaCanvas } from '@/core/drama/sync-canvas';
import { loadProjectWithLatestSnapshotFn } from '@/core/projects/server-functions';
import { getLocale } from '@/core/workspace-lib/shims/next-intl-server';

export async function loadWorkspaceProjectRoute({
  projectId,
  search,
  workspaceMode,
}: {
  projectId: string;
  search: Record<string, string | undefined>;
  workspaceMode: WorkspaceMode;
}) {
  const locale = getLocale();
  const { target, model, prompt, focus } = parseProjectEntryIntent(search);

  let projectState = await loadProjectWithLatestSnapshotFn({
    data: { projectId },
  });

  if (!projectState) throw notFound();

  let snapshot = projectState.snapshot;
  let snapshotVersion = projectState.snapshotVersion;
  if (workspaceMode === 'canvas') {
    try {
      await syncDramaCanvas(projectId);
      const refreshed = await loadProjectWithLatestSnapshotFn({
        data: { projectId },
      });
      if (refreshed) {
        snapshot = refreshed.snapshot;
        snapshotVersion = refreshed.snapshotVersion;
        projectState = refreshed;
      }
    } catch {
      // 打开画布失败时仍展示已有快照，不阻断进入。
    }
  }

  return {
    locale,
    project: projectState.project,
    snapshot,
    snapshotVersion,
    target: target ?? null,
    modelId: model ?? null,
    prompt: prompt ?? null,
    focusCardId: focus ?? null,
    projectPath: buildLocalizedProjectDetailPath({
      locale,
      projectId: projectState.project.id,
      mode: workspaceMode,
    }),
    workspaceMode,
  };
}
