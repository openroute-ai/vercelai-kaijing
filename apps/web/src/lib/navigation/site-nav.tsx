import type { ReactNode } from 'react'
import React from 'react'
import {
  Clapperboard,
  LayoutDashboard,
  MailPlus,
  Megaphone,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'

export type SiteNavItem = {
  title: string
  url: string
  icon: ReactNode
  exact?: boolean
  soon?: boolean
}

export type SiteNavGroup = {
  title: string
  items: SiteNavItem[]
}

export const OVERVIEW_NAV: SiteNavItem[] = [
  {
    title: '薄云总览',
    url: '/console',
    icon: <LayoutDashboard className="size-4" />,
    exact: true,
  },
]

export const SITE_NAV_GROUPS: SiteNavGroup[] = [
  {
    title: '账户',
    items: [
      {
        title: '用户',
        url: '/console/users',
        icon: <Users className="size-4" />,
      },
      {
        title: '邀请',
        url: '/console/invitations',
        icon: <MailPlus className="size-4" />,
      },
    ],
  },
  {
    title: '薄云',
    items: [
      {
        title: '积分',
        url: '/console/credits',
        icon: <Wallet className="size-4" />,
      },
      {
        title: '生成任务',
        url: '/console/generation-jobs',
        icon: <Clapperboard className="size-4" />,
      },
    ],
  },
]

export const SECONDARY_NAV: SiteNavItem[] = [
  {
    title: '设置',
    url: '/settings',
    icon: <Settings className="size-4" />,
  },
]

export const SETTINGS_ACCOUNT_NAV: SiteNavItem[] = [
  {
    title: '账号设置',
    url: '/settings',
    icon: <UserRound className="size-4" />,
    exact: true,
  },
]

export const SETTINGS_NAV_GROUPS: SiteNavGroup[] = [
  {
    title: '账号',
    items: SETTINGS_ACCOUNT_NAV,
  },
  {
    title: '平台管理',
    items: [
      {
        title: '薄云说明',
        url: '/settings/platform-config',
        icon: <Settings className="size-4" />,
      },
      {
        title: '操作日志',
        url: '/settings/audit-logs',
        icon: <ScrollText className="size-4" />,
        soon: true,
      },
      {
        title: '系统公告',
        url: '/settings/announcements',
        icon: <Megaphone className="size-4" />,
        soon: true,
      },
      {
        title: '角色权限',
        url: '/settings/roles',
        icon: <ShieldCheck className="size-4" />,
        soon: true,
      },
    ],
  },
]

export const ALL_SITE_NAV_ITEMS: SiteNavItem[] = [
  ...OVERVIEW_NAV,
  ...SITE_NAV_GROUPS.flatMap((group) => group.items),
  ...SECONDARY_NAV,
  ...SETTINGS_NAV_GROUPS.flatMap((group) => group.items),
]

export function findBestMatchingNavItem(
  pathname: string
): SiteNavItem | undefined {
  return ALL_SITE_NAV_ITEMS.filter(
    (item) => pathname === item.url || pathname.startsWith(`${item.url}/`)
  ).sort((a, b) => b.url.length - a.url.length)[0]
}

export function isNavItemActive(pathname: string, item: SiteNavItem) {
  if (!pathname) return false
  if (item.exact) return pathname === item.url
  return pathname === item.url || pathname.startsWith(`${item.url}/`)
}
