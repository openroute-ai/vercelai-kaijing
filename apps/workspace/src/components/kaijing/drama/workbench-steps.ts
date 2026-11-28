export const WORKBENCH_SECTIONS = [
  {
    id: 'script',
    label: '剧本',
    items: [
      { id: 'raw', label: '原始内容', hint: '小说、一句话或大纲' },
      { id: 'rewrite', label: 'AI 改写', hint: '全高编辑改写后的剧本' },
    ],
  },
  {
    id: 'production',
    label: '制作',
    items: [
      { id: 'assets', label: '资产制作', hint: '角色、场景与道具' },
      { id: 'videos', label: '视频制作', hint: '分镜拆分与出片' },
    ],
  },
  {
    id: 'export',
    label: '导出',
    items: [
      { id: 'export', label: '拼接导出', hint: '镜头一览与成片' },
    ],
  },
] as const;

export type WorkbenchSectionId = (typeof WORKBENCH_SECTIONS)[number]['id'];
export type WorkbenchStepId = (typeof WORKBENCH_SECTIONS)[number]['items'][number]['id'];

export const WORKBENCH_STEPS = WORKBENCH_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, sectionId: section.id }))
);

const LEGACY_STEP: Record<string, WorkbenchStepId> = {
  input: 'raw',
  script: 'rewrite',
  board: 'videos',
  produce: 'videos',
  finish: 'export',
};

export type WorkbenchDraftLike = {
  script?: { sourceText?: string; body?: string } | null
  characters?: unknown[]
  scenes?: unknown[]
  props?: unknown[]
  storyboard?: { shots?: Array<{ status?: string; videoAssetId?: string | null }> } | null
};

export type NamedEntity = {
  id?: string
  name: string
  assetId?: string | null
};

export function isWorkbenchStepId(value: string): value is WorkbenchStepId {
  return WORKBENCH_STEPS.some((step) => step.id === value);
}

export function normalizeWorkbenchStep(value: string | null | undefined): WorkbenchStepId {
  if (!value) return 'raw';
  if (isWorkbenchStepId(value)) return value;
  return LEGACY_STEP[value] ?? 'raw';
}

export function stepIndex(id: WorkbenchStepId) {
  return WORKBENCH_STEPS.findIndex((step) => step.id === id);
}

export function sectionOf(id: WorkbenchStepId) {
  return WORKBENCH_SECTIONS.find((section) => section.items.some((item) => item.id === id)) ?? WORKBENCH_SECTIONS[0];
}

export function adjacentStep(id: WorkbenchStepId, delta: -1 | 1): WorkbenchStepId | null {
  const next = stepIndex(id) + delta;
  return WORKBENCH_STEPS[next]?.id ?? null;
}

export function inferWorkbenchStep(draft: WorkbenchDraftLike | null | undefined): WorkbenchStepId {
  if (!draft) return 'raw';
  const source = draft.script?.sourceText?.trim() ?? '';
  const body = draft.script?.body?.trim() ?? '';
  const shots = draft.storyboard?.shots ?? [];
  const ready = shots.filter((shot) => shot.status === 'ready' && shot.videoAssetId);
  if (ready.length > 0 && ready.length === shots.length && shots.length > 0) return 'export';
  if (shots.length > 0) return 'videos';
  const assets =
    (draft.characters?.length ?? 0) + (draft.scenes?.length ?? 0) + (draft.props?.length ?? 0);
  if (assets > 0) return 'assets';
  if (body) return 'rewrite';
  if (source) return 'raw';
  return 'raw';
}

export type SectionProgress = 'todo' | 'active' | 'done';

export function sectionProgress(
  sectionId: WorkbenchSectionId,
  draft: WorkbenchDraftLike | null | undefined,
  current: WorkbenchStepId
): SectionProgress {
  const currentSection = sectionOf(current).id;
  const body = Boolean(draft?.script?.body?.trim());
  const shots = draft?.storyboard?.shots ?? [];
  const allReady =
    shots.length > 0 && shots.every((shot) => shot.status === 'ready' && shot.videoAssetId);
  const hasAssets =
    (draft?.characters?.length ?? 0) + (draft?.scenes?.length ?? 0) + (draft?.props?.length ?? 0) > 0;
  if (sectionId === 'script') {
    if (body) return 'done';
    return currentSection === 'script' ? 'active' : 'todo';
  }
  if (sectionId === 'production') {
    if (allReady) return 'done';
    if (shots.length > 0 || hasAssets || currentSection === 'production') return 'active';
    return 'todo';
  }
  if (allReady) return 'done';
  return currentSection === 'export' ? 'active' : 'todo';
}

export function assetPreviewUrl(projectId: string, assetId: string | null | undefined) {
  if (!assetId) return null;
  return `/api/app/projects/${projectId}/assets/${assetId}`;
}

export function entitiesMentionedInText(text: string, entities: NamedEntity[]): NamedEntity[] {
  const haystack = text.toLowerCase();
  const seen = new Set<string>();
  const hits: NamedEntity[] = [];
  for (const entity of entities) {
    const name = entity.name.trim();
    if (name.length < 1) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (haystack.includes(key)) {
      seen.add(key);
      hits.push(entity);
    }
  }
  return hits;
}

export function selectReadyShotsForExport<T extends { id?: string; status?: string; videoAssetId?: string | null }>(
  shots: T[],
  selectedIds?: string[] | null
): { ready: T[]; skipped: T[]; message?: string } {
  const wanted = selectedIds?.length ? new Set(selectedIds) : null;
  const pool = wanted ? shots.filter((shot) => shot.id && wanted.has(shot.id)) : shots;
  const ready = pool.filter((shot) => shot.status === 'ready' && Boolean(shot.videoAssetId));
  const skipped = pool.filter((shot) => !(shot.status === 'ready' && shot.videoAssetId));
  if (ready.length === 0) {
    return {
      ready,
      skipped,
      message: wanted
        ? '勾选的镜头里没有真实视频，不能铺轨或假装已经成片。'
        : '没有真实的镜头视频，不能铺进时间线或假装已经成片。',
    };
  }
  return { ready, skipped };
}
