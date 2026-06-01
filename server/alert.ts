import axios from 'axios'
import dotenv from 'dotenv'
import { TelegramSettings } from './models.js'

dotenv.config()

const normalizeChatId = (value: string) => {
  const trimmed = value.trim()
  const trailingId = trimmed.match(/(-?\d+)$/)?.[1]
  return trailingId || trimmed
}

const normalizeToken = (value: string) => value.trim()
const isValidChatId = (value: string) => /^-?\d+$/.test(value)
const isValidToken = (value: string) => /^\d+:[A-Za-z0-9_-]+$/.test(value)

let settings: TelegramSettings = {
  botToken: normalizeToken(process.env.TELEGRAM_BOT_TOKEN || ''),
  chatId: normalizeChatId(process.env.TELEGRAM_CHAT_ID || ''),
  enabled: process.env.TELEGRAM_ALERT_ENABLED === 'true'
}

export const getTelegramSettings = () => ({
  chatId: settings.chatId,
  enabled: settings.enabled,
  hasBotToken: Boolean(settings.botToken && !settings.botToken.startsWith('your-'))
})

export const updateTelegramSettings = (next: Partial<TelegramSettings>) => {
  const nextToken = typeof next.botToken === 'string' && next.botToken ? normalizeToken(next.botToken) : settings.botToken
  const nextChatId = typeof next.chatId === 'string' ? normalizeChatId(next.chatId) : settings.chatId
  if (nextToken && !nextToken.startsWith('your-') && !isValidToken(nextToken)) {
    throw new Error('Format Telegram Bot Token tidak valid. Gunakan token dari BotFather.')
  }
  if (nextChatId && !nextChatId.startsWith('your-') && !isValidChatId(nextChatId)) {
    throw new Error('Format Telegram Chat ID tidak valid. Chat ID hanya boleh berisi angka.')
  }
  settings = {
    botToken: nextToken,
    chatId: nextChatId,
    enabled: typeof next.enabled === 'boolean' ? next.enabled : settings.enabled
  }
  return getTelegramSettings()
}

export const sendTelegramAlert = async (message: string, automatic = false) => {
  if (automatic && !settings.enabled) throw new Error('Telegram alert dinonaktifkan.')
  if (!isValidToken(settings.botToken) || !isValidChatId(settings.chatId)) {
    throw new Error('Telegram bot token atau chat ID belum dikonfigurasi.')
  }
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await axios.post(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
        chat_id: settings.chatId,
        text: message
      }, { timeout: 10000 })
      return `Telegram sent on attempt ${attempt}: message_id=${response.data?.result?.message_id || 'unknown'}`
    } catch (error) {
      lastError = error
    }
  }
  const telegramDescription = axios.isAxiosError(lastError) ? lastError.response?.data?.description : null
  throw new Error(`Telegram gagal setelah 3 percobaan: ${telegramDescription || (lastError as Error)?.message || 'unknown error'}`)
}

export const testTelegramAlert = async () => {
  const response = await sendTelegramAlert('Crypto Signal Compass terhubung.\n\nPesan tes Telegram berhasil dikirim.\n\nDisclaimer: Bukan nasihat finansial.')
  return { success: true, response }
}
