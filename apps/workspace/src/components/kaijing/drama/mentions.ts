export type MentionKind = 'character' | 'scene' | 'prop';

export type Mentionable = {
  id: string
  name: string
  kind: MentionKind
  assetId?: string | null
};

/** 在提示词里用 @名称 绑定资产，名称按最长优先匹配。 */
export function mentionToken(entity: Pick<Mentionable, 'name'>) {
  return `@${entity.name.trim()}`;
}

export function parseMentions(text: string, catalog: Mentionable[]): Mentionable[] {
  if (!text) return [];
  const sorted = [...catalog]
    .filter((item) => item.name.trim())
    .sort((left, right) => right.name.trim().length - left.name.trim().length);
  const hits: Mentionable[] = [];
  const seen = new Set<string>();
  const pattern = /@([^\s@，。！？、,!?;:：""''（）()\[\]{}]+)/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[1] ?? '';
    const found = sorted.find(
      (item) => raw === item.name.trim() || raw.startsWith(item.name.trim())
    );
    if (!found || seen.has(found.id)) continue;
    seen.add(found.id);
    hits.push(found);
  }
  return hits;
}

export function insertMention(
  text: string,
  cursor: number,
  entity: Mentionable
): { text: string; cursor: number } {
  const token = mentionToken(entity);
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  const start = at >= 0 && !before.slice(at + 1).includes(' ') ? at : cursor;
  const next = `${text.slice(0, start)}${token} ${text.slice(cursor)}`;
  return { text: next, cursor: start + token.length + 1 };
}

export function mentionReferenceIds(mentions: Mentionable[]): string[] {
  return mentions.map((item) => item.assetId).filter((id): id is string => Boolean(id));
}

export function catalogFromDraft(draft: {
  characters?: Array<{ id: string; name: string; assetId?: string | null }>
  scenes?: Array<{ id: string; name: string; assetId?: string | null }>
  props?: Array<{ id: string; name: string; assetId?: string | null }>
}): Mentionable[] {
  return [
    ...(draft.characters ?? []).map((item) => ({ ...item, kind: 'character' as const })),
    ...(draft.scenes ?? []).map((item) => ({ ...item, kind: 'scene' as const })),
    ...(draft.props ?? []).map((item) => ({ ...item, kind: 'prop' as const })),
  ];
}
