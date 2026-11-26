#!/usr/bin/env node
// Sobe, derruba e mostra o Balcão DESTA cópia (clone ou worktree).
//
//   npm run up      instala, sobe Postgres, migra, roda a seed e sobe API, worker e front
//   npm run down    derruba só o que a subida desta cópia iniciou
//   npm run status  mostra endereços e processos desta cópia
//
// Cada cópia é identificada pelo caminho da pasta. Ela ganha o próprio projeto
// do docker compose (Postgres e volume), as próprias portas, a própria pasta de
// anexos e os próprios processos, e guarda esse estado em `.balcao/`.
// Só usa módulos do Node: roda em Linux e macOS com Node, Docker e Git.

import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { problemaDoNode } from './node-suportado.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR_ESTADO = path.join(RAIZ, '.balcao')
const ARQ_ESTADO = path.join(DIR_ESTADO, 'estado.json')
const DIR_LOGS = path.join(DIR_ESTADO, 'logs')
const DIR_ANEXOS = path.join(DIR_ESTADO, 'anexos')

const HASH = crypto.createHash('sha1').update(RAIZ).digest('hex')
const NOME_PASTA = path
  .basename(RAIZ)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 30)
const COPIA = `${NOME_PASTA || 'balcao'}-${HASH.slice(0, 6)}`
const PROJETO = `balcao-${COPIA}`
const DB_USUARIO = 'balcao'
const DB_SENHA = 'balcao'

// Portas sugeridas são estáveis por cópia (derivadas do caminho) e ficam fora
// de 3000, 4000, 5173 e 5432. Se estiverem ocupadas, a próxima livre é usada.
const SEMENTE = parseInt(HASH.slice(6, 12), 16)
const BASE_API = 4100 + (SEMENTE % 800)
const BASE_WEB = 5200 + (SEMENTE % 700)

const PROCESSOS = [
  { nome: 'api', pasta: 'api', args: ['run', 'dev'] },
  { nome: 'worker', pasta: 'api', args: ['run', 'worker'] },
  { nome: 'web', pasta: 'web', args: ['run', 'dev', '--', '--port', '{WEB_PORT}', '--strictPort'] },
]

// ---------------------------------------------------------------- utilitários

// Saída cortada (`npm run status | head`) não pode derrubar o script no meio
// de uma subida nem virar stack trace: quem leu o que queria já foi embora.
for (const saida of [process.stdout, process.stderr]) {
  saida.on('error', (err) => {
    if (err.code !== 'EPIPE') throw err
  })
}

function log(msg) {
  process.stdout.write(`${msg}\n`)
}

function falhar(msg) {
  process.stderr.write(`\nERRO: ${msg}\n`)
  process.exit(1)
}

function rodar(cmd, args, opcoes = {}) {
  const r = spawnSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', ...opcoes })
  if (r.error) throw r.error
  return r
}

function rodarOuFalhar(descricao, cmd, args, opcoes = {}) {
  const r = rodar(cmd, args, opcoes)
  if (r.status !== 0) {
    const saida = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-25).join('\n')
    falhar(`${descricao} falhou (${cmd} ${args.join(' ')}):\n${saida}`)
  }
  return r
}

function lerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8'))
  } catch {
    return {}
  }
}

function salvarEstado(estado) {
  fs.mkdirSync(DIR_ESTADO, { recursive: true })
  fs.writeFileSync(ARQ_ESTADO, `${JSON.stringify(estado, null, 2)}\n`)
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --------------------------------------------------------------------- portas

function portaLivreEm(porta, host) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', (err) => resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT'))
    s.listen({ port: porta, host, exclusive: true }, () => s.close(() => resolve(true)))
  })
}

async function portaLivre(porta) {
  for (const host of ['127.0.0.1', '0.0.0.0', '::1', '::']) {
    if (!(await portaLivreEm(porta, host))) return false
  }
  return true
}

async function escolherPorta(preferida, base, reservadas) {
  if (preferida && !reservadas.has(preferida) && (await portaLivre(preferida))) return preferida
  for (let p = base; p < base + 400; p++) {
    if (!reservadas.has(p) && (await portaLivre(p))) return p
  }
  falhar(`nenhuma porta livre a partir de ${base}`)
}

// ------------------------------------------------------------------ processos

function inicioDoProcesso(pid) {
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

function vivo(proc) {
  if (!proc || !proc.pid) return false
  try {
    process.kill(proc.pid, 0)
  } catch {
    return false
  }
  // Confere que o PID ainda é o processo que esta cópia iniciou (PIDs são reaproveitados).
  return inicioDoProcesso(proc.pid) === proc.inicio
}

function grupoVivo(pgid) {
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
}

async function pararProcessos(estado) {
  const procs = Object.entries(estado.processos || {})
  const alvos = procs.filter(([, p]) => vivo(p))
  for (const [, p] of alvos) {
    try {
      process.kill(-p.pid, 'SIGTERM')
    } catch {
      // o grupo já terminou
    }
  }
  for (let i = 0; i < 50 && alvos.some(([, p]) => grupoVivo(p.pid)); i++) await esperar(100)
  for (const [, p] of alvos) {
    if (grupoVivo(p.pid)) {
      try {
        process.kill(-p.pid, 'SIGKILL')
      } catch {
        // o grupo já terminou
      }
    }
  }
  return alvos.map(([nome]) => nome)
}

function iniciarProcesso(def, env, portas) {
  fs.mkdirSync(DIR_LOGS, { recursive: true })
  const arquivoLog = path.join(DIR_LOGS, `${def.nome}.log`)
  const fd = fs.openSync(arquivoLog, 'w')
  const args = def.args.map((a) => a.replace('{WEB_PORT}', String(portas.web)))
  // detached: o processo vira líder de um grupo próprio, e o `down` encerra o grupo
  // inteiro (npm, tsx, vite e filhos) sem tocar em processos de outras cópias.
  const filho = spawn('npm', args, {
    cwd: path.join(RAIZ, def.pasta),
    env,
    detached: true,
    stdio: ['ignore', fd, fd],
  })
  filho.unref()
  fs.closeSync(fd)
  return { pid: filho.pid, inicio: inicioDoProcesso(filho.pid), log: path.relative(RAIZ, arquivoLog) }
}

function finalDoLog(arquivo, linhas = 20) {
  try {
    return fs.readFileSync(path.join(RAIZ, arquivo), 'utf8').trim().split('\n').slice(-linhas).join('\n')
  } catch {
    return '(sem log)'
  }
}

async function esperarHttp(url, segundos) {
  for (let i = 0; i < segundos * 4; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return true
    } catch {
      // ainda subindo
    }
    await esperar(250)
  }
  return false
}

async function esperarLog(arquivo, trecho, segundos) {
  for (let i = 0; i < segundos * 4; i++) {
    if (finalDoLog(arquivo, 200).includes(trecho)) return true
    await esperar(250)
  }
  return false
}

// --------------------------------------------------------------- dependências

function hashArquivo(arquivo) {
  return crypto.createHash('sha1').update(fs.readFileSync(arquivo)).digest('hex')
}

function instalarDependencias() {
  for (const pasta of ['.', 'api', 'web']) {
    const dir = path.join(RAIZ, pasta)
    const lock = path.join(dir, 'package-lock.json')
    const marca = path.join(dir, 'node_modules', '.balcao-lock')
    const hash = hashArquivo(lock)
    let atual = ''
    try {
      atual = fs.readFileSync(marca, 'utf8').trim()
    } catch {
      // ainda não instalado
    }
    const nome = pasta === '.' ? 'raiz' : pasta
    if (atual === hash) {
      log(`  ${nome}: dependências em dia`)
      continue
    }
    log(`  ${nome}: npm ci (respeita o package-lock.json)...`)
    rodarOuFalhar(`npm ci em ${nome}`, 'npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir })
    fs.mkdirSync(path.dirname(marca), { recursive: true })
    fs.writeFileSync(marca, `${hash}\n`)
  }
}

// ------------------------------------------------------------------ ambiente

function lerDotenv(arquivo) {
  const valores = new Map()
  if (!fs.existsSync(arquivo)) return valores
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
    if (m) valores.set(m[1], m[2])
  }
  return valores
}

// Gera o api/.env da cópia: chaves de endereço são sempre desta cópia; as
// demais (AI_MODE, chaves, segredos) preservam o que já estava no .env.
function escreverEnvApi(gerenciadas) {
  const exemplo = lerDotenv(path.join(RAIZ, 'api', '.env.example'))
  const atual = lerDotenv(path.join(RAIZ, 'api', '.env'))
  const final = new Map([...exemplo, ...atual, ...Object.entries(gerenciadas)])
  const corpo = [...final].map(([k, v]) => `${k}=${v}`).join('\n')
  fs.writeFileSync(
    path.join(RAIZ, 'api', '.env'),
    `# Gerado por \`npm run up\` para a cópia ${COPIA}. Endereços são regravados a cada subida.\n${corpo}\n`,
  )
}

// WEB_PORT é lida pelo web/vite.config.ts: `npm run dev` direto em web/ também
// sobe na porta desta cópia.
function escreverEnvWeb(apiUrl, webPorta) {
  fs.writeFileSync(
    path.join(RAIZ, 'web', '.env.local'),
    `# Gerado por \`npm run up\` para a cópia ${COPIA}.\nVITE_API_URL=${apiUrl}\nWEB_PORT=${webPorta}\n`,
  )
}

// --------------------------------------------------------------------- docker

function compose(args, opcoes = {}) {
  return rodar('docker', ['compose', '-p', PROJETO, '-f', path.join(RAIZ, 'docker-compose.yml'), ...args], opcoes)
}

function checarPreRequisitos() {
  const nodeRuim = problemaDoNode()
  if (nodeRuim) falhar(nodeRuim)
  const docker = rodar('docker', ['info', '--format', '{{.ServerVersion}}'])
  if (docker.status !== 0) falhar('o Docker não está respondendo. Abra o Docker e rode de novo.')
  const versao = rodar('docker', ['compose', 'version'])
  if (versao.status !== 0) falhar('o plugin `docker compose` não foi encontrado.')
  const git = rodar('git', ['rev-parse', '--show-toplevel'])
  if (git.status !== 0) falhar('rode dentro de um clone (ou worktree) do repositório.')
}

function subirBanco() {
  const r = compose(['up', '-d', '--wait', 'db'])
  if (r.status !== 0) falhar(`o Postgres da cópia não subiu:\n${(r.stderr || r.stdout).trim()}`)
  const porta = compose(['port', 'db', '5432'])
  const m = (porta.stdout || '').trim().match(/:(\d+)\s*$/)
  if (!m) falhar(`não consegui descobrir a porta do Postgres: ${porta.stdout}${porta.stderr}`)
  return Number(m[1])
}

function garantirBancoDeTeste() {
  const existe = compose([
    'exec', '-T', 'db', 'psql', '-U', DB_USUARIO, '-d', 'balcao', '-tAc',
    "SELECT 1 FROM pg_database WHERE datname = 'balcao_test'",
  ])
  if ((existe.stdout || '').trim() !== '1') {
    compose(['exec', '-T', 'db', 'psql', '-U', DB_USUARIO, '-d', 'balcao', '-c', 'CREATE DATABASE balcao_test'])
  }
}

// ------------------------------------------------------------------- comandos

async function up() {
  log(`Subindo o Balcão da cópia ${COPIA}`)
  checarPreRequisitos()

  const estado = lerEstado()
  const parados = await pararProcessos(estado)
  if (parados.length) log(`  processos anteriores desta cópia reiniciados: ${parados.join(', ')}`)

  log('Dependências')
  instalarDependencias()

  if (fs.existsSync(path.join(RAIZ, '.githooks'))) {
    rodar('git', ['config', 'core.hooksPath', '.githooks'])
  }

  log('Banco')
  const dbPorta = subirBanco()
  const reservadas = new Set([dbPorta])
  const apiPorta = await escolherPorta(estado.portas?.api, BASE_API, reservadas)
  reservadas.add(apiPorta)
  const webPorta = await escolherPorta(estado.portas?.web, BASE_WEB, reservadas)
  const portas = { api: apiPorta, web: webPorta, db: dbPorta }

  const apiUrl = `http://localhost:${apiPorta}`
  const webUrl = `http://localhost:${webPorta}`
  const dbBase = `postgresql://${DB_USUARIO}:${DB_SENHA}@localhost:${dbPorta}`
  const gerenciadas = {
    DATABASE_URL: `${dbBase}/balcao`,
    DATABASE_URL_TEST: `${dbBase}/balcao_test`,
    PORT: String(apiPorta),
    UPLOAD_DIR: DIR_ANEXOS,
    CORS_ORIGIN: webUrl,
  }
  fs.mkdirSync(DIR_ANEXOS, { recursive: true })
  escreverEnvApi(gerenciadas)
  escreverEnvWeb(apiUrl, webPorta)

  // As variáveis desta cópia vão explícitas para os filhos: um PORT ou
  // DATABASE_URL exportado no shell não pode apontar a cópia para outro lugar.
  const env = {
    ...process.env,
    ...gerenciadas,
    VITE_API_URL: apiUrl,
    WEB_PORT: String(webPorta),
    BALCAO_COPIA: COPIA,
  }
  const emApi = { cwd: path.join(RAIZ, 'api'), env }

  rodarOuFalhar('prisma generate', 'npx', ['prisma', 'generate'], emApi)
  log('  migrations...')
  rodarOuFalhar('migrations', 'npx', ['prisma', 'migrate', 'deploy'], emApi)
  garantirBancoDeTeste()
  rodarOuFalhar('migrations do banco de teste', 'npx', ['prisma', 'migrate', 'deploy'], {
    ...emApi,
    env: { ...env, DATABASE_URL: gerenciadas.DATABASE_URL_TEST },
  })
  log('  seed...')
  rodarOuFalhar('seed', 'npm', ['run', 'seed'], emApi)

  log('Processos')
  const processos = {}
  for (const def of PROCESSOS) {
    processos[def.nome] = iniciarProcesso(def, env, portas)
  }
  salvarEstado({ copia: COPIA, projeto: PROJETO, portas, processos, anexos: DIR_ANEXOS })

  const prontos = await Promise.all([
    esperarHttp(`${apiUrl}/api/health`, 90),
    esperarLog(processos.worker.log, 'worker de triagem rodando', 90),
    esperarHttp(webUrl, 90),
  ])
  const nomes = ['api', 'worker', 'web']
  const falhos = nomes.filter((_, i) => !prontos[i])
  if (falhos.length) {
    for (const nome of falhos) log(`\n--- ${nome} (${processos[nome].log}) ---\n${finalDoLog(processos[nome].log)}`)
    await pararProcessos(lerEstado())
    falhar(`não ficou de pé: ${falhos.join(', ')}. Logs em .balcao/logs/`)
  }

  log(`
Balcão no ar (cópia ${COPIA})
  API:      ${apiUrl}   (saúde: ${apiUrl}/api/health)
  Front:    ${webUrl}
  Banco:    ${dbBase}/balcao   (Postgres do projeto compose ${PROJETO})
  Anexos:   ${DIR_ANEXOS}
  Logs:     ${DIR_LOGS}
  Derrubar: npm run down`)
}

async function down() {
  log(`Derrubando o Balcão da cópia ${COPIA}`)
  const estado = lerEstado()
  const parados = await pararProcessos(estado)
  log(`  processos encerrados: ${parados.length ? parados.join(', ') : 'nenhum estava rodando'}`)
  const apagarVolume = process.argv.includes('--apagar-dados')
  // Olha antes de derrubar, para a mensagem dizer o que de fato aconteceu.
  const doProjeto = ['--filter', `label=com.docker.compose.project=${PROJETO}`]
  const tinhaContainer = Boolean(rodar('docker', ['ps', '-aq', ...doProjeto]).stdout?.trim())
  const tinhaDados = Boolean(rodar('docker', ['volume', 'ls', '-q', ...doProjeto]).stdout?.trim())
  const r = compose(['down', ...(apagarVolume ? ['-v'] : [])])
  if (r.status !== 0) log(`  aviso: docker compose down falhou: ${(r.stderr || '').trim()}`)
  else if (!tinhaContainer && !tinhaDados) log('  Postgres da cópia: nada para parar nem apagar')
  else {
    const parado = tinhaContainer ? 'parado' : 'já estava parado'
    const dados = !tinhaDados ? 'não havia dados no volume' : apagarVolume ? 'dados apagados' : 'dados mantidos no volume'
    log(`  Postgres da cópia ${parado} (${dados})`)
  }
  if (Object.keys(estado).length) salvarEstado({ ...estado, processos: {} })
}

function status() {
  const estado = lerEstado()
  log(`Cópia ${COPIA} (projeto compose ${PROJETO})`)
  if (!estado.portas) {
    log('  ainda não subiu: rode `npm run up`')
    return
  }
  log(`  API:    http://localhost:${estado.portas.api}`)
  log(`  Front:  http://localhost:${estado.portas.web}`)
  log(`  Banco:  postgresql://${DB_USUARIO}:${DB_SENHA}@localhost:${estado.portas.db}/balcao`)
  log(`  Anexos: ${estado.anexos}`)
  for (const [nome, p] of Object.entries(estado.processos || {})) {
    log(`  ${nome.padEnd(6)} ${vivo(p) ? `rodando (pid ${p.pid})` : 'parado'}`)
  }
}

const comando = process.argv[2]
const comandos = { up, down, status }
if (!comandos[comando]) {
  falhar('uso: node scripts/ambiente.mjs <up|down|status> [--apagar-dados]')
}
await comandos[comando]()
