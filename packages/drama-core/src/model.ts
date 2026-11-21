/**
 * 短剧领域对象。M0 只有类型，没有持久化或生成实现。
 * 画布边和生成谱系以后分开记，不要混进这些结构。
 */

export type DramaProject = {
  id: string
  title: string
  synopsis: string
}

export type ScriptDraft = {
  id: string
  projectId: string
  title: string
  sourceText: string
  body: string
  revision: number
}

export type Character = {
  id: string
  projectId: string
  name: string
  description: string
  assetId?: string
}

export type Scene = {
  id: string
  projectId: string
  name: string
  description: string
  assetId?: string
}

export type Prop = {
  id: string
  projectId: string
  name: string
  description: string
  assetId?: string
}

export type Storyboard = {
  id: string
  projectId: string
  scriptId: string
  title: string
}

export type ShotStatus = "draft" | "prompted" | "generating" | "ready" | "failed"

export type Shot = {
  id: string
  storyboardId: string
  index: number
  description: string
  prompt?: string
  status: ShotStatus
  videoAssetId?: string
}

/** 内置导演、界面和以后的 MCP 共用的命令名。M0 不执行它们。 */
export type DramaCommandName =
  | "drama.rewrite_script"
  | "drama.extract_entities"
  | "drama.breakdown_storyboard"
  | "drama.write_prompts"
  | "drama.generate_character_image"
  | "drama.generate_shot_video"
  | "drama.assemble_episode"

export type DramaCommand = {
  name: DramaCommandName
  input: Record<string, unknown>
}
