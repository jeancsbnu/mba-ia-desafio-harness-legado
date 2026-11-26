// Endereço da API desta cópia. `npm run up` grava VITE_API_URL em web/.env.local;
// o padrão reproduz o Balcão de sempre (API na porta 4000).
export const API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:4000'
