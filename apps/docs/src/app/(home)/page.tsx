import Link from "next/link"

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col justify-center text-center">
      <h1 className="mb-4 text-2xl font-bold">开镜</h1>
      <p className="text-muted-foreground mb-4">
        开源 AI 短剧 / 漫剧制作工具。一期是桌面客户端加薄云。
      </p>
      <p>
        <Link href="/docs" className="font-medium underline">
          阅读文档
        </Link>
      </p>
    </div>
  )
}
