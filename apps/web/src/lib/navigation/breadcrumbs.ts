import { findBestMatchingNavItem } from './site-nav'

export type SiteBreadcrumbItem = {
  label: string
  href?: string
}

const CONSOLE_ROOT: SiteBreadcrumbItem = {
  label: '开镜控制台',
  href: '/console',
}

export function getSiteBreadcrumbTrail(pathname: string): SiteBreadcrumbItem[] {
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    if (pathname === '/settings') {
      return [
        { label: '设置', href: '/settings' },
        { label: '账号设置' },
      ]
    }
    const item = findBestMatchingNavItem(pathname)
    return [
      { label: '设置', href: '/settings' },
      { label: item?.title ?? '页面' },
    ]
  }

  if (!pathname.startsWith('/console')) {
    return [{ label: '开镜控制台', href: '/' }]
  }

  if (pathname === '/console') {
    return [
      { label: '开镜控制台', href: '/console' },
      { label: '薄云总览' },
    ]
  }

  const item = findBestMatchingNavItem(pathname)
  const trail: SiteBreadcrumbItem[] = [CONSOLE_ROOT, { label: item?.title ?? '页面' }]

  const rest = item
    ? pathname.slice(item.url.length).replace(/^\/+/, '')
    : pathname.slice('/console/'.length)
  if (rest) {
    trail.push({ label: '详情' })
  }

  return trail
}
