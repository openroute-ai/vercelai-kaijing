import { useEffect, useState } from 'react';

import { Link } from '@/core/i18n/navigation';
import {
  fetchCloudSession,
  formatCredits,
  type KaijingSession,
} from '@/lib/kaijing-session';

export function KaijingAccountChip() {
  const [session, setSession] = useState<KaijingSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchCloudSession().then((result) => {
      if (!cancelled) {
        setSession(result.session);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = !ready
    ? '正在确认登录'
    : session
      ? `${session.user.name || session.user.email} · ${formatCredits(session.balance)} 积分`
      : '未登录';

  return (
    <Link
      href="/cloud-account"
      className="hidden max-w-[220px] truncate rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 hover:border-white/25 hover:text-white md:inline-block"
    >
      {label}
    </Link>
  );
}
