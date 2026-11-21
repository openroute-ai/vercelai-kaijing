const CONSOLE_TO_SETTINGS: Record<string, string> = {
  '/console/platform-config': '/settings/platform-config',
  '/console/audit-logs': '/settings/audit-logs',
  '/console/announcements': '/settings/announcements',
  '/console/roles': '/settings/roles',
}

/**
 * 旧平台路径收口到当前控制台。
 * /crossborder/* 一律回到总览，避免落到已删除的店铺页面。
 */
export function mapLegacyPlatformPath(pathname: string): string | null {
  if (pathname === '/crossborder' || pathname.startsWith('/crossborder/')) {
    return '/console'
  }
  return CONSOLE_TO_SETTINGS[pathname] ?? null
}
