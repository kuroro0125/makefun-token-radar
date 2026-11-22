[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kuroro0125/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kuroro0125/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

A radar for protocols that have not issued a token yet — ranked by what a
launch could be worth, with a concrete farm plan for every row.

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama
snapshot, prices every plausible pre-token protocol with the model in
`lib/model.ts`, and writes:

- `board.json` — the ranked board (slug, name, rank, implied value, farm steps)
- `data.js` — the same board with full detail for the dashboard
- `dashboard/` — a static page: the board, a filterable/sortable table, and a
  detail view per protocol showing exactly how its price was built
- `screenshots/` — three renders of the page (board, detail, filtered)
- `dossier.json` — the judge's summary, built with `vendor/makefun-board.ts`

## The model

Protocols whose token already trades set the rate: per category, the median
market-cap-to-TVL ratio of its tokenised members. A pre-token protocol is
priced at its TVL × its category rate, adjusted for its seven-day TVL growth,
how long it has run with no token, and how many chains it operates on.

The ranked universe is plausible launches only. Wrapped, staked and bridged
products of tokens that already trade, canonical bridges, exchange entries
and superseded old versions are set aside before ranking — the same line the
snapshot's own watchlist draws, applied at every TVL.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Then open `out/dashboard/index.html` — it reads `out/data.js` and runs
entirely from local files.

## License

MIT
