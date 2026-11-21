import type { DramaCommand, DramaCommandName } from "./model"

export type DramaCommandResult = {
  ok: boolean
  command: DramaCommandName
  output?: unknown
  error?: string
}

/** UI、内置导演和 MCP 以后都走这一层。M0 只拒绝执行。 */
export interface CommandKernel {
  dispatch(command: DramaCommand): Promise<DramaCommandResult>
}

export function createStubCommandKernel(): CommandKernel {
  return {
    async dispatch(command) {
      return {
        ok: false,
        command: command.name,
        error: "命令内核尚未实现。M0 只提供类型与占位。",
      }
    },
  }
}
