// Regras de dependência do Balcão (gates G4, G6, G7, G8, G9 e G12).
// tsPreCompilationDeps: true faz o dependency-cruiser ler o TypeScript antes
// da compilação, então `import type`, `import { type X }`, `export ... from`,
// `require`, `import()` e `typeof import()` contam como dependência.
// Cada regra começa com o ID do gate: o runner (scripts/gates.mjs) usa esse
// prefixo para montar a lista final.

// Casa o módulo resolvido em node_modules e também o nome cru, quando o pacote
// nem está instalado naquela pasta (ex.: openai importado no front).
const pacote = (...nomes) => {
  const alt = nomes.map((n) => n.replace(/[.]/g, '\\.').replace(/\//g, '\\/')).join('|')
  return `(^|/)node_modules/(${alt})(/|$)|^(${alt})($|/)`
}

const PRISMA = pacote('@prisma/client', '.prisma/client')
// Os tipos do Express moram em pacotes @types separados: `Request` vem de
// @types/express-serve-static-core, e um `import type` desse pacote também é
// "serviço conhecendo o Express".
const EXPRESS_E_MULTER = pacote(
  'express',
  '@types/express',
  'express-serve-static-core',
  '@types/express-serve-static-core',
  'multer',
  '@types/multer',
)
const OPENAI = pacote('openai')

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'G4-http-sem-prisma',
      severity: 'error',
      comment: 'A camada HTTP não fala com o banco: use um serviço.',
      from: { path: '^api/src/http/' },
      to: { path: PRISMA },
    },
    {
      name: 'G4-http-sem-repositorios',
      severity: 'error',
      comment: 'A camada HTTP não importa repositórios: use um serviço.',
      from: { path: '^api/src/http/' },
      to: { path: '^api/src/repositories/' },
    },
    {
      name: 'G6-servicos-sem-http',
      severity: 'error',
      comment: 'Serviço não conhece HTTP: nada de express, multer ou api/src/http/ (nem só o tipo).',
      from: { path: '^api/src/services/' },
      to: { path: [EXPRESS_E_MULTER, '^api/src/http/'] },
    },
    {
      name: 'G7-openai-so-em-integrations',
      severity: 'error',
      comment: 'O SDK da OpenAI só entra por api/src/integrations/.',
      from: { pathNot: '^api/src/integrations/' },
      to: { path: OPENAI },
    },
    {
      name: 'G8-web-sem-api',
      severity: 'error',
      comment: 'O front não importa nada de api/ (nem só o tipo): declare o tipo no front.',
      from: { path: '^web/' },
      to: { path: '^api/' },
    },
    {
      name: 'G9-sem-ciclo',
      severity: 'error',
      comment: 'Nenhum import circular (nem só de tipo).',
      from: { path: '^(api|web)/src/' },
      to: { circular: true },
    },
    {
      name: 'G12-prisma-so-em-repositorios',
      severity: 'error',
      comment:
        'O Prisma Client só é usado em api/src/repositories/: serviços, jobs e integrações passam pelos repositórios. (Em api/src/http/ quem acusa é a G4.)',
      from: { path: '^api/src/', pathNot: '^api/src/(repositories|http)/' },
      to: { path: PRISMA },
    },
  ],
  options: {
    // node_modules não é varrido, mas continua aparecendo como destino: é assim
    // que as regras enxergam express, multer, openai e @prisma/client.
    doNotFollow: { path: '(^|/)node_modules/' },
    exclude: { path: '(^|/)(dist|\\.balcao)/' },
    tsPreCompilationDeps: true,
    detectJSDocImports: true,
    moduleSystems: ['es6', 'cjs', 'tsd'],
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'],
    },
  },
}
