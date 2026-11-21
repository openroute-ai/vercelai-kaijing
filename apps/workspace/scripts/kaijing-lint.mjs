import { readFileSync } from 'node:fs'

const upstream = readFileSync(new URL('../UPSTREAM.md', import.meta.url), 'utf8')
const config = readFileSync(new URL('../src/config/index.ts', import.meta.url), 'utf8')

if (!upstream.includes('174e652451a3533c20462acb7380008428670ff6')) {
  console.error('UPSTREAM.md 缺少已记录的上游提交')
  process.exit(1)
}
if (!config.includes("app_name: '开镜'")) {
  console.error('工作台产品名必须是开镜')
  process.exit(1)
}
console.log('workspace lint ok')
