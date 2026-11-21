'use client'

import { useSession } from '@/lib/auth-client'
import { websiteConfig } from '@/lib/config/website'
import { LocaleLink, useLocalePathname, useLocaleRouter } from '@/lib/i18n/navigation'
import { LOCALES } from '@/lib/i18n/routing'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@workspace/ui/components/avatar'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Label } from '@workspace/ui/components/label'
import { Separator } from '@workspace/ui/components/separator'
import { Switch } from '@workspace/ui/components/switch'
import { cn } from '@workspace/ui/lib/utils'
import {
  Bell,
  Check,
  CircleUserRound,
  Info,
  KeyRound,
  Languages,
  Mail,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserRound,
} from 'lucide-react'
import { type Locale, useLocale } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition, type ComponentType } from 'react'
import { useTheme } from 'next-themes'

type SectionId =
  | 'account'
  | 'appearance'
  | 'language'
  | 'notifications'
  | 'platform'
  | 'about'

type SectionConfig = {
  id: SectionId
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'account',
    label: '账户信息',
    description: '平台管理员账号与安全设置',
    icon: CircleUserRound,
  },
  {
    id: 'appearance',
    label: '外观设置',
    description: '主题与界面显示偏好',
    icon: Palette,
  },
  {
    id: 'language',
    label: '语言设置',
    description: '控制后台显示语言',
    icon: Languages,
  },
  {
    id: 'notifications',
    label: '通知设置',
    description: '站内信与提醒偏好',
    icon: Bell,
  },
  {
    id: 'platform',
    label: '平台偏好',
    description: '运营台默认行为',
    icon: SlidersHorizontal,
  },
  {
    id: 'about',
    label: '关于平台',
    description: '版本与环境信息',
    icon: Info,
  },
]

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || 'A'
  return source.slice(0, 2).toUpperCase()
}

export function SettingsPageClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const sectionParam = searchParams.get('section')
  const activeSection = SECTIONS.some((section) => section.id === sectionParam)
    ? (sectionParam as SectionId)
    : 'account'
  const active = SECTIONS.find((section) => section.id === activeSection)

  const handleSectionChange = (sectionId: SectionId) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('section', sectionId)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:gap-8">
      <aside className="shrink-0 lg:w-60">
        <div className="mb-4 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">设置</h1>
          <p className="text-muted-foreground text-sm">
            管理平台管理员账户与运营偏好
          </p>
        </div>

        <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const isActive = section.id === activeSection
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSectionChange(section.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="whitespace-nowrap">{section.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{active?.label}</h2>
          <p className="text-muted-foreground text-sm">{active?.description}</p>
        </div>

        {activeSection === 'account' ? <AccountSection /> : null}
        {activeSection === 'appearance' ? <AppearanceSection /> : null}
        {activeSection === 'language' ? <LanguageSection /> : null}
        {activeSection === 'notifications' ? <NotificationsSection /> : null}
        {activeSection === 'platform' ? <PlatformSection /> : null}
        {activeSection === 'about' ? <AboutSection /> : null}
      </div>
    </div>
  )
}

function AccountSection() {
  const { data: session, isPending } = useSession()
  const user = session?.user

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">管理员资料</CardTitle>
          <CardDescription>
            平台管理员身份独立于租户账号，由平台统一维护。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              {user?.image ? (
                <AvatarImage src={user.image} alt={user.name ?? ''} />
              ) : null}
              <AvatarFallback className="text-base">
                {getInitials(user?.name, user?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">
                  {isPending ? '加载中…' : (user?.name ?? '平台管理员')}
                </p>
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck className="size-3" />
                  平台管理员
                </Badge>
              </div>
              <p className="text-muted-foreground flex items-center gap-1 text-sm">
                <Mail className="size-3.5" />
                {user?.email ?? '—'}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">用户 ID</p>
              <p className="mt-0.5 truncate font-mono text-sm">{user?.id ?? '—'}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">认证来源</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm">
                <UserRound className="size-3.5" />
                web_auth 平台账号
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <LocaleLink href="/change-password">
                <KeyRound className="mr-2 size-4" />
                修改密码
              </LocaleLink>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">登录安全</CardTitle>
          <CardDescription>密码、登录设备与二次验证。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground rounded-md border border-dashed px-4 py-6 text-sm">
            二次验证与登录设备管理即将上线。
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const options = [
    { value: 'light', label: '浅色模式', description: '始终使用浅色界面', icon: Sun },
    { value: 'dark', label: '深色模式', description: '始终使用深色界面', icon: Moon },
    { value: 'system', label: '跟随系统', description: '与操作系统外观保持一致', icon: Monitor },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">主题</CardTitle>
        <CardDescription>选择运营后台的外观模式。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon
          const isActive = theme === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                'relative rounded-lg border p-4 text-left transition-colors',
                isActive
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              )}
            >
              <Icon className="mb-2 size-5" />
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {option.description}
              </p>
              {isActive ? (
                <Check className="text-primary absolute top-3 right-3 size-4" />
              ) : null}
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}

function LanguageSection() {
  const locale = useLocale()
  const localeRouter = useLocaleRouter()
  const localePathname = useLocalePathname()
  const [, startTransition] = useTransition()

  const handleChange = (nextLocale: Locale) => {
    startTransition(() => {
      localeRouter.replace(localePathname, { locale: nextLocale })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">显示语言</CardTitle>
        <CardDescription>切换后整个运营后台将使用对应语言。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {LOCALES.map((localeOption) => {
          const data =
            websiteConfig.i18n.locales[
              localeOption as keyof typeof websiteConfig.i18n.locales
            ]
          const isActive = localeOption === locale
          return (
            <button
              key={localeOption}
              type="button"
              onClick={() => handleChange(localeOption as Locale)}
              className={cn(
                'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors',
                isActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              )}
            >
              <span className="flex items-center gap-2">
                <span>{data?.flag}</span>
                <span>{data?.name ?? localeOption}</span>
              </span>
              {isActive ? <Check className="text-primary size-4" /> : null}
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}

function NotificationsSection() {
  const [preferences, setPreferences] = useState({
    onboarding: true,
    syncHealth: true,
    weeklyReport: true,
    productNews: false,
  })

  const items = [
    {
      key: 'onboarding' as const,
      title: '账户提醒',
      description: '登录与邀请相关的站内信。',
    },
    {
      key: 'syncHealth' as const,
      title: '生成任务提醒',
      description: '生成任务失败或完成时发送站内信。',
    },
    {
      key: 'weeklyReport' as const,
      title: '用量周报',
      description: '每周发送积分与生成用量摘要。',
    },
    {
      key: 'productNews' as const,
      title: '产品更新',
      description: '平台新功能与版本发布通知。',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">站内信偏好</CardTitle>
        <CardDescription>选择需要接收的运营提醒类型。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-start justify-between gap-4 rounded-md border px-4 py-3"
          >
            <div className="space-y-0.5">
              <Label htmlFor={`notification-${item.key}`} className="text-sm">
                {item.title}
              </Label>
              <p className="text-muted-foreground text-xs">{item.description}</p>
            </div>
            <Switch
              id={`notification-${item.key}`}
              checked={preferences[item.key]}
              onCheckedChange={(checked) =>
                setPreferences((current) => ({
                  ...current,
                  [item.key]: checked,
                }))
              }
            />
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          当前为演示偏好，接入服务端后将持久化到平台管理员配置。
        </p>
      </CardContent>
    </Card>
  )
}

function PlatformSection() {
  const [compactTables, setCompactTables] = useState(false)
  const [showHealthHint, setShowHealthHint] = useState(true)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">运营台偏好</CardTitle>
        <CardDescription>控制列表与状态提示的默认表现。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-md border px-4 py-3">
          <div className="space-y-0.5">
            <Label htmlFor="compact-tables" className="text-sm">
              紧凑表格
            </Label>
            <p className="text-muted-foreground text-xs">
              列表行高更小，便于同时查看更多数据。
            </p>
          </div>
          <Switch
            id="compact-tables"
            checked={compactTables}
            onCheckedChange={setCompactTables}
          />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-md border px-4 py-3">
          <div className="space-y-0.5">
            <Label htmlFor="health-hint" className="text-sm">
              同步健康提示
            </Label>
            <p className="text-muted-foreground text-xs">
              在页面顶部展示同步异常与待处理事项提醒。
            </p>
          </div>
          <Switch
            id="health-hint"
            checked={showHealthHint}
            onCheckedChange={setShowHealthHint}
          />
        </div>
        <div className="text-muted-foreground rounded-md border border-dashed px-4 py-6 text-sm">
          更多平台级配置即将上线，包括默认落地页、时区与数据刷新频率。
        </div>
      </CardContent>
    </Card>
  )
}

function AboutSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{websiteConfig.metadata.title}</CardTitle>
        <CardDescription>{websiteConfig.metadata.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-muted-foreground">产品</span>
          <span>{websiteConfig.metadata.title}</span>
        </div>
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-muted-foreground">业务域</span>
          <span>桌面客户端 + 薄云 · vercelai.cn</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">当前环境</span>
          <Badge variant="outline">{process.env.NODE_ENV}</Badge>
        </div>
      </CardContent>
    </Card>
  )
}
