export default function PlatformConfigPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">薄云说明</h1>
        <p className="text-muted-foreground text-sm">
          平台侧目前只承接登录、积分账户和生成任务状态。供应商密钥、计费规则和自动更新还没有接上。
        </p>
      </div>
      <div className="space-y-3 rounded-lg border p-4 text-sm leading-6">
        <p>工作台 UI 在本机 Vite 应用里，不跑在这个 Next.js 控制面。</p>
        <p>生成请求以后由桌面客户端打到 API 的 `/api/v1/generations`，由统一网关代调供应商。</p>
        <p>域名规划：vercelai.cn。仓库：openroute-ai/vercelai-kaijing。</p>
      </div>
    </div>
  )
}
