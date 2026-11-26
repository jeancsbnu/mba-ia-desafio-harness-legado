// Plugin local de ESLint com as regras do Balcão que olham o código (AST).
//
//   balcao/env-so-em-config   G5: process.env e import.meta.env só em config/
//   balcao/sem-endereco-fixo  G11: localhost, 127.0.0.1, 0.0.0.0 e /tmp/ só em config/
//
// A config (eslint.config.mjs) aplica as duas em api/src e web/src, com a
// pasta config/ como única exceção, que é a própria definição das regras.

const MODULOS_PROCESS = new Set(['process', 'node:process'])
const OBJETOS_GLOBAIS = new Set(['globalThis', 'global', 'window', 'self'])

function semEmbrulho(node) {
  let atual = node
  while (
    atual &&
    ['ChainExpression', 'TSAsExpression', 'TSNonNullExpression', 'TSTypeAssertion', 'TSSatisfiesExpression'].includes(
      atual.type,
    )
  ) {
    atual = atual.expression
  }
  return atual
}

function nomeDaPropriedade(member) {
  const p = member.property
  if (!member.computed && p.type === 'Identifier') return p.name
  if (p.type === 'Literal') return String(p.value)
  if (p.type === 'TemplateLiteral' && p.expressions.length === 0) return p.quasis[0].value.cooked
  return null
}

function ehRequireDeProcess(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments[0]?.type === 'Literal' &&
    MODULOS_PROCESS.has(node.arguments[0].value)
  )
}

const envSoEmConfig = {
  meta: {
    type: 'problem',
    docs: { description: 'G5: variáveis de ambiente só são lidas em config/' },
    schema: [],
    messages: {
      env: '[G5] {{acesso}} fora de config/: leia a variável em api/src/config/ (ou web/src/config/) e importe o valor de lá.',
    },
  },
  create(context) {
    // nomes locais que apontam para `process` ou `import.meta` (aliases e imports)
    const alvos = new Set(['process'])

    function ehAlvo(node) {
      const n = semEmbrulho(node)
      if (!n) return false
      if (n.type === 'Identifier') return alvos.has(n.name)
      if (n.type === 'MetaProperty') return n.meta.name === 'import' && n.property.name === 'meta'
      if (n.type === 'MemberExpression') {
        const obj = semEmbrulho(n.object)
        return nomeDaPropriedade(n) === 'process' && obj.type === 'Identifier' && OBJETOS_GLOBAIS.has(obj.name)
      }
      return ehRequireDeProcess(n)
    }

    function reportar(node) {
      context.report({ node, messageId: 'env', data: { acesso: context.sourceCode.getText(node).slice(0, 60) } })
    }

    function padraoComEnv(pattern) {
      return (
        pattern?.type === 'ObjectPattern' &&
        pattern.properties.some((p) => p.type === 'Property' && (p.key.name === 'env' || p.key.value === 'env'))
      )
    }

    return {
      ImportDeclaration(node) {
        if (!MODULOS_PROCESS.has(node.source.value)) return
        for (const s of node.specifiers) {
          if (s.type === 'ImportSpecifier') {
            const importado = s.imported.name ?? s.imported.value
            if (importado === 'env') reportar(s)
            if (importado === 'default') alvos.add(s.local.name)
          } else {
            alvos.add(s.local.name)
          }
        }
      },
      VariableDeclarator(node) {
        if (!node.init) return
        if (node.id.type === 'Identifier' && ehAlvo(node.init)) alvos.add(node.id.name)
        if (padraoComEnv(node.id) && ehAlvo(node.init)) reportar(node)
      },
      AssignmentExpression(node) {
        if (padraoComEnv(node.left) && ehAlvo(node.right)) reportar(node)
      },
      MemberExpression(node) {
        if (nomeDaPropriedade(node) === 'env' && ehAlvo(node.object)) reportar(node)
      },
    }
  },
}

const ENDERECO_FIXO = /\blocalhost\b|\b127\.0\.0\.1\b|\b0\.0\.0\.0\b|(^|[^\w])\/tmp\//i

const semEnderecoFixo = {
  meta: {
    type: 'problem',
    docs: { description: 'G11: endereço fixo (host local ou /tmp) só em config/' },
    schema: [],
    messages: {
      fixo: '[G11] endereço fixo "{{trecho}}" fora de config/: cada cópia tem o seu; leia de api/src/config/ (ou web/src/config/).',
    },
  },
  create(context) {
    function conferir(node, texto) {
      if (typeof texto === 'string' && ENDERECO_FIXO.test(texto)) {
        context.report({ node, messageId: 'fixo', data: { trecho: texto.slice(0, 60) } })
      }
    }
    return {
      Literal(node) {
        conferir(node, node.value)
      },
      TemplateElement(node) {
        conferir(node, node.value.cooked)
      },
      JSXText(node) {
        conferir(node, node.value)
      },
    }
  },
}

export default {
  meta: { name: 'eslint-plugin-balcao' },
  rules: {
    'env-so-em-config': envSoEmConfig,
    'sem-endereco-fixo': semEnderecoFixo,
  },
}
