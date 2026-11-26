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
    const { sourceCode } = context
    // variáveis do arquivo que apontam para `process`: import de 'process' ou alias
    const aliases = new Set()

    function variavelDe(identificador) {
      for (let escopo = sourceCode.getScope(identificador); escopo; escopo = escopo.upper) {
        const variavel = escopo.set.get(identificador.name)
        if (variavel) return variavel
      }
      return null
    }

    function marcarAlias(node) {
      for (const variavel of sourceCode.getDeclaredVariables(node)) aliases.add(variavel)
    }

    function ehAlvo(node) {
      const n = semEmbrulho(node)
      if (!n) return false
      if (n.type === 'Identifier') {
        const variavel = variavelDe(n)
        // sem declaração no arquivo: é o `process` global do Node
        if (!variavel || variavel.defs.length === 0) return n.name === 'process'
        // declarado no arquivo: só conta se veio de 'process'. Um parâmetro que
        // se chama `process` é outra coisa e não é acusado.
        return aliases.has(variavel)
      }
      if (n.type === 'MetaProperty') return n.meta.name === 'import' && n.property.name === 'meta'
      if (n.type === 'MemberExpression') {
        const obj = semEmbrulho(n.object)
        return nomeDaPropriedade(n) === 'process' && obj.type === 'Identifier' && OBJETOS_GLOBAIS.has(obj.name)
      }
      return ehRequireDeProcess(n)
    }

    function reportar(node) {
      context.report({ node, messageId: 'env', data: { acesso: sourceCode.getText(node).slice(0, 60) } })
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
            if (importado === 'default') marcarAlias(s)
          } else {
            marcarAlias(s)
          }
        }
      },
      VariableDeclarator(node) {
        if (!node.init) return
        if (node.id.type === 'Identifier' && ehAlvo(node.init)) marcarAlias(node)
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
      fixoEmTeste:
        '[G11] endereço fixo "{{trecho}}" num teste: duas cópias rodam os testes ao mesmo tempo. Pasta: crie com mkdtemp(join(tmpdir(), "balcao-")); URL: leia de config/.',
    },
  },
  create(context) {
    // Teste também é acusado, de propósito: um teste com pasta em /tmp ou URL
    // fixa colide com o teste da outra cópia. A mensagem diz como fazer.
    const ehTeste = /\.test\.[cm]?[jt]sx?$/.test(context.filename)
    function conferir(node, texto) {
      if (typeof texto === 'string' && ENDERECO_FIXO.test(texto)) {
        context.report({ node, messageId: ehTeste ? 'fixoEmTeste' : 'fixo', data: { trecho: texto.slice(0, 60) } })
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
