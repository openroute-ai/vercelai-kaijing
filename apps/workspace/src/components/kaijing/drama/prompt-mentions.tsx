import { useMemo, useState } from 'react';

import { Textarea } from '@/components/ui/textarea';

import {
  catalogFromDraft,
  insertMention,
  parseMentions,
  type Mentionable,
} from './mentions';

export function PromptMentionField({
  value,
  onChange,
  catalog,
  placeholder,
  className,
  label,
}: {
  value: string
  onChange: (next: string, mentionIds: string[]) => void
  catalog: Mentionable[]
  placeholder?: string
  className?: string
  label: string
}) {
  const [cursor, setCursor] = useState(value.length);
  const mentions = useMemo(() => parseMentions(value, catalog), [catalog, value]);
  const before = value.slice(0, cursor);
  const at = before.lastIndexOf('@');
  const query = at >= 0 && !before.slice(at + 1).includes(' ') ? before.slice(at + 1) : null;
  const suggestions =
    query == null
      ? []
      : catalog.filter((item) => item.name && item.name.includes(query)).slice(0, 8);

  function commit(next: string, nextCursor = next.length) {
    onChange(next, parseMentions(next, catalog).map((item) => item.id));
    setCursor(nextCursor);
  }

  return (
    <label className="relative flex flex-col gap-1 text-sm">
      {label}
      <Textarea
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          const target = event.target;
          commit(target.value, target.selectionStart ?? target.value.length);
        }}
        onSelect={(event) => {
          const target = event.target as HTMLTextAreaElement;
          setCursor(target.selectionStart ?? target.value.length);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && suggestions.length) {
            event.preventDefault();
            setCursor(value.length);
          }
        }}
      />
      {suggestions.length ? (
        <ul className="absolute top-full z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-white/15 bg-zinc-950 p-1 shadow-lg">
          {suggestions.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/10"
                onMouseDown={(event) => {
                  event.preventDefault();
                  const inserted = insertMention(value, cursor, item);
                  commit(inserted.text, inserted.cursor);
                }}
              >
                <span>
                  {item.kind === 'character' ? '角色' : item.kind === 'scene' ? '场景' : '道具'} · {item.name}
                </span>
                <span className="text-white/40">{item.assetId ? '有形象' : '无形象'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {mentions.length === 0 ? (
          <span className="text-[11px] text-white/40">输入 @ 可绑定角色、场景或道具。</span>
        ) : (
          mentions.map((item) => (
            <span key={item.id} className="rounded-full bg-orange-400/15 px-2 py-0.5 text-[11px] text-orange-100">
              @{item.name}
              {item.assetId ? '' : '（无形象）'}
            </span>
          ))
        )}
      </div>
    </label>
  );
}

export function mentionCatalogFromLists(lists: {
  characters?: Array<{ id?: string; name: string; assetId?: string | null }>
  scenes?: Array<{ id?: string; name: string; assetId?: string | null }>
  props?: Array<{ id?: string; name: string; assetId?: string | null }>
}): Mentionable[] {
  return catalogFromDraft({
    characters: (lists.characters ?? []).filter((item): item is { id: string; name: string; assetId?: string | null } => Boolean(item.id)),
    scenes: (lists.scenes ?? []).filter((item): item is { id: string; name: string; assetId?: string | null } => Boolean(item.id)),
    props: (lists.props ?? []).filter((item): item is { id: string; name: string; assetId?: string | null } => Boolean(item.id)),
  });
}
