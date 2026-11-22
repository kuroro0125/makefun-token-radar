// Token launch radar: the value model.
//
// The snapshot carries no ranking and no implied value, so this file derives
// both from the snapshot's own figures. The idea: protocols whose token
// already trades tell us what the market pays for a dollar of TVL in each
// category. A protocol that records no token is then valued as if it issued
// one at that category rate, adjusted for the three signals the snapshot
// gives about it alone: its seven-day TVL growth, how long it has run with
// no token, and how many chains it operates on.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RowDetail extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  category_ratio: number;
  growth_factor: number;
  age_factor: number;
  chain_factor: number;
  years_listed: number | null;
}

export interface Board {
  rows: RowDetail[];
  scanned: number;
  candidates: number;
  tokenized: number;
  set_aside: number;
  watchlist_count: number;
  as_of: string;
  floor_usd: number;
}

const DAY_MS = 86_400_000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// What the market pays for one TVL dollar, learned from the protocols in the
// snapshot whose token already trades. Ratios are clamped before the median
// so a handful of absurd prints (a near-dead token on a large TVL, or the
// reverse) cannot drag a whole category with them.
export function categoryRatios(snapshot: Snapshot): Map<string, number> {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, 0.01, 4);
    all.push(ratio);
    const key = p.category ?? "(uncategorised)";
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const globalMedian = median(all);
  const ratios = new Map<string, number>();
  for (const [key, list] of byCategory) {
    // A category with fewer than three trading tokens borrows the global
    // median: one or two prints are an anecdote, not a rate.
    ratios.set(key, list.length >= 3 ? median(list) : globalMedian);
  }
  ratios.set("(global)", globalMedian);
  return ratios;
}

export function yearsListed(p: Protocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const start = Date.parse(p.listed_at + "T00:00:00Z");
  const end = Date.parse(asOf + "T00:00:00Z");
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return (end - start) / (365.25 * DAY_MS);
}

// Seven-day TVL growth, in per cent in the snapshot. A protocol adding TVL
// quickly is gathering the users a launch would reward; one bleeding TVL is
// a worse bet at the same size. The factor is deliberately gentle and capped
// both ways, because one week is a signal, not a verdict.
export function growthFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  return clamp(1 + 2.2 * (change7d / 100), 0.6, 1.6);
}

// The longer a protocol has operated with no token, the more of its record a
// launch price can rest on, and the larger the user base that farmed it in
// the meantime. New listings get a discount, not a zero: some are spin-outs
// of teams with a record elsewhere that the snapshot cannot see.
export function ageFactor(years: number | null): number {
  if (years === null) return 0.9;
  return 0.75 + 0.45 * (1 - Math.exp(-years / 1.5));
}

// Each extra chain is another community that would receive and trade a
// token, and another integration surface. A small bonus, capped at five.
export function chainFactor(chainCount: number): number {
  return 1 + 0.04 * Math.min(Math.max(chainCount - 1, 0), 5);
}

export function impliedValue(
  p: Protocol,
  ratios: Map<string, number>,
  asOf: string,
): { value: number; ratio: number; growth: number; age: number; chain: number; years: number | null } {
  const ratio = ratios.get(p.category ?? "(uncategorised)") ?? ratios.get("(global)")!;
  const years = yearsListed(p, asOf);
  const growth = growthFactor(p.change_7d);
  const age = ageFactor(years);
  const chain = chainFactor(p.chains.length);
  const value = Math.max(1, Math.round(p.tvl_usd * ratio * growth * age * chain));
  return { value, ratio, growth, age, chain, years };
}

// --- Farm plans -----------------------------------------------------------
// Every row carries a plan a reader can act on: what to do in the product,
// what it costs, and how long to keep it up. The steps are written per
// category because farming a lending market and farming a bridge are
// different work, and each step is filled with the protocol's own figures
// (its name, its main chain, its TVL) so it reads as a plan for this
// protocol, not a slogan pasted 600 times.

const GAS_GUIDE: Record<string, string> = {
  Ethereum: "budget $25-60 a month for mainnet gas and prefer weekends, when fees dip",
  Arbitrum: "budget $3-8 a month for gas on Arbitrum",
  Base: "budget $2-6 a month for gas on Base",
  Solana: "budget under $1 a month for fees on Solana",
  BNBChain: "budget $2-5 a month for gas on BNB Chain",
  Polygon: "budget $1-4 a month for gas on Polygon",
  Avalanche: "budget $2-6 a month for gas on Avalanche",
  Optimism: "budget $2-6 a month for gas on Optimism",
};

function gasLine(p: Protocol): string {
  const main = p.chains[0] ?? "Ethereum";
  const guide = GAS_GUIDE[main] ?? `budget $3-10 a month for gas on ${main}`;
  return `Work on ${main}, its deepest chain: ${guide}.`;
}

function sizeLine(p: Protocol): string {
  const tvl = Math.round(p.tvl_usd);
  const share = Math.max(50, Math.round(tvl * 0.0002));
  return `Size the position like a user, not a whale: roughly $${share.toLocaleString("en-US")} at most (about 0.02% of its $${tvl.toLocaleString("en-US")} TVL), split across two wallets at most so the activity reads as real usage.`;
}

function cadenceLine(p: Protocol): string {
  const growth = p.change_7d === null
    ? "its TVL trend is unreported this week, so judge it on the monthly picture"
    : `its TVL moved ${p.change_7d >= 0 ? "+" : ""}${p.change_7d.toFixed(1)}% in the last seven days`;
  return `Keep the routine up for at least 8-12 weeks: interact every week, not in one burst, and re-check this board monthly — ${growth}, and a launch usually rewards the wallets that were there before the crowd.`;
}

const CATEGORY_ACTIONS: Record<string, string[]> = {
  Lending: [
    "Supply a blue-chip collateral asset (ETH or a major stablecoin) and leave it supplied; supplied balances are the balance a points or launch snapshot almost always counts first.",
    "Borrow a modest amount against the supply — under 40% loan-to-value so a bad week cannot liquidate you — hold the borrow for a few days, then repay; both sides of the market are usually measured.",
  ],
  Dexs: [
    "Provide liquidity in one core pair (a stablecoin pair if you want low impermanent loss) and keep it in range; liquidity depth is the contribution a DEX can measure exactly.",
    "Make a few genuine swaps a week through the interface rather than an aggregator, in sizes you would trade anyway; consistent weekly volume over months reads better than one large day.",
  ],
  "Liquid Staking": [
    "Stake a modest amount of the chain's native asset through the protocol and hold the liquid staking token it issues; time held is the metric that matters here.",
    "Put part of the staking token to work in one integrated market (a lending market or a DEX pair) so the protocol's integrations register your wallet too.",
  ],
  Bridge: [
    "Bridge funds across two of its supported chains in both directions over several weeks, in ordinary amounts ($100-500); route diversity and repeat crossings are what a bridge can count.",
    "Leave a small balance resting on the far chain for a few days each trip instead of bridging straight back; instant round-trips are the pattern sybil filters look for.",
  ],
  Yield: [
    "Deposit into one flagship vault and leave the deposit untouched; vault share balance over time is the record a launch would snapshot.",
    "Claim and re-deposit rewards weekly rather than selling them, so your share of the vault keeps compounding and the wallet history shows a holder, not a passer-by.",
  ],
  RWA: [
    "Complete the onboarding and identity checks early, before any launch rush; verified accounts are a small, countable set and onboarding queues close fast when a token is rumoured.",
    "Hold one of its real-world-asset positions for a full quarter; RWA yields accrue slowly, and the holder register is the distribution list if a token ever maps to it.",
  ],
  Derivatives: [
    "Trade small, hedged positions on a regular weekly cadence rather than directional punts; open interest and fee history are the metrics a derivatives launch can reward.",
    "Keep margin posted between trades so the account shows standing usage, and avoid wash patterns — matched self-trades are the first thing filtered out.",
  ],
  "Risk Curators": [
    "Allocate to one curated vault and keep the allocation through a full market cycle; curator vaults count sustained deposits, and assets under curation are their growth story.",
    "Split a second, smaller allocation across a second vault of the same curator to register breadth, and rebalance only when the curator does.",
  ],
};

const GENERIC_ACTIONS: string[] = [
  "Use the protocol's core product the way it is meant to be used, in modest size, on a weekly cadence; first-party usage history is the one record every launch snapshot shares.",
  "Hold whatever position, share or receipt token the product issues for at least a full quarter; holding time separates farmers a launch wants from drive-by wallets.",
];

export function farmSteps(p: Protocol): string[] {
  const actions = CATEGORY_ACTIONS[p.category ?? ""] ?? GENERIC_ACTIONS;
  const steps = [
    `Open ${p.name} on ${p.chains[0] ?? "its main chain"} and make a first real deposit or trade this week; a wallet with no history before a launch announcement earns nothing from it.`,
    ...actions,
    sizeLine(p),
    gasLine(p),
    cadenceLine(p),
  ];
  return steps.slice(0, 6);
}

// --- The candidate universe ----------------------------------------------
// "Records no token" is not enough. The snapshot also lists wrapped, staked
// and bridged products of tokens that already trade (a wrapped bitcoin is a
// claim on bitcoin, not a future launch), the canonical bridges and exchange
// entries of trading venues, and old versions of protocols whose current
// version is the real candidate. The snapshot's own watchlist rule draws
// exactly this line; the board applies the same structural test at every
// TVL, so the ranking is a ranking of plausible launches only. The test
// reads fields and name shapes, never a list of names to exclude.

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini",
];

export function recordsNoToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isCandidate(p: Protocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (/\s(V2|v2|2\.0|V3|v3)$/.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

// --- Board ----------------------------------------------------------------

export function buildBoard(snapshot: Snapshot): Board {
  const ratios = categoryRatios(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isCandidate);
  const tokenized = snapshot.protocols.filter((p) => !recordsNoToken(p)).length;
  const details: RowDetail[] = candidates.map((p) => {
    const v = impliedValue(p, ratios, snapshot.as_of);
    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: v.value,
      farm_steps: farmSteps(p),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      on_watchlist: watchlist.has(p.slug),
      category_ratio: v.ratio,
      growth_factor: v.growth,
      age_factor: v.age,
      chain_factor: v.chain,
      years_listed: v.years,
    };
  });
  details.sort((a, b) =>
    b.implied_value_usd - a.implied_value_usd ||
    b.tvl_usd - a.tvl_usd ||
    (a.slug < b.slug ? -1 : 1),
  );
  details.forEach((row, i) => {
    row.rank = i + 1;
  });
  return {
    rows: details,
    scanned: snapshot.protocols.length,
    candidates: candidates.length,
    tokenized,
    set_aside: snapshot.protocols.length - tokenized - candidates.length,
    watchlist_count: snapshot.watchlist.length,
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
  };
}
