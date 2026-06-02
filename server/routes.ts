import express from 'express'
import { addWatchlist, getAnalytics, getCoin, getCoinKlines, getDebug, getEarlyPumpAnalysis, getMissedOpportunities, getPersistentSignalHistory, getPortfolio, getScanResponse, getScannerSettings, getSignalHistory, getTelegramLogs, getTwentyPercentRadar, getWatchlist, logTelegramTest, removePosition, removeWatchlist, updateScannerSettings, upsertPosition } from './scheduler.js'
import { getTelegramSettings, testTelegramAlert, updateTelegramSettings } from './alert.js'
import { createSessionToken, credentialsAreValid, requireAuth } from './auth.js'

const router = express.Router()

router.post('/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  if (!credentialsAreValid(email, password)) {
    res.status(401).json({ error: 'Email atau password salah.' })
    return
  }
  res.json({ token: createSessionToken(email), email })
})

router.use(requireAuth)

router.get('/auth/session', (_req, res) => {
  res.json({ authenticated: true })
})

router.get('/scan', (_req, res) => {
  res.json(getScanResponse())
})

router.get('/status', (_req, res) => {
  const scan = getScanResponse()
  res.status(scan.status === 'ERROR' ? 503 : 200).json({
    status: scan.status,
    lastUpdated: scan.lastUpdated,
    restConnected: scan.restConnected,
    websocketConnected: scan.websocketConnected,
    error: scan.error
  })
})

router.get('/coins/:symbol', async (req, res) => {
  const ticker = await getCoin(req.params.symbol)
  if (!ticker) {
    res.status(404).json({ error: 'Pair USDT tidak ditemukan atau data Binance gagal diambil.' })
    return
  }
  const scan = getScanResponse()
  res.json({ ticker, history: getSignalHistory(req.params.symbol), idrRate: scan.idrRate, idrRateUpdatedAt: scan.idrRateUpdatedAt, idrRateSource: scan.idrRateSource })
})

router.get('/coins/:symbol/klines', async (req, res) => {
  try {
    const interval = String(req.query.interval || '1h')
    const limit = Number(req.query.limit || 200)
    res.json({ symbol: req.params.symbol.toUpperCase(), interval, candles: await getCoinKlines(req.params.symbol, interval, limit) })
  } catch (error) {
    res.status(400).json({ error: (error as Error).message })
  }
})

router.get('/watchlist', (_req, res) => {
  res.json({ symbols: getWatchlist() })
})

router.post('/watchlist', (req, res) => {
  const symbol = String(req.body.symbol || '').trim()
  if (!symbol) {
    res.status(400).json({ error: 'Symbol wajib diisi.' })
    return
  }
  addWatchlist(symbol)
  res.json({ symbols: getWatchlist() })
})

router.delete('/watchlist/:symbol', (req, res) => {
  removeWatchlist(req.params.symbol)
  res.json({ symbols: getWatchlist() })
})

router.get('/telegram/settings', (_req, res) => {
  res.json(getTelegramSettings())
})

router.put('/telegram/settings', (req, res) => {
  res.json(updateTelegramSettings(req.body))
})

router.post('/telegram/test', async (_req, res) => {
  try {
    const result = await testTelegramAlert()
    logTelegramTest('SENT', result.response)
    res.json(result)
  } catch (error) {
    const message = (error as Error).message
    logTelegramTest('FAILED', message)
    res.status(500).json({ success: false, error: message })
  }
})

router.get('/signal-history', (_req, res) => res.json({ records: getPersistentSignalHistory() }))
router.get('/telegram/logs', (_req, res) => res.json({ records: getTelegramLogs() }))
router.get('/debug', (_req, res) => res.json(getDebug()))
router.get('/missed-opportunities', (_req, res) => res.json({ records: getMissedOpportunities() }))
router.get('/early-pump-analysis', (_req, res) => res.json({ records: getEarlyPumpAnalysis() }))
router.get('/analytics', (_req, res) => res.json(getAnalytics()))
router.get('/twenty-percent-radar', async (_req, res) => res.json(await getTwentyPercentRadar()))
router.get('/portfolio', async (_req, res) => res.json({ records: await getPortfolio() }))
router.post('/portfolio', (req, res) => {
  try {
    res.json(upsertPosition(req.body))
  } catch (error) {
    res.status(400).json({ error: (error as Error).message })
  }
})
router.delete('/portfolio/:symbol', (req, res) => {
  removePosition(req.params.symbol)
  res.json({ success: true })
})
router.get('/scanner/settings', (_req, res) => res.json(getScannerSettings()))
router.put('/scanner/settings', (req, res) => res.json(updateScannerSettings(req.body)))

export default router
