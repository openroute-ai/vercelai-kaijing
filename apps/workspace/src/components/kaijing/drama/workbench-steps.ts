export const WORKBENCH_STEPS = [
  { id: 'input', label: '输入', hint: '小说或一句话' },
  { id: 'script', label: '剧本', hint: '改写后的正文' },
  { id: 'assets', label: '角色与场景', hint: '资产卡片与形象' },
  { id: 'board', label: '分镜板', hint: '镜头卡与预览' },
  { id: 'produce', label: '出片', hint: '做一集与生成状态' },
  { id: 'finish', label: '成片', hint: '时间线与导出' },
] as const;

export type WorkbenchStepId = (typeof WORKBENCH_STEPS)[number]['id'];

export type WorkbenchDraftLike = {
  script?: { sourceText?: string; body?: string } | null
  characters?: unknown[]
  scenes?: unknown[]
  props?: unknown[]
  storyboard?: { shots?: Array<{ status?: string; videoAssetId?: string | null }> } | null
};

export function stepIndex(id: WorkbenchStepId) {
  return WORKBENCH_STEPS.findIndex((step) => step.id === id);
}

export function adjacentStep(id: WorkbenchStepId, delta: -1 | 1): WorkbenchStepId | null {
  const next = stepIndex(id) + delta;
  return WORKBENCH_STEPS[next]?.id ?? null;
}

export function inferWorkbenchStep(draft: WorkbenchDraftLike | null | undefined): WorkbenchStepId {
  if (!draft) return 'input';
  const source = draft.script?.sourceText?.trim() ?? '';
  const body = draft.script?.body?.trim() ?? '';
  const shots = draft.storyboard?.shots ?? [];
  const ready = shots.filter((shot) => shot.status === 'ready' && shot.videoAssetId);
  if (ready.length > 0 && ready.length === shots.length && shots.length > 0) return 'finish';
  if (shots.length > 0 && shots.some((shot) => shot.status === 'generating' || shot.status === 'ready' || shot.status === 'failed')) {
    return 'produce';
  }
  if (shots.length > 0) return 'board';
  const assets =
    (draft.characters?.length ?? 0) + (draft.scenes?.length ?? 0) + (draft.props?.length ?? 0);
  if (assets > 0) return 'assets';
  if (body) return 'script';
  if (source) return 'script';
  return 'input';
}

export function assetPreviewUrl(projectId: string, assetId: string | null | undefined) {
  if (!assetId) return null;
  return `/api/app/projects/${projectId}/assets/${assetId}`;
}
