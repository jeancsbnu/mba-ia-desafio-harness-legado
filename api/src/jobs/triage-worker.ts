import { workerConfig } from '../config/worker'
import { classifyTicket } from '../integrations/ai-client'
import { ticketRepository } from '../repositories/ticket-repository'
import { TriageService } from '../services/triage-service'

// Processo separado da API: a cada intervalo, tria os chamados pendentes.
const triage = new TriageService(ticketRepository, classifyTicket)
const interval = workerConfig.triageIntervalMs

async function loop() {
  try {
    await triage.runOnce()
  } catch (err) {
    console.log('erro no worker', err)
  }
  setTimeout(loop, interval)
}

console.log(`worker de triagem rodando a cada ${interval}ms`)
loop()
