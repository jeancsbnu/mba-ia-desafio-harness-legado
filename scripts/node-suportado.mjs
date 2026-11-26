// Versão do Node que o Balcão aceita. A faixa fica num lugar só: o
// `engines.node` do package.json da raiz, que é a interseção do que as
// ferramentas declaram (o ESLint 10 pede 22.13; vitest, dependency-cruiser e
// watskeburt pulam as linhas ímpares 23 e 25).
//
// Fora da faixa, `npm ci` só avisa (EBADENGINE) e as ferramentas quebram de
// formas que não dizem o motivo: na 22.11 o knip morre com ERR_REQUIRE_ESM. Por
// isso a subida e os gates conferem a versão antes de qualquer outra coisa
// (docs/incidentes.md, incidente 8).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const numeros = (versao) => versao.replace(/^v/, '').split('.').map(Number)

function naoMenor(atual, minimo) {
  for (let i = 0; i < 3; i++) {
    const diferenca = (atual[i] ?? 0) - (minimo[i] ?? 0)
    if (diferenca !== 0) return diferenca > 0
  }
  return true
}

// Entende só o que o package.json usa: `^x.y.z` e `>=x.y.z`, unidos por `||`.
function atende(versao, faixa) {
  const atual = numeros(versao)
  return faixa.split('||').some((trecho) => {
    const m = trecho.trim().match(/^(\^|>=)(\d+(?:\.\d+){0,2})$/)
    if (!m) throw new Error(`engines.node do package.json com formato não suportado: "${trecho.trim()}"`)
    const minimo = numeros(m[2])
    return naoMenor(atual, minimo) && (m[1] === '>=' || atual[0] === minimo[0])
  })
}

/** Mensagem que explica o problema se o Node estiver fora da faixa; `null` se estiver dentro. */
export function problemaDoNode(versao = process.versions.node) {
  const faixa = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).engines.node
  if (atende(versao, faixa)) return null
  return `Node ${versao} não é suportado: o package.json pede ${faixa}. Instale a versão mais nova de uma linha LTS (22, 24 ou 26) e rode de novo.`
}
