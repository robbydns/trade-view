import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import router from './routes.js'
import { initializeScheduler } from './scheduler.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(cors())
app.use(express.json())
app.use('/api', router)

app.get('/', (req, res) => {
  res.json({ status: 'Crypto Signal Compass backend aktif', source: 'Binance real-time only' })
})

const startServer = async () => {
  app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`)
  })
  initializeScheduler().catch((error) => {
    console.error('Failed to initialize scheduler:', error)
  })
}

startServer()

