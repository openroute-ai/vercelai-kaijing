import { createFileRoute } from '@tanstack/react-router';

import { OpenRouteKeyForm } from '@/components/kaijing/openroute-key-form';
import { BeatApiProductShell } from '@/components/marketing/beatapi-product-shell';
import { getLocale } from '@/core/workspace-lib/shims/next-intl-server';

export const Route = createFileRoute('/settings')({
  loader: () => ({ locale: getLocale() }),
  component: SettingsPage,
});

function SettingsPage() {
  const { locale } = Route.useLoaderData();

  return (
    <BeatApiProductShell active="settings" locale={locale}>
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col gap-8 px-6 pb-16 pt-16">
        <div>
          <h1 className="text-3xl font-semibold">设置</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            开镜默认使用平台网关生成，普通使用不必填写密钥。下面这些是高级选项和占位能力。
          </p>
        </div>

        <section className="rounded-[20px] border border-white/10 p-5">
          <h2 className="text-lg font-semibold">默认生成方式</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            登录开镜账户后，「做一集」会经开镜薄云调用 https://api.openroute.cn/v1，并使用开镜积分（预扣、成功实扣、失败回退）。没有平台密钥时会清晰失败，不会伪造出片。
          </p>
        </section>

        <section id="own-key" className="rounded-[20px] border border-white/10 p-5">
          <h2 className="text-lg font-semibold">用我自己的密钥（高级）</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            普通用户不必填写。若要使用自己的额度，请填写 OpenRoute 的 sk- 密钥，不要填写各家官网的原生密钥。
          </p>
          <div className="mt-4">
            <OpenRouteKeyForm />
          </div>
        </section>

        <section className="rounded-[20px] border border-white/10 p-5">
          <h2 className="text-lg font-semibold">云端备份（占位）</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            项目默认保存在这台电脑上。云端自动备份还没开通。请先在项目页导出项目包，作为备份或交给别人继续改。
          </p>
        </section>

        <section className="rounded-[20px] border border-white/10 p-5 text-sm leading-6 text-white/65">
          <h2 className="text-lg font-semibold text-white">关于开镜</h2>
          <p className="mt-2">
            开镜（Kaijing）是面向短剧创作的工作台，官网 vercelai.cn。同一套界面可以在浏览器和桌面客户端里打开。
          </p>
          <p className="mt-2">
            本机画布、创作台与时间线基于开源项目 BeatDesign（Apache-2.0），产品名和商标是开镜。源码归属见仓库 NOTICE
            与 LICENSE。
          </p>
        </section>
      </main>
    </BeatApiProductShell>
  );
}
