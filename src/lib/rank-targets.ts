export const rankTargetCredits = Array.from({ length: 10 }, (_, index) => ({
  rank: index + 1,
  credits: 1770 - index * 180,
}))

export type RankedBid = { currentRank: number | null | undefined; credits: number }

export function suggestedBidForRank(rank: number, rankedBids: RankedBid[], minimumIncrement = 5) {
  const guide = rankTargetCredits.find((target) => target.rank === rank)?.credits ?? rankTargetCredits.at(-1)!.credits
  const cutoffBid = rankedBids.find((bid) => bid.currentRank === rank)?.credits
  return Math.max(guide, cutoffBid ? cutoffBid + minimumIncrement : 0)
}
