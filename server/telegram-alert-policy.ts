import { MarketTicker } from './models.js'

export const meetsStrongBuyTelegramPolicy = (ticker: Pick<MarketTicker, 'signal' | 'isOverheated' | 'pumpProjection'>) =>
  ticker.signal === 'STRONG BUY' &&
  !ticker.isOverheated &&
  ticker.pumpProjection.confidence === 'HIGH' &&
  ticker.pumpProjection.action !== 'AVOID' &&
  ticker.pumpProjection.riskRewardToTp1 !== null &&
  ticker.pumpProjection.riskRewardToTp1 >= 1.5
