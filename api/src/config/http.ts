// Configuração do servidor HTTP. Os padrões reproduzem o Balcão de sempre
// (porta 4000, front em 5173); `npm run up` define os valores de cada cópia.
export const httpConfig = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
}
