/**
 * 「做一集」交互编排。导演命令尚未实现时，只返回真实的占位状态，不伪造出片结果。
 */
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { dramaRuns, project } from '@/config/db/schema';
import { getDb } from '@/core/workspace-lib/db-adapter';

import { loadDramaDraft, type DramaDraft } from './persist';

export const EPISODE_STEPS = [
  {
    id: 'rewrite_script',
    label: '改写剧本',
    kind: 'text',
    readyWhen: 'M2',
  },
  {
    id: 'extract_entities',
    label: '提取角色、场景、道具',
    kind: 'text',
    readyWhen: 'M2',
  },
  {
    id: 'breakdown_storyboard',
    label: '拆分镜',
    kind: 'text',
    readyWhen: 'M2',
  },
  {
    id: 'write_prompts',
    label: '写提示词',
    kind: 'text',
    readyWhen: 'M2',
  },
  {
    id: 'generate_character_image',
    label: '生成角色形象',
    kind: 'generate',
    readyWhen: 'M4',
  },
  {
    id: 'generate_shot_video',
    label: '逐镜生成视频',
    kind: 'generate',
    readyWhen: 'M4',
  },
  {
    id: 'assemble_episode',
    label: '放到时间线并导出',
    kind: 'export',
    readyWhen: 'M5',
  },
] as const;

export type EpisodeStepStatus = {
  id: string;
  label: string;
  kind: string;
  readyWhen: string;
  state: 'complete' | 'blocked' | 'needs_login' | 'needs_credits' | 'unavailable';
  detail: string;
};

export type EpisodeRunResult = {
  runId: string;
  status: 'paused';
  draft: DramaDraft;
  steps: EpisodeStepStatus[];
  message: string;
};

function describeTextStep(draft: DramaDraft, id: string): Pick<EpisodeStepStatus, 'state' | 'detail'> {
  if (id === 'rewrite_script') {
    if (draft.script?.body.trim() || draft.script?.sourceText.trim()) {
      return {
        state: 'complete',
        detail: '已有手写稿。自动改写还没接通，你现在看到的是本机保存的内容，不是模型新写的一版。',
      };
    }
    return {
      state: 'unavailable',
      detail: '自动改写还没接通。请先手写或粘贴一句话 / 小说，并保存到本机。',
    };
  }
  if (id === 'breakdown_storyboard') {
    if (draft.storyboard?.shots.length) {
      return {
        state: 'complete',
        detail: '已有手写分镜。自动拆镜还没接通，不会覆盖你写下的镜头。',
      };
    }
    return {
      state: 'unavailable',
      detail: '自动拆镜还没接通。你可以先手写分镜并保存。',
    };
  }
  if (id === 'extract_entities') {
    return {
      state: 'unavailable',
      detail: '自动提取角色、场景和道具还没接通。这一步不会生成形象。',
    };
  }
  return {
    state: 'unavailable',
    detail: '自动写提示词还没接通。不会假装已经准备好出片。',
  };
}

export async function startEpisodePlaceholder({
  projectId,
  loggedIn,
  creditBalance,
}: {
  projectId: string;
  loggedIn: boolean;
  creditBalance: number | null;
}): Promise<
  | { ok: true; result: EpisodeRunResult }
  | { ok: false; status: 404; message: string }
> {
  const draft = await loadDramaDraft(projectId);
  if (!draft) return { ok: false, status: 404, message: '找不到项目' };

  const steps: EpisodeStepStatus[] = EPISODE_STEPS.map((step) => {
    if (step.kind === 'text') {
      const described = describeTextStep(draft, step.id);
      return { ...step, ...described };
    }
    if (!loggedIn) {
      return {
        ...step,
        state: 'needs_login',
        detail: '登录开镜账户后，才能用平台网关生成或导出成片。本机剧本还在。',
      };
    }
    if (creditBalance !== null && creditBalance <= 0) {
      return {
        ...step,
        state: 'needs_credits',
        detail: '积分不足。请到云端账户查看礼包余额或选择套餐。生成尚未真正扣费。',
      };
    }
    return {
      ...step,
      state: 'unavailable',
      detail:
        step.kind === 'export'
          ? '把镜头铺进时间线并导出成片还没接通。时间线本身已经可以手动使用。'
          : '平台生成网关还没接通真实供应商。不会假装已经出片。',
    };
  });

  const db = await getDb();
  const found = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (!found[0]) return { ok: false, status: 404, message: '找不到项目' };

  const runId = randomUUID();
  const now = new Date();
  await db.insert(dramaRuns).values({
    id: runId,
    projectId,
    status: 'paused',
    cursor: 'rewrite_script',
    errorMessage: '导演命令尚未实现。这次运行只记录交互，没有调用模型，也没有生成视频。',
    createdAt: now,
    updatedAt: now,
  });

  return {
    ok: true,
    result: {
      runId,
      status: 'paused',
      draft,
      steps,
      message:
        '「做一集」的界面已经接通，但自动导演还不能改写或出片。已保存的手写内容还在，不会被写成已完成的成片。',
    },
  };
}
