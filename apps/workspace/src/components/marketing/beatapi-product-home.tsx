import { ArrowRight, Clapperboard, PanelsTopLeft, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';

import { BeatApiProductShell } from './beatapi-product-shell';
import { Link } from '@/core/i18n/navigation';
import {
  getEntryPath,
  rememberEntryPath,
  type KaijingEntryPath,
} from '@/lib/kaijing-preferences';

export function BeatApiProductHome({ locale }: { locale: string }) {
  const [path, setPath] = useState<KaijingEntryPath | null>(null);
  useEffect(() => setPath(getEntryPath()), []);

  function switchPath(next: KaijingEntryPath) {
    rememberEntryPath(next);
    setPath(next);
  }

  return (
    <BeatApiProductShell active="home" locale={locale}>
      <main className="mx-auto w-full max-w-[1280px] px-5 pb-16 sm:px-6">
        <section className="beat-product-hero pb-10 pt-[64px] text-center sm:pt-[84px]">
          <p className="beat-product-display inline-flex items-center gap-2.5 text-[10px] font-semibold tracking-[0.18em] text-[var(--beat-accent)] sm:text-[11px]">
            <span className="size-1.5 rounded-full bg-[var(--beat-accent)]" />
            开镜 Kaijing · vercelai.cn
          </p>
          <h1 className="beat-product-display beat-product-hero-title mx-auto mt-6 w-full max-w-[760px] text-[clamp(2.25rem,6.6vw,4.5rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-[#f7f7f8]">
            {path === 'media' ? (
              <>
                <span className="block">先出一张图，</span>
                <span className="block">或一段视频。</span>
              </>
            ) : (
              <>
                <span className="block">用一句话，</span>
                <span className="block">做完一集短剧。</span>
              </>
            )}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-white/65">
            项目默认保存在这台电脑上，可以导出项目包拷给别人继续改。生成走平台网关，不用先填密钥。
          </p>
        </section>

        {path !== 'media' ? (
          <section className="mx-auto max-w-[720px] rounded-[28px] border border-[var(--beat-accent)]/30 bg-[var(--beat-accent)]/8 p-6 text-left sm:p-8">
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--beat-accent)]">
              短剧主路径
            </p>
            <h2 className="mt-3 text-2xl font-semibold">用一句话做一集</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">
              写下想法或粘贴小说，保存剧本和分镜，再按步骤做一集。自动导演还在接通中，不会假装已经出片。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/drama"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--beat-accent)] px-5 text-sm font-semibold text-[var(--beat-accent-ink)]"
              >
                <Clapperboard className="size-4" />
                用一句话做一集
              </Link>
              <Link
                href="/projects"
                className="inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-sm text-white/80"
              >
                打开已有项目
              </Link>
            </div>
          </section>
        ) : (
          <section className="mx-auto grid max-w-[720px] gap-4 md:grid-cols-2">
            <Link
              href="/studio"
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/25"
            >
              <PanelsTopLeft className="size-5 text-[var(--beat-accent)]" />
              <h2 className="mt-4 text-xl font-semibold">进入创作台</h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                单独生成一张图或一段视频。默认使用平台网关；自有密钥在高级设置里。
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm text-white/70">
                打开创作台 <ArrowRight className="size-3.5" />
              </span>
            </Link>
            <Link
              href="/canvas"
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/25"
            >
              <Workflow className="size-5 text-[var(--beat-accent)]" />
              <h2 className="mt-4 text-xl font-semibold">进入画布</h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                把素材摆在无限画布上，连线对照。适合打磨，而不是做完整一集。
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm text-white/70">
                打开画布 <ArrowRight className="size-3.5" />
              </span>
            </Link>
          </section>
        )}

        <p className="mt-8 text-center text-sm text-white/45">
          {path === 'media' ? (
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => switchPath('drama')}>
              还是想做短剧？回到「用一句话做一集」
            </button>
          ) : (
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => switchPath('media')}>
              我只想生成一张图 / 一段视频
            </button>
          )}
        </p>

        <p className="mt-6 text-center text-xs text-white/40">
          登录后才能生成。写剧本和查看项目不强制登录。
        </p>
      </main>
    </BeatApiProductShell>
  );
}
