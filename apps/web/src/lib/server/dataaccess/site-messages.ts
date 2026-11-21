import { webAuthDb } from '@/lib/db'
import type {
  SiteMessageDetail,
  SiteMessageListResult,
  SiteMessageReadFilter,
} from '@/lib/types/site-messages'
import {
  webUserSiteMessage,
  type NewWebUserSiteMessage,
  type WebSiteMessageLinkRecord,
  type WebUserSiteMessage,
} from '@workspace/db'
import { and, count, desc, eq } from 'drizzle-orm'

const DEFAULT_PAGE_SIZE = 10

type SiteMessageListRow = Pick<
  WebUserSiteMessage,
  'id' | 'title' | 'summary' | 'category' | 'read' | 'createdAt'
>

type SiteMessageDetailRow = SiteMessageListRow & {
  content: string
  links: WebSiteMessageLinkRecord[] | null
  readAt: Date | null
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null
  return value.toISOString()
}

function mapListItem(row: SiteMessageListRow) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  }
}

function mapDetail(row: SiteMessageDetailRow): SiteMessageDetail {
  return {
    ...mapListItem(row),
    content: row.content,
    links: row.links ?? [],
    readAt: toIso(row.readAt),
  }
}

const demoMessages: Omit<NewWebUserSiteMessage, 'id' | 'userId'>[] = [
  {
    title: '欢迎使用开镜控制台',
    summary: '薄云目前只管理账户、积分和生成任务元数据。',
    content: `开镜一期的云端不托管完整短剧项目。

- 登录与邀请在这个控制台
- 积分账户和流水见「积分」
- 生成任务状态见「生成任务」

工作台本身在桌面客户端里打开。`,
    category: '系统',
    links: [{ label: '打开总览', href: '/console' }],
    read: false,
    createdAt: new Date('2026-11-10T03:20:00.000Z'),
  },
  {
    title: '生成网关还是占位',
    summary: '提交到 /api/v1/generations 的任务会记成 queued，不会调用供应商。',
    content: `M0 的供应商适配器只保留接口。

桌面端以后把生图、生视频请求交给这个网关，由平台代持密钥并扣积分。`,
    category: '生成',
    links: [{ label: '查看生成任务', href: '/console/generation-jobs' }],
    read: false,
    createdAt: new Date('2026-11-09T14:05:00.000Z'),
  },
  {
    title: '用量摘要还是空的',
    summary: '积分和生成任务都还没有真实数据。',
    content: `控制台里的积分账户和生成任务列表可以为空。

这不是故障。充值、预扣和供应商回调会在后续里程碑接上。`,
    category: '系统',
    links: [{ label: '打开总览', href: '/console' }],
    read: true,
    readAt: new Date('2026-11-08T09:30:00.000Z'),
    createdAt: new Date('2026-11-08T09:00:00.000Z'),
  },
]

async function ensureDemoMessages(userId: string) {
  if (process.env.NODE_ENV === 'production') return

  const existing = await webAuthDb
    .select({
      id: webUserSiteMessage.id,
      title: webUserSiteMessage.title,
      content: webUserSiteMessage.content,
    })
    .from(webUserSiteMessage)
    .where(eq(webUserSiteMessage.userId, userId))

  if (existing.length === 0) {
    await webAuthDb.insert(webUserSiteMessage).values(
      demoMessages.map((message) => ({
        ...message,
        userId,
      })),
    )
    return
  }

  for (const demo of demoMessages) {
    const row = existing.find((item) => item.title === demo.title)
    if (row && row.content !== demo.content) {
      await webAuthDb
        .update(webUserSiteMessage)
        .set({ content: demo.content })
        .where(eq(webUserSiteMessage.id, row.id))
    }
  }
}

function buildReadFilter(userId: string, readFilter: SiteMessageReadFilter) {
  const conditions = [eq(webUserSiteMessage.userId, userId)]

  if (readFilter === 'unread') {
    conditions.push(eq(webUserSiteMessage.read, false))
  } else if (readFilter === 'read') {
    conditions.push(eq(webUserSiteMessage.read, true))
  }

  return and(...conditions)
}

export const siteMessagesDataAccess = {
  async list(input: {
    userId: string
    page: number
    pageSize: number
    readFilter: SiteMessageReadFilter
  }): Promise<SiteMessageListResult> {
    await ensureDemoMessages(input.userId)

    const page = Math.max(1, input.page)
    const pageSize = Math.min(50, Math.max(1, input.pageSize))
    const offset = (page - 1) * pageSize
    const whereClause = buildReadFilter(input.userId, input.readFilter)

    const [totalRow] = await webAuthDb
      .select({ total: count() })
      .from(webUserSiteMessage)
      .where(whereClause)

    const total = totalRow?.total ?? 0
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)

    const rows = await webAuthDb
      .select({
        id: webUserSiteMessage.id,
        title: webUserSiteMessage.title,
        summary: webUserSiteMessage.summary,
        category: webUserSiteMessage.category,
        read: webUserSiteMessage.read,
        createdAt: webUserSiteMessage.createdAt,
      })
      .from(webUserSiteMessage)
      .where(whereClause)
      .orderBy(desc(webUserSiteMessage.createdAt), desc(webUserSiteMessage.id))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map(mapListItem),
      page,
      pageSize,
      total,
      totalPages,
    }
  },

  async getUnreadCount(userId: string): Promise<number> {
    await ensureDemoMessages(userId)

    const [row] = await webAuthDb
      .select({ total: count() })
      .from(webUserSiteMessage)
      .where(
        and(
          eq(webUserSiteMessage.userId, userId),
          eq(webUserSiteMessage.read, false),
        ),
      )

    return row?.total ?? 0
  },

  async getById(userId: string, id: string): Promise<SiteMessageDetail | null> {
    const [row] = await webAuthDb
      .select({
        id: webUserSiteMessage.id,
        title: webUserSiteMessage.title,
        summary: webUserSiteMessage.summary,
        content: webUserSiteMessage.content,
        category: webUserSiteMessage.category,
        links: webUserSiteMessage.links,
        read: webUserSiteMessage.read,
        readAt: webUserSiteMessage.readAt,
        createdAt: webUserSiteMessage.createdAt,
      })
      .from(webUserSiteMessage)
      .where(
        and(eq(webUserSiteMessage.id, id), eq(webUserSiteMessage.userId, userId)),
      )
      .limit(1)

    if (!row) return null
    return mapDetail(row)
  },

  async markRead(userId: string, id: string): Promise<boolean> {
    const [updated] = await webAuthDb
      .update(webUserSiteMessage)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(
        and(eq(webUserSiteMessage.id, id), eq(webUserSiteMessage.userId, userId)),
      )
      .returning({ id: webUserSiteMessage.id })

    return Boolean(updated)
  },

  async markAllRead(userId: string): Promise<number> {
    const updated = await webAuthDb
      .update(webUserSiteMessage)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(webUserSiteMessage.userId, userId),
          eq(webUserSiteMessage.read, false),
        ),
      )
      .returning({ id: webUserSiteMessage.id })

    return updated.length
  },
}

export { DEFAULT_PAGE_SIZE as SITE_MESSAGE_DEFAULT_PAGE_SIZE }
