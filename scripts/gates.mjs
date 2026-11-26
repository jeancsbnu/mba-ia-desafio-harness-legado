#!/usr/bin/env node
// Gates do Balcão: roda TODAS as verificações (em paralelo, sem parar na
// primeira falha) e termina com a lista de violações, uma por linha:
//
//   G4 api/src/http/routes/stats.ts  (importa api/src/repositories/prisma.ts)
//   G10 api/package.json left-pad  (dependência sem uso)
//
// Sai com código 1 se qualquer regra falhar.
//
//   npm run gates          todas as regras (G1 a G13)
//   npm run gates:commit   só tipo e lint (G1, G2, G5 e G11): é o que o hook roda
//
// Ferramentas: tsc (G1), ESLint + plugin local (G2, G5, G11), Vitest (G3),
// dependency-cruiser (G4, G6, G7, G8, G9, G12), knip (G10) e a checagem de
// documentação deste arquivo (G13). Nada é escrito dentro do repositório.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SO_COMMIT = process.argv.includes('--commit')

// `npm run gates | head` não pode virar stack trace nem mudar o código de saída.
process.stdout.on('error', (err) => {
  if (err.code !== 'EPIPE') throw err
})

const bin = (pasta, nome) => path.join(RAIZ, pasta, 'node_modules', '.bin', nome)
const relativo = (arquivo) => path.relative(RAIZ, path.resolve(RAIZ, arquivo)).split(path.sep).join('/')

function executar(cmd, args, cwd = RAIZ) {
  return new Promise((resolve) => {
    if (!fs.existsSync(cmd)) {
      resolve({ codigo: 127, saida: '', erro: `${relativo(cmd)} não existe: rode \`npm run up\` para instalar as dependências` })
      return
    }
    const filho = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } })
    let saida = ''
    let erro = ''
    filho.stdout.on('data', (d) => (saida += d))
    filho.stderr.on('data', (d) => (erro += d))
    filho.on('error', (e) => resolve({ codigo: 127, saida, erro: `${erro}${e.message}` }))
    filho.on('close', (codigo) => resolve({ codigo, saida, erro }))
  })
}

function falhaDaFerramenta(id, arquivo, resultado) {
  const ultimas = `${resultado.erro}\n${resultado.saida}`.trim().split('\n').slice(-3).join(' | ')
  return [{ id, arquivo, detalhe: `a ferramenta falhou: ${ultimas.slice(0, 300)}` }]
}

// ------------------------------------------------------------------ G1 tsc

async function tipos(pasta) {
  const r = await executar(bin(pasta, 'tsc'), ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.json'], path.join(RAIZ, pasta))
  if (r.codigo === 0) return []
  const violacoes = []
  for (const linha of r.saida.split('\n')) {
    const m = linha.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/)
    if (m) violacoes.push({ id: 'G1', arquivo: relativo(path.join(pasta, m[1])), detalhe: `linha ${m[2]}: ${m[3]} ${m[4]}` })
    else if (/error TS\d+/.test(linha)) violacoes.push({ id: 'G1', arquivo: `${pasta}/tsconfig.json`, detalhe: linha.trim() })
  }
  return violacoes.length ? violacoes : falhaDaFerramenta('G1', `${pasta}/tsconfig.json`, r)
}

// ------------------------------------------------------- G2, G5, G11 ESLint

const REGRAS_ESLINT = {
  'balcao/env-so-em-config': 'G5',
  'balcao/sem-endereco-fixo': 'G11',
}

async function lint() {
  const r = await executar(bin('.', 'eslint'), ['.', '--format', 'json'])
  let relatorio
  try {
    relatorio = JSON.parse(r.saida)
  } catch {
    return falhaDaFerramenta('G2', 'eslint.config.mjs', r)
  }
  const violacoes = []
  for (const arquivo of relatorio) {
    for (const msg of arquivo.messages) {
      violacoes.push({
        id: REGRAS_ESLINT[msg.ruleId] || 'G2',
        arquivo: relativo(arquivo.filePath),
        detalhe: `linha ${msg.line ?? '?'}: ${msg.ruleId ?? 'erro de sintaxe'}: ${msg.message.replace(/^\[G\d+\] /, '')}`,
      })
    }
  }
  if (r.codigo !== 0 && violacoes.length === 0) return falhaDaFerramenta('G2', 'eslint.config.mjs', r)
  return violacoes
}

// ---------------------------------------------------------------- G3 Vitest

async function testes() {
  const saidaJson = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'balcao-gates-')), 'vitest.json')
  const r = await executar(bin('api', 'vitest'), ['run', '--reporter=json', `--outputFile=${saidaJson}`], path.join(RAIZ, 'api'))
  let relatorio = null
  try {
    relatorio = JSON.parse(fs.readFileSync(saidaJson, 'utf8'))
  } catch {
    // sem relatório: tratado abaixo
  }
  fs.rmSync(path.dirname(saidaJson), { recursive: true, force: true })
  const violacoes = []
  for (const arquivo of relatorio?.testResults ?? []) {
    if (arquivo.status === 'passed') continue
    const falhou = (arquivo.assertionResults ?? []).find((t) => t.status === 'failed')
    const motivo = falhou ? `teste "${falhou.fullName || falhou.title}" falhou` : (arquivo.message || 'arquivo de teste falhou').split('\n')[0]
    violacoes.push({ id: 'G3', arquivo: relativo(arquivo.name), detalhe: motivo.slice(0, 200) })
  }
  if (r.codigo !== 0 && violacoes.length === 0) return falhaDaFerramenta('G3', 'api/vitest.config.mts', r)
  return violacoes
}

// --------------------------------------- G4, G6, G7, G8, G9, G12 dependências

async function dependencias() {
  const r = await executar(bin('.', 'depcruise'), ['api', 'web', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'])
  let relatorio
  try {
    relatorio = JSON.parse(r.saida)
  } catch {
    return falhaDaFerramenta('G4', '.dependency-cruiser.cjs', r)
  }
  const violacoes = []
  for (const v of relatorio.summary.violations) {
    const id = (v.rule.name.match(/^G\d+/) || ['G4'])[0]
    if (v.cycle?.length) {
      const ciclo = [v.from, ...v.cycle.map((c) => c.name ?? c)]
      for (const membro of new Set(ciclo)) {
        violacoes.push({ id, arquivo: membro, detalhe: `import circular: ${ciclo.join(' → ')}` })
      }
    } else {
      violacoes.push({ id, arquivo: v.from, detalhe: `importa ${v.to} (${v.rule.name})` })
    }
  }
  return violacoes
}

// ---------------------------------------------------------------- G10 knip

const TIPOS_KNIP = {
  files: 'arquivo sem uso',
  dependencies: 'dependência sem uso',
  devDependencies: 'dependência de desenvolvimento sem uso',
  optionalPeerDependencies: 'peer dependency opcional sem uso',
  unlisted: 'dependência usada mas não declarada',
  unresolved: 'import não resolvido',
  binaries: 'binário usado mas não declarado',
  exports: 'export sem uso',
  types: 'export de tipo sem uso',
  nsExports: 'export sem uso (namespace)',
  nsTypes: 'export de tipo sem uso (namespace)',
  enumMembers: 'membro de enum sem uso',
  namespaceMembers: 'membro de namespace sem uso',
  classMembers: 'membro de classe sem uso',
  duplicates: 'export duplicado',
}
const DEPENDENCIAS_KNIP = new Set(['dependencies', 'devDependencies', 'optionalPeerDependencies', 'unlisted', 'binaries'])

async function codigoMorto() {
  const r = await executar(bin('.', 'knip'), ['--reporter', 'json', '--no-progress'])
  let relatorio
  try {
    relatorio = JSON.parse(r.saida)
  } catch {
    return falhaDaFerramenta('G10', 'knip.json', r)
  }
  const violacoes = []
  for (const issue of relatorio.issues ?? []) {
    for (const [tipo, itens] of Object.entries(issue)) {
      if (!Array.isArray(itens) || itens.length === 0) continue
      const descricao = TIPOS_KNIP[tipo] || tipo
      for (const item of itens) {
        const nome = Array.isArray(item) ? item.map((i) => i.name).join(', ') : item.name
        if (tipo === 'files') {
          violacoes.push({ id: 'G10', arquivo: relativo(nome || issue.file), detalhe: descricao })
        } else if (DEPENDENCIAS_KNIP.has(tipo)) {
          violacoes.push({ id: 'G10', arquivo: `${relativo(issue.file)} ${nome}`, detalhe: descricao })
        } else {
          violacoes.push({ id: 'G10', arquivo: relativo(issue.file), detalhe: `${descricao}: ${nome}` })
        }
      }
    }
  }
  if (r.codigo !== 0 && violacoes.length === 0) return falhaDaFerramenta('G10', 'knip.json', r)
  return violacoes
}

// ------------------------------------------------------- G13 documentação

const LIMITE_AGENTS = 60
const ATALHOS_NPM = { t: 'test', tst: 'test' }

function ignoradosPeloGit() {
  try {
    return fs
      .readFileSync(path.join(RAIZ, '.gitignore'), 'utf8')
      .split('\n')
      .map((l) => l.trim().replace(/\/$/, ''))
      .filter((l) => l && !l.startsWith('#'))
  } catch {
    return []
  }
}

function existeCaminho(caminho) {
  const limpo = caminho.replace(/^\.\//, '')
  const antesDoCoringa = limpo.split('*')[0]
  return fs.existsSync(path.join(RAIZ, antesDoCoringa || '.'))
}

function scriptsDe(pasta) {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, pasta, 'package.json'), 'utf8')).scripts || {}
  } catch {
    return {}
  }
}

async function documentacao() {
  const violacoes = []
  const agents = path.join(RAIZ, 'AGENTS.md')
  if (!fs.existsSync(agents)) return [{ id: 'G13', arquivo: 'AGENTS.md', detalhe: 'AGENTS.md não existe' }]
  const texto = fs.readFileSync(agents, 'utf8')
  const linhas = (texto.match(/\n/g) || []).length
  if (linhas > LIMITE_AGENTS) {
    violacoes.push({ id: 'G13', arquivo: 'AGENTS.md', detalhe: `tem ${linhas} linhas (máximo ${LIMITE_AGENTS})` })
  }
  const claude = path.join(RAIZ, 'CLAUDE.md')
  if (!fs.existsSync(claude) || !fs.readFileSync(claude, 'utf8').includes('AGENTS.md')) {
    violacoes.push({ id: 'G13', arquivo: 'CLAUDE.md', detalhe: 'CLAUDE.md precisa apontar para o AGENTS.md' })
  }

  const ignorados = ignoradosPeloGit()
  const gerado = (c) => c.split('/').some((parte) => ignorados.includes(parte))
  const citados = new Set()
  for (const m of texto.matchAll(/`([^`\n]+)`/g)) citados.add(m[1].trim())
  for (const m of texto.matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) if (!/^[a-z]+:/.test(m[1])) citados.add(m[1])

  for (const citado of citados) {
    if (/<[^>]+>/.test(citado)) continue // placeholder explicado no próprio AGENTS.md
    // `npm run x`, `npm run-script x` e os atalhos `npm test`, `npm start`...
    const npm = citado.match(/^npm (?:--prefix (\S+) )?(?:run(?:-script)? ([\w:.-]+)|(test|t|tst|start|stop|restart)(?=\s|$))/)
    if (npm) {
      const pasta = npm[1] || '.'
      const script = npm[2] ?? ATALHOS_NPM[npm[3]] ?? npm[3]
      if (!scriptsDe(pasta)[script]) {
        violacoes.push({ id: 'G13', arquivo: 'AGENTS.md', detalhe: `comando inexistente: \`${citado}\` (sem script "${script}" em ${pasta}/package.json)` })
      }
      continue
    }
    const exec = citado.match(/^(?:bash|node|sh) (\S+)/)
    const caminho = exec ? exec[1] : citado
    if (caminho.startsWith('@')) continue // pacote npm com escopo, não caminho
    const pareceCaminho = /^\.{0,2}\/?[\w.@-]+(\/[\w.@*-]*)+$/.test(caminho) || /^[\w.-]+\.(md|ts|tsx|mts|mjs|cjs|js|json|ya?ml|sh|prisma)$/.test(caminho)
    if (!pareceCaminho || gerado(caminho)) continue
    if (!existeCaminho(caminho)) {
      violacoes.push({ id: 'G13', arquivo: 'AGENTS.md', detalhe: `caminho inexistente: \`${citado}\`` })
    }
  }
  return violacoes
}

// ------------------------------------------------------------------ execução

const VERIFICACOES = [
  { nome: 'G1  tipos (api)', rodar: () => tipos('api'), commit: true },
  { nome: 'G1  tipos (web)', rodar: () => tipos('web'), commit: true },
  { nome: 'G2  lint, com G5 (env) e G11 (endereço fixo)', rodar: lint, commit: true },
  { nome: 'G3  testes unitários da API', rodar: testes },
  { nome: 'G4 G6 G7 G8 G9 G12  dependências', rodar: dependencias },
  { nome: 'G10 código morto', rodar: codigoMorto },
  { nome: 'G13 documentação para agentes', rodar: documentacao },
]

const selecionadas = VERIFICACOES.filter((v) => !SO_COMMIT || v.commit)
const inicio = Date.now()
process.stdout.write(`Gates do Balcão${SO_COMMIT ? ' (pre-commit: tipo e lint)' : ''}: ${selecionadas.length} verificações\n`)

const resultados = await Promise.all(
  selecionadas.map(async (v) => {
    const t0 = Date.now()
    let violacoes
    try {
      violacoes = await v.rodar()
    } catch (err) {
      violacoes = [{ id: v.nome.split(' ')[0], arquivo: 'scripts/gates.mjs', detalhe: `erro ao rodar: ${err.message}` }]
    }
    return { ...v, violacoes, segundos: ((Date.now() - t0) / 1000).toFixed(1) }
  }),
)

for (const r of resultados) {
  const situacao = r.violacoes.length ? `FALHOU (${r.violacoes.length})` : 'ok'
  process.stdout.write(`  ${situacao.padEnd(12)} ${r.nome}  [${r.segundos}s]\n`)
}

const numero = (id) => Number(id.slice(1))
const vistas = new Set()
const todas = resultados
  .flatMap((r) => r.violacoes)
  .sort((a, b) => numero(a.id) - numero(b.id) || a.arquivo.localeCompare(b.arquivo))
  .map((v) => `${v.id} ${v.arquivo}  (${v.detalhe})`)
  .filter((linha) => !vistas.has(linha) && vistas.add(linha))

const total = ((Date.now() - inicio) / 1000).toFixed(1)
if (todas.length === 0) {
  process.stdout.write(`\nGates passaram em ${total}s.\n`)
  process.exit(0)
}
process.stdout.write(`\nViolações (${todas.length}), em ${total}s:\n${todas.join('\n')}\n`)
process.exit(1)
