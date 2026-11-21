import { createStubCommandKernel, type DramaProject } from "@workspace/drama-core"
import { Button } from "@workspace/ui/components/button"
import { Clapperboard } from "lucide-react"

const projects: DramaProject[] = []
const kernel = createStubCommandKernel()

export function App() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
              <Clapperboard className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">开镜</p>
              <p className="text-muted-foreground text-xs">Kaijing · 本机工作台</p>
            </div>
          </div>
          <Button disabled type="button">
            新建项目
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
        <section className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">欢迎来到开镜</h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-6">
            一期是 Windows / macOS 桌面客户端加上薄云（登录、积分、统一生成网关）。这里是本机工作台的空壳：项目列表还是空的，剧本、画布、导演和出片会在后续里程碑接上。
          </p>
        </section>

        <section className="bg-card rounded-xl border p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium">项目</h2>
            <span className="text-muted-foreground text-xs">{projects.length} 个</span>
          </div>
          {projects.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
              还没有短剧项目。M0 不创建本机工程，也不调用模型。
            </div>
          ) : null}
        </section>

        <section className="text-muted-foreground space-y-2 text-sm">
          <p>命令内核状态：占位实现，调用会返回未实现。</p>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              void kernel.dispatch({
                name: "drama.rewrite_script",
                input: {},
              })
            }}
          >
            试一下占位命令
          </Button>
        </section>
      </main>
    </div>
  )
}
