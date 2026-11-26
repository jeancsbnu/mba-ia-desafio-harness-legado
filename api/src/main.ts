import { app } from './http/app'
import { httpConfig } from './config/http'

app.listen(httpConfig.port, () => {
  console.log(`API rodando na porta ${httpConfig.port}`)
})
