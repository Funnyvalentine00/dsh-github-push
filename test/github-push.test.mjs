import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { normalizeGithubUrl, deriveTopics, dshCliCommands, buildReadme } from '../lib/index.js'

const root = fileURLToPath(new URL('..', import.meta.url))

test('normalizeGithubUrl handles https URLs', () => {
  const result = normalizeGithubUrl('https://github.com/owner/repo')
  assert.equal(result.url, 'https://github.com/owner/repo.git')
  assert.equal(result.repo, 'owner/repo')
})

test('normalizeGithubUrl handles ssh URLs and .git suffix', () => {
  const result = normalizeGithubUrl('git@github.com:owner/repo.git')
  assert.equal(result.url, 'https://github.com/owner/repo.git')
  assert.equal(result.repo, 'owner/repo')
})

test('deriveTopics includes dsh plugin topics and extra topics', () => {
  const pkg = {
    name: '@dsh-external/dsh-github-push',
    keywords: ['dsh', 'github'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }
  const topics = deriveTopics(root, pkg, 'automation,ci')
  assert.ok(topics.includes('dsh'))
  assert.ok(topics.includes('dsh-plugin'))
  assert.ok(topics.includes('deepseek-harness'))
  assert.ok(topics.includes('automation'))
  assert.ok(topics.includes('ci'))
})

test('dshCliCommands contains install and uninstall commands', () => {
  const text = dshCliCommands({ name: '@dsh-external/dsh-github-push' })
  assert.match(text, /dsh plugin --profile web add @dsh-external\/dsh-github-push/)
  assert.match(text, /dsh plugin --profile web remove @dsh-external\/dsh-github-push/)
})

test('buildReadme includes DSH CLI section for plugin projects', () => {
  const pkg = { name: '@dsh-external/dsh-github-push', description: 'Test plugin' }
  const tree = ['lib/index.js', 'package.json']
  const readme = buildReadme(root, pkg, tree)
  assert.match(readme, /## DSH 安装 \/ 卸载/)
  assert.match(readme, /dsh plugin --profile web add @dsh-external\/dsh-github-push/)
  assert.match(readme, /dsh plugin --profile web remove @dsh-external\/dsh-github-push/)
})
