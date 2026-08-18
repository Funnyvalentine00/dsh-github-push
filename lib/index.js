/**
 * @dsh-external/dsh-github-push — one-step GitHub uploader.
 *
 * Given a GitHub repo URL, this tool:
 *   1. initializes a git repo in the target directory if needed;
 *   2. adds all files and commits them;
 *   3. configures the GitHub remote;
 *   4. pushes to GitHub.
 * If the repo does not exist and the gh CLI is installed/authenticated, it
 * creates the repo automatically.
 */
import { execSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from 'schemastery'

export const name = '@dsh-external/dsh-github-push'
export const inject = ['tools']

export const Config = z.object({
  defaultBranch: z.string().default('main'),
  defaultMessage: z.string().default('Update project'),
})

function run(cwd, command, timeout = 120000) {
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    }).trim()
    return { ok: true, stdout, stderr: '' }
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: String(error && error.stderr ? error.stderr : (error && error.message ? error.message : error)).trim(),
    }
  }
}

function normalizeGithubUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) return { url: '', repo: '' }
  let url = raw.endsWith('.git') ? raw : `${raw}.git`
  const match = raw.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (!match) return { url, repo: '' }
  const owner = match[1].replace(/^git@/, '')
  const name = match[2].replace(/\.git$/, '')
  return {
    url: `https://github.com/${owner}/${name}.git`,
    repo: `${owner}/${name}`,
  }
}

function ensureGitRepo(dir, branch) {
  const check = run(dir, 'git rev-parse --is-inside-work-tree')
  if (!check.ok) {
    const init = run(dir, `git init -b ${branch}`)
    if (!init.ok) return { ok: false, message: `git init failed: ${init.stderr}` }
    return { ok: true, message: 'initialized new git repository' }
  }
  const switchBranch = run(dir, `git checkout -B ${branch}`)
  if (!switchBranch.ok) return { ok: false, message: `git checkout -B ${branch} failed: ${switchBranch.stderr}` }
  return { ok: true, message: 'existing git repository' }
}

function commitAll(dir, message) {
  const add = run(dir, 'git add -A')
  if (!add.ok) return { ok: false, message: `git add failed: ${add.stderr}` }
  const status = run(dir, 'git status --porcelain')
  const hasHead = run(dir, 'git rev-parse --verify HEAD')
  if (status.ok && status.stdout === '' && hasHead.ok) {
    return { ok: true, message: 'nothing to commit', committed: false }
  }
  const commit = run(dir, `git commit -m ${JSON.stringify(message)}`)
  if (!commit.ok) return { ok: false, message: `git commit failed: ${commit.stderr}` }
  return { ok: true, message: commit.stdout || 'committed', committed: true }
}

function ensureRemote(dir, url) {
  const get = run(dir, 'git remote get-url origin')
  if (!get.ok) {
    const add = run(dir, `git remote add origin ${url}`)
    if (!add.ok) return { ok: false, message: `git remote add failed: ${add.stderr}` }
    return { ok: true, message: 'added remote origin' }
  }
  if (get.stdout.trim() !== url) {
    const set = run(dir, `git remote set-url origin ${url}`)
    if (!set.ok) return { ok: false, message: `git remote set-url failed: ${set.stderr}` }
    return { ok: true, message: 'updated remote origin' }
  }
  return { ok: true, message: 'remote origin already set' }
}

function findReadme(dir) {
  const candidates = ['README.md', 'readme.md', 'README.MD', 'Readme.md', 'README', 'README.rst', 'README.txt']
  return candidates.find((name) => existsSync(join(dir, name))) || null
}

function readPackageJson(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

function summarizeTree(dir) {
  const skip = new Set(['.git', 'node_modules', '.DS_Store', 'dist', '.idea', '.vscode', 'coverage'])
  const walk = (current, prefix, depth) => {
    if (depth > 2) return []
    let entries = []
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return []
    }
    const lines = []
    for (const entry of entries) {
      if (skip.has(entry.name) || entry.name.startsWith('.')) continue
      lines.push(`${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`)
      if (entry.isDirectory()) lines.push(...walk(join(current, entry.name), `${prefix}${entry.name}/`, depth + 1))
    }
    return lines
  }
  return walk(dir, '', 0).slice(0, 80)
}

function hasSection(content, patterns) {
  const lower = content.toLowerCase()
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()))
}

function installSection(pkg) {
  const hasBuild = Boolean(pkg?.scripts?.build)
  const lines = ['## 安装', '']
  if (pkg) {
    lines.push('```bash')
    lines.push('npm install')
    if (hasBuild) lines.push('npm run build')
    lines.push('```')
  } else {
    lines.push('按项目自身说明安装依赖/构建。')
  }
  return lines.join('\n')
}

function usageSection(pkg, tree) {
  const isDshPlugin = Boolean(pkg?.dsh || pkg?.name?.startsWith('@') || tree.some((line) => line.includes('lib/') || line.includes('src/')))
  const lines = ['## 使用', '']
  if (isDshPlugin) {
    lines.push('这是一个 DSH 插件/项目。使用 dsh-super-injector 注入：')
    lines.push('')
    lines.push('```json')
    lines.push('dev_inject_plugin {"dir": "<本仓库绝对路径>"}')
    lines.push('```')
    lines.push('')
    lines.push('或按项目内脚本/文档使用。')
  } else {
    lines.push('按项目内脚本或文档使用。')
  }
  return lines.join('\n')
}

function structureSection(tree) {
  const lines = ['## 项目结构', '']
  lines.push('```')
  lines.push(tree.length > 0 ? tree.join('\n') : '(empty)')
  lines.push('```')
  return lines.join('\n')
}

function licenseSection(pkg) {
  return `## License\n\n${pkg?.license || 'MIT（如适用，请按实际情况修改）'}`
}

function buildReadme(dir, pkg, tree) {
  const name = pkg?.name || basename(dir)
  const description = pkg?.description || 'A project for DeepSeek Harness / DSH.'
  const lines = [
    `# ${name}`,
    '',
    description,
    '',
    '## 项目结构',
    '',
    '```',
    tree.length > 0 ? tree.join('\n') : '(empty)',
    '```',
    '',
    installSection(pkg),
    '',
    usageSection(pkg, tree),
    '',
    licenseSection(pkg),
    '',
  ]
  return lines.join('\n')
}

function ensureReadme(dir, forceRewrite = false) {
  const readme = findReadme(dir)
  const pkg = readPackageJson(dir)
  const tree = summarizeTree(dir)
  const generated = buildReadme(dir, pkg, tree)

  if (forceRewrite || !readme) {
    const target = readme || 'README.md'
    writeFileSync(join(dir, target), generated, 'utf8')
    return { changed: true, path: target, action: readme ? `rewrote ${target}` : `created ${target}` }
  }

  const existing = readFileSync(join(dir, readme), 'utf8')
  if (existing.trim().length < 120) {
    writeFileSync(join(dir, readme), generated, 'utf8')
    return { changed: true, path: readme, action: `replaced thin ${readme}` }
  }

  const missing = []
  if (!hasSection(existing, ['## 安装', '## installation'])) missing.push('installation')
  if (!hasSection(existing, ['## 使用', '## usage'])) missing.push('usage')
  if (!hasSection(existing, ['## 项目结构', '## project structure'])) missing.push('structure')
  if (!hasSection(existing, ['## license', '## 许可证'])) missing.push('license')

  if (missing.length === 0) {
    return { changed: false, path: readme, action: `kept existing ${readme}` }
  }

  const sections = missing.map((section) => {
    switch (section) {
      case 'installation': return installSection(pkg)
      case 'usage': return usageSection(pkg, tree)
      case 'structure': return structureSection(tree)
      case 'license': return licenseSection(pkg)
      default: return ''
    }
  }).filter(Boolean)
  appendFileSync(join(dir, readme), `\n\n${sections.join('\n\n')}\n`, 'utf8')
  return { changed: true, path: readme, action: `appended missing sections to ${readme}: ${missing.join(', ')}` }
}

function deriveTopics(dir, pkg, extra) {
  const topics = new Set()
  const repoName = basename(dir).toLowerCase()
  if (pkg?.keywords && Array.isArray(pkg.keywords)) {
    for (const keyword of pkg.keywords) {
      const value = String(keyword || '').trim().toLowerCase()
      if (value) topics.add(value)
    }
  }
  const isDshPlugin = Boolean(pkg?.dsh || pkg?.name?.startsWith('@') || existsSync(join(dir, 'src/index.ts')) || existsSync(join(dir, 'lib/index.js')))
  if (isDshPlugin) {
    topics.add('dsh')
    topics.add('dsh-plugin')
    topics.add('deepseek-harness')
  }
  if (repoName) topics.add(repoName)
  if (extra) {
    for (const item of String(extra).split(',')) {
      const value = item.trim().toLowerCase()
      if (value) topics.add(value)
    }
  }
  return [...topics].filter((topic) => /^[a-z0-9][a-z0-9-]*$/.test(topic)).slice(0, 20)
}

async function applyTopics(repo, topics, dir) {
  if (!repo || topics.length === 0) return { ok: false, message: 'no topics to set' }

  // Prefer gh CLI when available.
  const gh = run(process.cwd(), 'gh --version', 10000)
  if (gh.ok) {
    const flags = topics.map((topic) => `--add-topic ${JSON.stringify(topic)}`).join(' ')
    const edit = run(dir, `gh repo edit ${repo} ${flags}`, 60000)
    if (edit.ok) return { ok: true, message: `topics set via gh: ${topics.join(', ')}` }
  }

  // Fallback: GitHub REST API with a token.
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (!token) return { ok: false, message: `no GitHub token/gh auth; topics skipped (${topics.join(', ')})` }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/topics`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ names: topics }),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return { ok: false, message: `GitHub API topics failed (${response.status}): ${text}` }
    }
    return { ok: true, message: `topics set via API: ${topics.join(', ')}` }
  } catch (error) {
    return { ok: false, message: `GitHub API topics error: ${error?.message || error}` }
  }
}

export function apply(ctx, config) {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'dev_github_push',
    description: 'One-step upload a local project to GitHub: given a repo URL, auto-create/improve README, initialize git if needed, add/commit all files, set the GitHub remote, push, and automatically set GitHub About topics. Optionally creates the repo via gh CLI when it does not exist yet.',
    parameters: {
      url: { type: 'string', required: true, description: 'GitHub repository URL, e.g. https://github.com/owner/repo or git@github.com:owner/repo.git' },
      dir: { type: 'string', description: 'Project directory to upload; defaults to the current working directory' },
      message: { type: 'string', description: 'Commit message; defaults to "Update project"' },
      branch: { type: 'string', description: 'Branch to push; defaults to "main"' },
      visibility: { type: 'string', description: 'Visibility when creating a new repo: public or private (default public)' },
      readmeMode: { type: 'string', description: 'README handling: auto (default, create/improve), keep (leave as-is), rewrite (always regenerate)' },
      topics: { type: 'string', description: 'Optional comma-separated extra GitHub topics to add, e.g. "dsh,plugin,automation"' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    async execute(args) {
      const dir = String(args.dir || process.cwd() || '.')
      const branch = String(args.branch || config.defaultBranch || 'main')
      const message = String(args.message || config.defaultMessage || 'Update project')
      const visibility = String(args.visibility || 'public').toLowerCase() === 'private' ? 'private' : 'public'
      const normalized = normalizeGithubUrl(args.url)
      if (!normalized.url) return 'Please provide a valid GitHub repository URL.'

      const lines = []
      lines.push(`Target directory: ${dir}`)
      lines.push(`GitHub URL: ${normalized.url}`)
      lines.push(`Branch: ${branch}`)

      // 0. README auto create/improve (unless keep)
      const readmeMode = String(args.readmeMode || 'auto').toLowerCase()
      if (readmeMode !== 'keep') {
        try {
          const readme = ensureReadme(dir, readmeMode === 'rewrite')
          lines.push(`[readme] ${readme.action}`)
        } catch (error) {
          lines.push(`[readme] skipped (${error?.message || error})`)
        }
      } else {
        lines.push('[readme] kept as-is (readmeMode=keep)')
      }

      // 1. Ensure git repo
      const repo = ensureGitRepo(dir, branch)
      if (!repo.ok) return repo.message
      lines.push(`[git] ${repo.message}`)

      // 2. Commit all changes
      const commit = commitAll(dir, message)
      if (!commit.ok) return commit.message
      lines.push(`[git] ${commit.message}`)

      // 3. Set remote
      const remote = ensureRemote(dir, normalized.url)
      if (!remote.ok) return remote.message
      lines.push(`[git] ${remote.message}`)

      // 4. Check whether the remote exists, then push or create
      const probe = run(dir, `git ls-remote ${normalized.url} HEAD`, 30000)
      if (probe.ok) {
        const push = run(dir, `git push -u origin ${branch}`, 180000)
        if (!push.ok) return `[push] failed: ${push.stderr}`
        lines.push(`[push] ${push.stdout || 'pushed successfully'}`)
      } else {
        const gh = run(process.cwd(), 'gh --version', 10000)
        if (!gh.ok) {
          return [
            ...lines,
            '[push] remote repo not found and gh CLI is not available.',
            `[hint] create the repo first at https://github.com/new or install/authenticate GitHub CLI, then run again.`,
          ].join('\n')
        }
        if (!normalized.repo) {
          return [...lines, '[push] cannot auto-create non-GitHub repo URL without a repo slug; create it manually.'].join('\n')
        }
        const create = run(dir, `gh repo create ${normalized.repo} --${visibility} --source . --remote origin --push`, 180000)
        if (!create.ok) return `[create+push] failed: ${create.stderr}`
        lines.push(`[create+push] ${create.stdout || `created ${normalized.repo} and pushed`}`)
      }

      // 5. Auto set GitHub About topics
      if (normalized.repo) {
        const pkg = readPackageJson(dir)
        const topics = deriveTopics(dir, pkg, args.topics)
        if (topics.length > 0) {
          const topicResult = await applyTopics(normalized.repo, topics, dir)
          lines.push(`[topics] ${topicResult.message}`)
        }
      }

      lines.push('')
      lines.push('Done. ✅')
      lines.push(`https://github.com/${normalized.repo || '(repo)'}`)
      return lines.join('\n')
    },
  })), '@dsh-external/dsh-github-push: dev_github_push')
}
