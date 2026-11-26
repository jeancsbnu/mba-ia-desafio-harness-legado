// Modo da IA: fake por padrão (palavras-chave, sem chave nenhuma).
// Só AI_MODE=openai liga o cliente real.
export const aiConfig = {
  mode: process.env.AI_MODE === 'openai' ? ('openai' as const) : ('fake' as const),
  openaiApiKey: process.env.OPENAI_API_KEY,
}
