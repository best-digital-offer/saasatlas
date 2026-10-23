export type BidRuleConfig = { minimumInitialBid: number; minimumIncrement: number }
export type StandingBid = { productId: string; amount: number; acceptedAt: string }

export function minimumToOvertake(highestCompetitorBid: number | null, rules: BidRuleConfig) {
  return highestCompetitorBid === null
    ? rules.minimumInitialBid
    : Math.max(rules.minimumInitialBid, highestCompetitorBid + rules.minimumIncrement)
}

export function reservationChange(currentStandingBid: number, nextStandingBid: number) {
  const difference = nextStandingBid - currentStandingBid
  return { reserve: Math.max(difference, 0), release: Math.max(-difference, 0) }
}

export function validateStandingBid(
  nextAmount: number,
  currentAmount: number,
  highestCompetitorBid: number | null,
  rules: BidRuleConfig,
) {
  if (!Number.isSafeInteger(nextAmount) || nextAmount <= 0) return 'Enter a whole number of credits.'
  if (nextAmount < rules.minimumInitialBid) return `The minimum standing bid is ${rules.minimumInitialBid} credits.`
  if (highestCompetitorBid !== null && nextAmount > highestCompetitorBid &&
    nextAmount < highestCompetitorBid + rules.minimumIncrement) {
    return `Bid at least ${highestCompetitorBid + rules.minimumIncrement} credits to take the lead.`
  }
  if (currentAmount > 0 && nextAmount === currentAmount) return 'Your listing already has this standing bid.'
  return null
}

export function orderStandingBids<T extends StandingBid>(bids: T[]) {
  return [...bids].sort((a, b) =>
    b.amount - a.amount ||
    Date.parse(a.acceptedAt) - Date.parse(b.acceptedAt) ||
    a.productId.localeCompare(b.productId),
  )
}
