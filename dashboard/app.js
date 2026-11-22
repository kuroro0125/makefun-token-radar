// Token Launch Radar dashboard: board, filters and per-protocol detail.
// Data arrives as window.RADAR_DATA from ../data.js, written by main.ts from
// the same board the gate checks. Everything renders locally; no network.

const data = window.RADAR_DATA;
const rows = data.rows;
const bySlug = new Map(rows.map((r) => [r.slug, r]));

const els = {
  stats: document.getElementById("masthead-stats"),
  search: document.getElementById("search"),
  category: document.getElementById("filter-category"),
  chain: document.getElementById("filter-chain"),
  watchlist: document.getElementById("filter-watchlist"),
  sort: document.getElementById("sort"),
  count: document.getElementById("row-count"),
  body: document.getElementById("board-body"),
  empty: document.getElementById("empty-note"),
  boardView: document.getElementById("board-view"),
  detailView: document.getElementById("detail-view"),
  detailBody: document.getElementById("detail-body"),
  back: document.getElementById("back"),
};

function money(v) {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + Math.round(v).toLocaleString("en-US");
}

function pct(v) {
  if (v === null || v === undefined) return "—";
  const cls = v >= 0 ? "up" : "down";
  return `<span class="${cls}">${v >= 0 ? "+" : ""}${v.toFixed(1)}%</span>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderStats() {
  const stats = [
    [data.scanned, "protocols scanned"],
    [data.candidates, "pre-token candidates"],
    [data.watchlist_count, "on the watchlist"],
    [data.as_of, "snapshot date"],
  ];
  els.stats.innerHTML = stats
    .map(([v, label]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(label)}</span></div>`)
    .join("");
}

function fillFilters() {
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  els.category.innerHTML =
    `<option value="">All categories</option>` +
    cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  els.chain.innerHTML =
    `<option value="">All chains</option>` +
    chains.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
}

function visibleRows() {
  const q = els.search.value.trim().toLowerCase();
  const cat = els.category.value;
  const chain = els.chain.value;
  const watchOnly = els.watchlist.checked;
  let out = rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q) && !r.slug.includes(q)) return false;
    if (cat && r.category !== cat) return false;
    if (chain && !r.chains.includes(chain)) return false;
    if (watchOnly && !r.on_watchlist) return false;
    return true;
  });
  const sort = els.sort.value;
  if (sort === "tvl") out = [...out].sort((a, b) => b.tvl_usd - a.tvl_usd);
  else if (sort === "growth") out = [...out].sort((a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9));
  else if (sort === "age") out = [...out].sort((a, b) => (b.years_listed ?? -1) - (a.years_listed ?? -1));
  else out = [...out].sort((a, b) => a.rank - b.rank);
  return out;
}

function renderBoard() {
  const out = visibleRows();
  els.count.textContent = `${out.length} of ${rows.length} protocols`;
  els.empty.hidden = out.length > 0;
  els.body.innerHTML = out
    .map((r) => {
      const multiple = r.tvl_usd > 0 ? (r.implied_value_usd / r.tvl_usd).toFixed(2) + "×" : "—";
      const badge = r.on_watchlist ? `<span class="badge">Watchlist</span>` : "";
      return `<tr data-slug="${esc(r.slug)}">
        <td class="num rank">${r.rank}</td>
        <td><span class="name">${esc(r.name)}</span>${badge}<span class="slug">${esc(r.slug)}</span></td>
        <td>${esc(r.category ?? "—")}</td>
        <td class="chains">${esc(r.chains.slice(0, 3).join(", "))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ""}</td>
        <td class="num">${money(r.tvl_usd)}</td>
        <td class="num">${pct(r.change_7d)}</td>
        <td class="num value">${money(r.implied_value_usd)}</td>
        <td class="num">${multiple}</td>
      </tr>`;
    })
    .join("");
  for (const tr of els.body.querySelectorAll("tr")) {
    tr.addEventListener("click", () => showDetail(tr.dataset.slug));
  }
}

function barRow(label, factor, max) {
  const width = Math.max(2, Math.min(100, (factor / max) * 100));
  return `<div class="bar-row"><span>${esc(label)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
    <span class="num">×${factor.toFixed(2)}</span></div>`;
}

function showDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) return;
  const years = r.years_listed === null ? "unreported" : r.years_listed.toFixed(1) + " years";
  const stats = [
    [money(r.implied_value_usd), "implied value"],
    ["#" + r.rank, "board rank"],
    [money(r.tvl_usd), "TVL"],
    [r.change_7d === null ? "—" : (r.change_7d >= 0 ? "+" : "") + r.change_7d.toFixed(1) + "%", "TVL, 7 days"],
    [years, "tracked, no token"],
    [r.on_watchlist ? "Yes" : "Below the floor", "watchlist"],
  ];
  els.detailBody.innerHTML = `
    <div class="detail-card">
      <h2>${esc(r.name)}${r.on_watchlist ? `<span class="badge">Watchlist</span>` : ""}</h2>
      <p class="detail-sub">${esc(r.category ?? "Uncategorised")} · ${esc(r.chains.join(", "))} · records no token in the snapshot</p>
      <div class="detail-grid">
        ${stats.map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}
      </div>
      <div class="model-bars">
        <h3>How this price is built</h3>
        ${barRow("Category rate (per TVL $)", r.category_ratio, 1.6)}
        ${barRow("Growth adjustment", r.growth_factor, 1.6)}
        ${barRow("Track-record adjustment", r.age_factor, 1.6)}
        ${barRow("Chain adjustment", r.chain_factor, 1.6)}
        <p class="detail-sub">TVL × category rate × the three adjustments = the implied value above. The category rate is the median market-cap-to-TVL of ${esc(r.category ?? "its category")}'s tokenised protocols in this snapshot.</p>
      </div>
      <div class="farm">
        <h3>The farm plan</h3>
        <ol>${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      </div>
    </div>`;
  els.boardView.hidden = true;
  els.detailView.hidden = false;
  window.scrollTo(0, 0);
}

function showBoard() {
  els.detailView.hidden = true;
  els.boardView.hidden = false;
}

for (const el of [els.search, els.category, els.chain, els.watchlist, els.sort]) {
  el.addEventListener("input", renderBoard);
  el.addEventListener("change", renderBoard);
}
els.back.addEventListener("click", showBoard);

renderStats();
fillFilters();

// Screenshot and deep-link support: ?cat=Lending, ?watchlist=1, ?q=eth,
// ?view=detail&slug=<slug> open the page in a composed state.
const params = new URLSearchParams(location.search);
if (params.get("cat")) els.category.value = params.get("cat");
if (params.get("chain")) els.chain.value = params.get("chain");
if (params.get("watchlist") === "1") els.watchlist.checked = true;
if (params.get("q")) els.search.value = params.get("q");
if (params.get("sort")) els.sort.value = params.get("sort");
renderBoard();
if (params.get("view") === "detail" && params.get("slug")) showDetail(params.get("slug"));
