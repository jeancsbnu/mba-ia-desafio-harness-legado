#!/usr/bin/env node
// Chamado pelo .githooks/pre-commit. Exporta o conteúdo do stage (index) para
// uma pasta temporária e roda ali os gates de tipo e lint
// (`scripts/gates.mjs --commit`): o que é verificado é o que vai ser commitado,
// e não a pasta de trabalho (que pode ter mudanças fora do stage).

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { problemaDoNode } from './node-suportado.mjs'

const nodeRuim = problemaDoNode()
if (nodeRuim) {
  process.stderr.write(`pre-commit: ${nodeRuim}\nCommit bloqueado: com esse Node, tipo e lint não são confiáveis.\n`)
  process.exit(1)
}

const raiz = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim()
const pacotes = ['.', 'api', 'web']

const semDependencias = pacotes.filter((p) => !fs.existsSync(path.join(raiz, p, 'node_modules')))
if (semDependencias.length) {
  process.stderr.write(
    `pre-commit: faltam dependências em ${semDependencias.join(', ')}. Rode \`npm run up\` antes de commitar.\n`,
  )
  process.exit(1)
}

const copia = fs.mkdtempSync(path.join(os.tmpdir(), 'balcao-pre-commit-'))
let codigo = 1
try {
  const exportar = spawnSync('git', ['checkout-index', '--all', '--force', `--prefix=${copia}${path.sep}`], {
    cwd: raiz,
    stdio: 'inherit',
  })
  if (exportar.status !== 0) throw new Error('git checkout-index falhou')
  for (const pacote of pacotes) {
    fs.symlinkSync(path.join(raiz, pacote, 'node_modules'), path.join(copia, pacote, 'node_modules'), 'dir')
  }
  const gates = spawnSync(process.execPath, [path.join(copia, 'scripts', 'gates.mjs'), '--commit'], {
    cwd: copia,
    stdio: 'inherit',
  })
  codigo = gates.status ?? 1
} catch (err) {
  process.stderr.write(`pre-commit: ${err.message}\n`)
} finally {
  fs.rmSync(copia, { recursive: true, force: true })
}

if (codigo !== 0) {
  process.stderr.write('\nCommit bloqueado pelos gates de tipo e lint. Corrija as violações acima e rode `git add` de novo.\n')
}
process.exit(codigo)
