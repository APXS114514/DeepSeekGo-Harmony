import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot } from './support.mjs'

/**
 * 依次运行本目录下的 *.test.mjs。
 * 用法：node tests/harmony/run.mjs [名称片段...]，例如 `node tests/harmony/run.mjs personalization`。
 * 设置 SHOTS_DIR 时，支持截图的脚本把截图写到该目录。
 */
const here = fileURLToPath(new URL('.', import.meta.url))
const assets = join(repoRoot, 'harmony/entry/src/main/resources/rawfile/chat/index.html')
if (!existsSync(assets)) {
  console.error('缺少鸿蒙网页资源，请先在 chat-demo-main/ 运行 pnpm build:harmony')
  process.exit(1)
}

const filters = process.argv.slice(2)
const tests = readdirSync(here)
  .filter((name) => name.endsWith('.test.mjs'))
  .filter((name) => filters.length === 0 || filters.some((filter) => name.includes(filter)))
  .sort()
const shots = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), 'deepseek-go-shots-'))

const failed = []
for (const name of tests) {
  const started = Date.now()
  const result = spawnSync(process.execPath, [join(here, name), shots], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  if (result.status === 0) {
    console.log(`✓ ${name} (${seconds}s)`)
  } else {
    failed.push(name)
    console.log(`✗ ${name} (${seconds}s)`)
    console.log((result.stdout + result.stderr).trim().split('\n').slice(-25).join('\n'))
  }
}
console.log(`\n${tests.length - failed.length}/${tests.length} 通过`)
process.exit(failed.length > 0 ? 1 : 0)
