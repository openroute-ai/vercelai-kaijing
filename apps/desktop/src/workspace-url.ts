/** 开发态工作台地址。Electron 主进程读取同名环境变量，缺省与这里一致。 */
export const DEFAULT_WORKSPACE_URL = "http://127.0.0.1:5173"

export function resolveWorkspaceUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.KAIJING_WORKSPACE_URL?.trim()
  return configured || DEFAULT_WORKSPACE_URL
}
