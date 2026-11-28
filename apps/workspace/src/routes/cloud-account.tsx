import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { KaijingAuthForm } from '@/components/kaijing/auth-form';
import { BeatApiProductShell } from '@/components/marketing/beatapi-product-shell';
import { getLocale } from '@/core/workspace-lib/shims/next-intl-server';
import {
  fetchCloudSession,
  formatCredits,
  requestCloud,
  type KaijingPlan,
  type KaijingSession,
} from '@/lib/kaijing-session';

export const Route = createFileRoute('/cloud-account')({
  loader: () => ({ locale: getLocale() }),
  component: CloudAccountPage,
});

function CloudAccountPage() {
  const { locale } = Route.useLoaderData();
  const [session, setSession] = useState<KaijingSession | null>(null);
  const [status, setStatus] = useState('');
  const [offline, setOffline] = useState(false);
  const [plans, setPlans] = useState<KaijingPlan[]>([]);

  async function refresh() {
    const result = await fetchCloudSession();
    setOffline(result.offline);
    setSession(result.session);
    if (result.session?.plans) setPlans(result.session.plans);
    else {
      try {
        const catalog = await requestCloud<{ plans?: KaijingPlan[] }>(
          '/cloud-api/api/v1/cloud/credits/plans'
        );
        if (catalog.plans) setPlans(catalog.plans);
      } catch {
        /* plans stay empty when offline */
      }
    }
    if (result.offline) setStatus('暂时连不上云端，本机项目还在。');
    else setStatus(result.session ? '已登录开镜账户' : '尚未登录');
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function logout() {
    await requestCloud('/cloud-api/api/v1/cloud/logout', {});
    setSession(null);
    setStatus('已退出。本机项目还在这台电脑上。');
  }

  async function checkout(planId: string) {
    setStatus('正在创建充值意向…');
    try {
      const data = await requestCloud<{ message: string; session?: KaijingSession }>(
        '/cloud-api/api/v1/cloud/credits/checkout',
        { planId }
      );
      if (data.session) setSession(data.session);
      setStatus(data.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '失败');
    }
  }

  const balance = session ? Number(session.balance) : 0;
  const insufficient = Boolean(session) && balance <= 0;

  return (
    <BeatApiProductShell active="account" locale={locale}>
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col gap-6 px-6 pb-16 pt-16">
        <h1 className="text-3xl font-semibold">云端账户</h1>
        <p className="text-sm leading-6 text-white/70">
          用这个账户登录开镜。它和平台运营后台不是同一个登录。生成默认走平台网关，不必填写各家密钥。
        </p>

        {!session ? (
          <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5">
            <KaijingAuthForm status={status} setStatus={setStatus} onSuccess={setSession} />
            <button className="mt-4 text-sm text-white/60" type="button" onClick={() => void refresh()}>
              刷新会话
            </button>
          </div>
        ) : (
          <section className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5 text-sm">
            <p className="text-base font-medium">
              {session.user.name} · {session.user.email}
            </p>
            <p className="mt-3 text-2xl font-semibold">
              积分余额 {formatCredits(session.balance)}
            </p>
            {session.welcomeGrant ? (
              <p className="mt-3 leading-6 text-white/70">{session.welcomeGrant.note}</p>
            ) : null}
            {insufficient ? (
              <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-amber-100">
                积分不足。你仍可以在本机写剧本和分镜，但生成需要先选择套餐。支付通道尚未开通，下单只会留下待支付占位。
              </p>
            ) : (
              <p className="mt-3 leading-6 text-white/60">
                余额来自新用户礼包或以后的充值。现在仍可在本机写剧本和分镜。
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-md border border-white/20 px-3 py-2"
                type="button"
                onClick={() => void logout()}
              >
                退出
              </button>
              <button className="text-white/60" type="button" onClick={() => void refresh()}>
                刷新会话
              </button>
            </div>
          </section>
        )}

        <section className="rounded-[20px] border border-white/10 p-5">
          <h2 className="text-lg font-semibold">充值与套餐</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">
            支付尚未开通。选择套餐会记下一条待支付意向，不会扣款，也不会增加积分。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(plans).map((plan) => (
              <div key={plan.id} className="rounded-xl border border-white/10 p-4">
                <p className="font-medium">{plan.name}</p>
                <p className="mt-1 text-sm text-white/70">{formatCredits(plan.credits)} 积分</p>
                <p className="mt-1 text-xs text-white/45">{plan.priceLabel}</p>
                <p className="mt-2 text-xs leading-5 text-white/55">{plan.description}</p>
                <button
                  className="mt-3 w-full rounded-md border border-white/20 px-3 py-1.5 text-sm disabled:opacity-40"
                  type="button"
                  disabled={!session}
                  onClick={() => void checkout(plan.id)}
                >
                  {session ? '选择套餐' : '登录后可下单'}
                </button>
              </div>
            ))}
            {!session ? (
              <p className="sm:col-span-3 text-sm text-white/55">
                登录后可以看到套餐，并把待支付意向记在账户里。
              </p>
            ) : null}
          </div>
        </section>
        {offline || status ? <p className="text-sm text-white/70">{status}</p> : null}
      </main>
    </BeatApiProductShell>
  );
}
