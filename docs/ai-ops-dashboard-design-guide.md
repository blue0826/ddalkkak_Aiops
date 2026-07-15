# AI Ops Dashboard — UI/UX Design Reference & Implementation Guide

**Audience:** an AI coding agent (Claude Code / Codex / Cursor / Gemini) tasked with redesigning or building an AI Ops dashboard.
**Status:** design brief + implementation spec. Read fully before writing code.

---

## ⚠️ READ THIS FIRST — mandatory directives

**1. This is a REFACTOR of existing code, not a greenfield build.** Your job is to find what is wrong in the current UI and change it. Producing new files is not the goal; changing the existing screens is.

**2. Swapping the font and stopping is a FAILURE.** The font is item #1 of ~40. It is the single easiest change and the most common way a weaker agent "completes" this task while changing nothing else. If your diff touches only typography, you have not done the task. You must work through the audit in §0.1 and fix every category.

**3. You almost certainly CANNOT open the reference URLs in §9–§10, and that is fine.** They are for the human, and for you *only if* you have browsing or repo-clone access. **Every rule you need to apply is written inline in this document as concrete values and code.** Never skip a rule because you can't reach the site that inspired it — the rule itself is right here. "Study Langfuse" is shorthand for the span-waterfall spec in §7.2, which is fully specified below.

**4. Method is audit → diff, not "apply vibes."** For every violation you find, output: `file:line → what's wrong → the fix`. Then make the change. Do not summarize principles back to the human; produce edits.

**5. Report with evidence.** When you finish, fill in the §11 checklist with `file:line` proof for each box — not bare checkmarks. Any box you cannot check, state why.

---

## 0.1. Audit — run these first to find violations mechanically

You do not need to browse anything to find the problems. Grep the codebase. Each pattern below locates a class of violation; the linked section says how to fix it. Run them, paste the hits, fix each hit.

```bash
# Raw hex colors that should be tokens (§4.3)
rg -n '#[0-9a-fA-F]{3,8}\b' src/ --type css --type ts --type tsx

# Count DISTINCT colors actually used — should be tiny (§4.3 budget)
rg -oiN '#[0-9a-fA-F]{6}' src/ | sort -u | wc -l   # >~15 unique = too many

# Box-shadow used for elevation — wrong in dark mode, use border+bg lift (§4.4)
rg -n 'box-?[Ss]hadow|shadow-(sm|md|lg|xl)' src/

# Charts rendering a dot on every point — must be dot={false} (§6.1)
rg -n '<Line|<Area' src/ -A6 | rg -n 'dot=' ; echo '^ any dot not ={false} is a violation'

# Legends that should be direct labels when ≤2 series (§6.1)
rg -n '<Legend' src/

# Chart animation left on — distracting on refreshing data (§6.1)
rg -n 'isAnimationActive' src/    # absent or ={true} on ops charts = violation

# Pie/Donut — check segment count ≤4 or replace with bar list (§6.3)
rg -n '<Pie|PieChart|DonutChart' src/

# Dual axis — almost always misleading (§6.3)
rg -n 'yAxisId|orientation="right"' src/

# Arbitrary spacing not on the 4px scale (§4.2)
rg -n 'padding|margin|gap' src/ --type css | rg -nP '\b(1[013579]|2[13579]|[3-9]?[13579])px'

# Numbers without tabular-nums — they jitter on refresh (§4.1)
rg -n 'tabular-nums|variant-numeric|tnum' src/    # near-zero hits = you haven't applied it

# Missing states — grep for loading/empty/error handling (§8)
rg -n 'isLoading|isPending|isError|empty|Skeleton|NoData' src/
```

If a grep returns nothing where it should return something (e.g. zero `tabular-nums` hits, zero `Skeleton` hits), that absence **is** the finding.

---

## 0. How to use this file

This is not inspiration. It is a **spec**. Treat every rule in §3–§9 as a constraint, and §11 as an acceptance test you must pass before declaring the work done.

If a rule here conflicts with an existing pattern in the codebase, **surface the conflict to the human instead of silently picking one.**

### Execution order (do not reorder)

| Step | Action | Why |
|---|---|---|
| 1 | Install fonts + apply the type/number rules (§4.1) | Biggest visual delta per unit of effort |
| 2 | Replace ad-hoc colors with a token layer (§4.3) | Everything downstream depends on tokens |
| 3 | Rebuild the layout skeleton (§5) | Structure before decoration |
| 4 | Strip every chart back to defaults-off, then re-enable only what's needed (§6) | Charts are where "amateur" shows first |
| 5 | Add loading / empty / error states (§8) | The fastest way a polished dashboard becomes cheap-looking |
| 6 | Run the acceptance checklist (§11) | — |

---

## 1. What is being built (disambiguate first)

"AI Ops" splits into two products with different reference sets. **Pick one and state your choice before designing.**

**A. AIOps / infrastructure observability** — metrics, logs, traces from services and infra.
→ Primary references: Grafana, Perses, Datadog, Honeycomb, Sentry.
→ Metric frameworks: RED, USE, Four Golden Signals (see §5.2).

**B. LLMOps / agent observability** — traces, spans, tokens, cost, evals for LLM and agent workloads.
→ Primary references: Langfuse, Arize Phoenix, Helicone, Braintrust, LangSmith, Datadog LLM Observability.
→ Core screen is not a "chart grid" — it is a **trace tree / span waterfall** plus a cost & quality overview.

Most of this document applies to both. Where it diverges, it is marked **[AIOps]** or **[LLMOps]**.

---

## 2. Root-cause diagnosis (why dashboards look amateur)

Almost all of it comes from these eight causes, in rough order of impact. Fix them in order.

1. **Default system font + proportional numerals.** Numbers jitter horizontally on every refresh.
2. **Everything wrapped in a card** with border + shadow + radius. The screen becomes visual noise with no hierarchy.
3. **Too many colors.** 8–12 hues on one screen. Color stops carrying meaning.
4. **No typographic hierarchy.** Every string is ~14px regular, so nothing reads first.
5. **Chart library defaults left on.** Gridlines, legends, axis lines, tooltips, gradients, dots — all enabled simultaneously.
6. **Arbitrary spacing.** 13px here, 17px there. No grid.
7. **No loading / empty / error states.** The product looks broken the moment data is missing.
8. **Violates the 5-second rule.** Opening the dashboard does not answer "is the system healthy right now?" within 5 seconds.

---

## 3. Stack decision

### 3.1 Component library — use Tremor

**Tremor** (`tremor.so`) is the default choice for dashboards.

- Acquired by Vercel; **all components AND all Blocks are now free under MIT**, including what used to be the paid Pro tier.
- 35+ components, 300+ blocks.
- Built on **React + Tailwind CSS + Radix UI**; charts are built on **Recharts**.
- Copy-paste distribution model (same as shadcn/ui) → source lands in your repo, fully customizable, no runtime lock-in.
- Ships dashboard-specific primitives that you would otherwise hand-roll badly: **KPI cards, sparklines, Tracker, BarList, delta badges**, plus loading / error / empty states and responsive breakpoints.

```bash
# Tremor is copy-paste; follow the install guide at tremor.so
# It composes with an existing shadcn/ui setup — same Tailwind + Radix foundation.
```

**Companions:**
- `ui.shadcn.com/charts` and `ui.shadcn.com/blocks` — if the project already uses shadcn/ui, start here and pull Tremor blocks in alongside.
- `vercel.com/geist` — Vercel's design system. Steal the **token values** (color scales, spacing, radius, elevation) even if you don't use the components.

### 3.2 Chart library

| Library | Use when |
|---|---|
| **Recharts** | Default. Already under Tremor + shadcn charts. Good enough for 95% of ops charts. |
| **ECharts** | Large datasets (>10k points), heatmaps, complex composites. |
| **uPlot** | Real-time, high-frequency streaming, thousands of series. Fastest option. |
| **visx** | Fully custom viz (flame graphs, span waterfalls, force graphs). Low-level, D3-based. |

**[LLMOps]** A span waterfall / trace tree is usually **not** a chart-library job — build it as DOM elements (nested flex rows with absolutely positioned bars). Easier to make interactive, accessible, and virtualized.

---

## 4. Design tokens

Define these once, as CSS variables, and never write a raw hex or px value in a component again.

### 4.1 Typography — highest-impact fix

**Fonts**

| Role | Font | Note |
|---|---|---|
| UI / Latin | Inter or Geist Sans | — |
| UI / Korean | **Pretendard** (Pretendard Variable) | Non-negotiable for Korean UI. The single biggest instant upgrade. |
| Mono | JetBrains Mono, Geist Mono, or IBM Plex Mono | IDs, trace IDs, model names, latencies, code, JSON |

**Numbers — mandatory**

```css
/* Apply to EVERY numeric value: KPI cards, table cells, axis ticks, tooltips, badges */
.num, td[data-numeric], .kpi-value, .recharts-cartesian-axis-tick-value {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
```

Without `tabular-nums`, live-updating numbers shake horizontally on every poll. This single line separates "looks like a product" from "looks like a school project."

**Type scale** (only these steps exist)

| Token | Size / Weight / Tracking | Use |
|---|---|---|
| `--text-kpi` | 32–36px / 600 / -0.02em / tabular | The one number per card |
| `--text-h1` | 20px / 600 | Page title |
| `--text-h2` | 15–16px / 600 | Section / card title |
| `--text-body` | 13–14px / 400 | Table cells, descriptions |
| `--text-label` | 12px / 500 / muted | Card labels, axis ticks, metadata |
| `--text-micro` | 11px / 500 / 0.04em uppercase | Eyebrows, badges, column headers |

Rule: if the KPI number and its label are within 2 steps of each other, the hierarchy has failed.

### 4.2 Spacing

4px base. **Only** these values: `4, 8, 12, 16, 24, 32, 48, 64`.
In Tailwind: `gap-1 gap-2 gap-3 gap-4 gap-6 gap-8 gap-12 gap-16`. Nothing else.

- Card padding: 16px (dense) or 20px (comfortable). Pick one for the whole app.
- Grid gutter between cards: 16px.
- Section vertical rhythm: 24px.
- Table row height: 32–36px. **Ops tools are allowed to be dense** — do not pad like a marketing site.

### 4.3 Color

**Source of truth: Radix Colors** (`radix-ui.com/colors`). Twelve-step scales with pre-validated light/dark pairs and accessible contrast at known steps. Stop hand-picking hexes.

**Palette budget — hard limit**

```
Neutral ramp   : 1 scale  (slate / gray / zinc)  — 90% of the UI
Brand accent   : 1 hue    — links, primary action, active nav, selected state
Status colors  : 3 hues   — RESERVED, semantic only (see below)
Chart series   : ≤ 5 categorical colors
```

Anything beyond this is a bug.

**Status colors are reserved words.** They may never be used decoratively.

| Meaning | Color | Never used for |
|---|---|---|
| Healthy / success | green (`jade`/`green`) | Anything that isn't "OK" |
| Warning / degraded | amber | Anything that isn't "at risk" |
| Critical / error | red | Anything that isn't "broken" |

Grafana's guidance is the standard here: **give color meaning, and be consistent about it.** If red means "bad" in one panel, it means "bad" in every panel.

**Accessibility:** never encode state with red-vs-green *alone* — that combination is the hardest for color-blind users. Always pair color with a second channel: an icon, a shape, a text label, or a threshold line.

**Chart series colors:** for non-semantic series (e.g. model A vs model B), use a **neutral/blue-family ramp**, not the status hues. Reserving red/amber/green for status is what makes an anomaly actually pop.

### 4.4 Surface, border, radius

```css
:root {
  --radius-card: 8px;   /* not 16px — that reads consumer-app, not ops-tool */
  --radius-input: 6px;
  --radius-badge: 4px;
}
```

**Dark mode: do not use box-shadow for elevation.** Shadows are invisible on dark backgrounds and just add mud. Use a **background lift + 1px border** instead:

```css
--bg-0: <neutral-1>;   /* page */
--bg-1: <neutral-2>;   /* card */
--bg-2: <neutral-3>;   /* hover / raised */
--border: <neutral-6>; /* 1px, low contrast */
```

**Reduce card usage.** A card is a semantic container, not a wrapper. Group with **whitespace and a section heading** first; only reach for a bordered card when the content genuinely needs isolation. A screen where every element has a border is a screen with no hierarchy.

---

## 5. Layout & information architecture

### 5.1 The 5-second rule

A dashboard must answer **"is this healthy right now?"** within 5 seconds of opening. If it doesn't, the layout is wrong regardless of how it looks.

Corollary: a 40-panel wall of charts communicates nothing. It requires the viewer to already know which 4 panels matter — which is exactly the knowledge they don't have during an incident.

### 5.2 Vertical hierarchy (top → bottom)

```
┌─ Row 0 · Global controls (sticky) ─────────────────────────────┐
│  Time range · Environment · Service/Project · Refresh · Search  │
├─ Row 1 · Status summary ───────────────────────────────────────┤
│  3–5 stat cards. Health · SLO% · Active alerts · Cost today     │
│  Each: big tabular number + label + delta + sparkline           │
├─ Row 2 · Golden signals ───────────────────────────────────────┤
│  Time-series. See metric framework below.                       │
├─ Row 3 · Domain-specific ──────────────────────────────────────┤
│  [AIOps]  queue depth · cache hit · node/pod health             │
│  [LLMOps] tokens & cost by model · eval score trend             │
│           · top failing prompts · latency by provider           │
├─ Row 4 · Detail / drilldown ───────────────────────────────────┤
│  Trace list or log table → click → trace detail                 │
└────────────────────────────────────────────────────────────────┘
```

**Metric frameworks — pick one and label the panels with it:**

| Framework | Metrics | Layer |
|---|---|---|
| **RED** | Rate, Errors, Duration | Service layer |
| **USE** | Utilization, Saturation, Errors | Infrastructure layer |
| **Four Golden Signals** (Google SRE) | Latency, Traffic, Errors, Saturation | Service layer |

**[LLMOps] equivalent set:** Requests/min · Error rate · p50/p95/p99 latency · Tokens in/out · Cost · Eval score · Guardrail violations.

### 5.3 Grid & scanning

- 12-column grid, 16px gutter.
- Max 3–4 cards per row on desktop. More than that and each becomes unreadable.
- Users scan **top-left first** (Z / F pattern). The single most important number goes there.
- **Progressive disclosure over density-dumping:** collapsible sections, drilldowns, tabbed sub-views. Do not try to show everything at once.
- **Compare like with like.** If two series differ by orders of magnitude, split them into separate panels. An aggregate metric that drowns out an important one is worse than no metric.
- **Normalize axes.** CPU as % of cores, not raw core-seconds. Cost per 1k tokens, not raw cents. Normalizing removes the cognitive step the viewer has to do in their head.

### 5.4 Every alert links to its panel

An alert notification that links to the dashboard *root* forces the on-call engineer to hunt. Link to the **exact panel** showing the alerting condition, with the time range pre-scoped to the incident.

---

## 6. Chart rules

### 6.1 Start from zero

**Turn every chart-library default OFF, then re-enable only what earns its place.**

Recharts baseline for a time-series panel:

```jsx
<LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
  {/* Horizontal gridlines ONLY, very low contrast. No vertical grid. */}
  <CartesianGrid horizontal vertical={false} stroke="var(--border)" strokeOpacity={0.5} />

  <XAxis
    dataKey="ts"
    axisLine={false}        // off
    tickLine={false}        // off
    tickMargin={8}
    minTickGap={32}
    tickFormatter={fmtTime}
    tick={{ fontSize: 12, fill: "var(--muted)" }}
  />
  <YAxis
    axisLine={false}        // off
    tickLine={false}        // off
    width={44}
    tickCount={4}           // 4–5 ticks max, never more
    tickFormatter={fmtUnit} // "1.2k", "340ms", "98%" — never a raw float
    tick={{ fontSize: 12, fill: "var(--muted)" }}
  />

  {/* Custom tooltip. Default Recharts tooltip is a tell. */}
  <Tooltip content={<OpsTooltip />} cursor={{ stroke: "var(--border)" }} />

  <Line
    type="monotone"
    dataKey="p95"
    stroke="var(--chart-1)"
    strokeWidth={1.5}       // 1.5–2. Not 3.
    dot={false}             // ALWAYS false
    activeDot={{ r: 3 }}    // only on hover
    isAnimationActive={false} // ops data refreshes; animation is a distraction
  />
</LineChart>
```

**Legend:** with ≤2 series, delete the legend and **label the lines directly** at their right edge. Legends force the eye to bounce back and forth.

### 6.2 Chart type selection

| Question being answered | Chart |
|---|---|
| "What is the headline number right now?" | KPI / stat card |
| "How does it compare across categories?" | Horizontal bar / BarList |
| "How is it trending over time?" | Line / area |
| "How is it distributed?" | Histogram / heatmap |
| "Where did the time go in this request?" | **Span waterfall / flame graph** |
| "What are the individual records?" | Table |

**Never build a chart because there's an empty grid cell.** Every panel must answer a question someone actually asks.

### 6.3 Hard NO list

- ❌ **Pie/donut with >4 segments.** Use a horizontal bar list.
- ❌ **3D effects.** Any. Ever.
- ❌ **Dual Y-axis.** Almost always misleading — the crossing point is an artifact of axis scaling.
- ❌ **Stacked series by default.** Stacking hides the individual series and misleads on magnitude. Off unless the sum is genuinely the point (e.g. cost by model summing to total cost).
- ❌ **Gradients.** Exception: a *single*-series area chart may fade to ≤12% opacity. Never on multi-series.
- ❌ **Dots on every data point.**
- ❌ **Rainbow palettes.** Colorful charts are the single clearest amateur signal.
- ❌ **Raw floats on axes** (`1234.5678`). Always format with units.
- ❌ **Averages as the headline latency metric.** Use **p95 / p99**. The average hides exactly the users who are suffering.

### 6.4 Number formatting (apply globally)

```
Latency   → 340ms · 1.2s        (not 340.0000)
Count     → 1.2k · 3.4M         (not 1234)
Cost      → $12.40 · ₩16,300    (fixed decimals, thousand separators)
Percent   → 99.95%              (SLOs need 2 decimals; most things need 0–1)
Tokens    → 24.1k
Time      → "2m ago" for recent, absolute timestamp on hover
Delta     → +12.4% ↑ (green) / −3.1% ↓ (red), with the comparison window stated
```

---

## 7. Component patterns

### 7.1 KPI / stat card

```
┌──────────────────────────┐
│ P95 LATENCY         ⋯    │  ← 12px label, muted, uppercase-ish
│                          │
│ 342ms          ▲ 12.4%   │  ← 32px+ tabular · delta badge, semantic color
│                          │
│ ▁▂▃▅▄▆▇▆▅▃▂▁            │  ← sparkline, no axes, no grid, no tooltip
│ vs. last 24h             │  ← 11px, states the comparison window
└──────────────────────────┘
```

Rules: **one** number per card. Delta must state its baseline ("vs. last 24h") or it's meaningless. Sparkline has zero chrome.

### 7.2 **[LLMOps]** Trace tree / span waterfall

This is the signature screen. Get it right and the product reads as serious.

```
▼ trace_a91f  RAG agent · 4.2s · $0.031 · 8 spans          [ok]
  ├─ retrieve            ████░░░░░░░░░░░░░░░░░░  0.4s
  │  └─ vector.search    ██░░░░░░░░░░░░░░░░░░░░  0.2s
  ├─ llm.plan            ░░░░████████░░░░░░░░░░  1.1s   gpt-4o · 1.2k tok
  ├─ tool.web_search     ░░░░░░░░░░░░██████░░░░  1.4s          ← slowest
  └─ llm.synthesize      ░░░░░░░░░░░░░░░░░░████  1.3s   gpt-4o · 3.4k tok
```

- Bars positioned by **absolute time offset**, width = duration. Not sequential blocks.
- Mono font for IDs, model names, token counts, durations.
- Color the bar by **span type** (llm / tool / retrieval / chain), *not* by status — status goes in a separate badge.
- Highlight the critical path (the slowest chain) — that is the whole reason this view exists.
- Virtualize: traces can have hundreds of spans.
- Every span is clickable → right panel with input/output/metadata.

### 7.3 Data table

- 32–36px rows. Sticky header. Zebra striping OFF (use hairline row borders instead — striping is noisy at high density).
- Numeric columns: **right-aligned + tabular-nums**. Text columns: left-aligned.
- Status column: colored dot/badge + **text label** (never color alone).
- Column widths fixed; long strings truncate with `…` and reveal on hover.
- Row click → drilldown. Row hover → `--bg-2` lift.

### 7.4 Filter bar

Time range · environment · service/model · status · free-text search. Sticky. **Reflect state in the URL** (`?from=-24h&env=prod&model=gpt-4o`) so an on-call engineer can paste a link into Slack and the recipient sees exactly the same view. This is a UX feature, not a routing detail.

---

## 8. States — loading, empty, error, stale

The fastest way a good-looking dashboard becomes cheap-looking is the moment there is no data.

| State | Requirement |
|---|---|
| **Loading** | **Skeletons that match the final layout's exact dimensions.** Not a centered spinner. No layout shift when data lands. |
| **Empty (no data yet)** | Title + one-line explanation + **a primary action**. An empty screen is an invitation to act, not a dead end. e.g. "No traces yet — send your first request → [View SDK setup]" |
| **Empty (filter returned nothing)** | Different from above. "No traces match these filters" + [Clear filters]. Do not show onboarding copy to a user who already has data. |
| **Chart with zero data** | Render the axes and grid, overlay "No data in this range." **Never a blank rectangle.** |
| **Error** | State **what happened** and **how to fix it**, in the interface's voice. No apologies, no vagueness. "Query timed out after 30s. Try a shorter time range." |
| **Stale / disconnected** | Explicit indicator: "Last updated 4m ago" + a subtle desaturation. Silently showing stale numbers in an ops tool is a correctness bug. |
| **Partial failure** | One panel failing must not blank the page. Fail per-panel. |

**Refresh cadence:** don't poll every second because you can. If 30s is enough, use 30s. Over-refreshing costs backend load and makes the UI feel twitchy.

---

## 9. Reference products — study these, in this order

**[LLMOps] — open source, so you can read the actual component code**

| Product | What to steal |
|---|---|
| **Langfuse** (MIT, self-hostable) | The de-facto standard for trace tree / span waterfall / session views. Hierarchical traces designed for multi-step agent reasoning. **Start here** if you can clone/run it. **If you can't browse: the span-waterfall it's famous for is fully specified inline in §7.2 — build from that.** |
| **Arize Phoenix** (open source) | OpenTelemetry-based trace views, eval visualization |
| **Helicone** (open source) | Cost & latency dashboard, gateway metrics card layout |

**[LLMOps] — closed, sign up for the free tier and screenshot the screens**

| Product | What to steal |
|---|---|
| **Braintrust** | Eval scores rendered **natively inside the trace view**, not bolted on as a separate tab. Best-in-class eval UI. |
| **LangSmith** | Agent execution graph visualization, annotation queues |
| **Datadog LLM Observability** | Enterprise information density done right |

**[AIOps] / infra**

| Product | What to steal |
|---|---|
| **Grafana / Perses** | The original. Panel grammar, threshold coloring, template variables |
| **Honeycomb** (BubbleUp) | Outlier-vs-baseline comparison — the best "why is this slow" UI in the industry |
| **Sentry** | Issue grouping, stack traces, release health |
| **Vercel Observability** | Modern, restrained, dark-first |

**General craft benchmark:** **Linear**. Not an ops tool, but the reference for density + restraint + keyboard-first interaction.

---

## 10. Reference links

> **Note for the coding agent:** these are for the human, and for you only if you have browsing / clone access. If you cannot open them, do not treat any rule as skippable — the applicable rule is already inline above. The URL is the source, not the requirement.

### Code you can copy directly
- **Tremor** — https://tremor.so · https://blocks.tremor.so — dashboard/chart components + 300 blocks, MIT
- **Tremor GitHub** — https://github.com/tremorlabs/tremor
- **shadcn/ui charts** — https://ui.shadcn.com/charts
- **shadcn/ui blocks** — https://ui.shadcn.com/blocks
- **Vercel Geist (design tokens)** — https://vercel.com/geist/introduction
- **Radix Colors (the color system)** — https://www.radix-ui.com/colors
- **Pretendard (Korean webfont)** — https://github.com/orioncactus/pretendard
- **Recharts** — https://recharts.org
- **visx (custom viz / waterfalls)** — https://airbnb.io/visx
- **uPlot (real-time)** — https://github.com/leeoniya/uPlot

### Design rules (read, don't just skim)
- **Refactoring UI** — https://www.refactoringui.com — **if you read only one thing, read this.** It diagnoses exactly why developer-built UI looks wrong.
- **Grafana dashboard best practices** — https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/ — color semantics, stacking, axis normalization, dashboard sprawl
- **IBM Carbon Data Visualization** — https://carbondesignsystem.com/data-visualization/getting-started/ — which chart, which colors, how many
- **Google SRE Book — Monitoring / Golden Signals** — https://sre.google/sre-book/monitoring-distributed-systems/

### Reference products (study if reachable — see §9 for what to take from each)
- **Langfuse** — https://langfuse.com · https://github.com/langfuse/langfuse (self-host + read the components)
- **Arize Phoenix** — https://github.com/Arize-ai/phoenix
- **Helicone** — https://github.com/Helicone/helicone
- **Braintrust** — https://www.braintrust.dev
- **LangSmith** — https://www.langchain.com/langsmith
- **Datadog LLM Observability** — https://www.datadoghq.com/product/llm-observability/
- **Grafana** — https://grafana.com · **Perses** — https://perses.dev
- **Linear (craft benchmark)** — https://linear.app

### Galleries
- **Mobbin** — https://mobbin.com — hundreds of thousands of real production screenshots, searchable by pattern. Paid, worth it.
- **SaaSFrame** — https://www.saasframe.io/categories/dashboard — organized by *screen type*: dashboards, onboarding, settings, **empty states**. Covers exactly the gap Mobbin leaves.
- **SaaSUI** — https://www.saasui.design
- **Refero** — https://refero.design — web-first, ~4,000 screens free, Figma plugin.
- ⚠️ **Avoid Dribbble.** It is overwhelmingly unshipped concept work — visually polished but structurally unbuildable. Copying it produces a UI that collapses the moment real data (long labels, missing values, extreme outliers, 500 rows) arrives.

---

## 11. Acceptance checklist

Do not report the task complete until every box is checked **with `file:line` evidence** — write the proof next to each box (e.g. `[x] tabular-nums → globals.css:42, KpiCard.tsx:18`). A bare checkmark with no location is not acceptable. For any box you cannot check, state why in one line. If your final diff touches only fonts/colors and none of the layout, chart, or state sections, the task is **not** done (see directive #2).

**Typography**
- [ ] Pretendard (or equivalent) loaded; no OS default font fallback in production
- [ ] `font-variant-numeric: tabular-nums` on every numeric element
- [ ] Type scale has ≤6 steps; KPI number is ≥2.5× the size of its label
- [ ] Mono font on all IDs, model names, durations, code

**Color**
- [ ] Total hue count on screen: 1 neutral ramp + 1 brand + 3 status + ≤5 chart series
- [ ] Red / amber / green appear **only** as status semantics, nowhere decorative
- [ ] No state is communicated by color alone (icon or text label always present)
- [ ] Dark mode uses border + background lift, not box-shadow

**Layout**
- [ ] All spacing values are from {4,8,12,16,24,32,48,64}
- [ ] **5-second test passes**: system health is legible within 5 seconds of page load
- [ ] Top row = status summary; second row = golden signals; detail is below/behind a drilldown
- [ ] Filter state is reflected in the URL and is shareable
- [ ] Max 3–4 cards per row; no 40-panel wall

**Charts**
- [ ] Vertical gridlines off; horizontal gridlines at low opacity only
- [ ] Axis lines and tick lines off; ≤5 Y ticks; all ticks unit-formatted
- [ ] No dots, no 3D, no dual axis, no default stacking, no rainbow palette
- [ ] Pie/donut has ≤4 segments, or has been replaced with a bar list
- [ ] Latency reported as p95/p99, not average
- [ ] Legend removed where ≤2 series (direct labels instead)

**States**
- [ ] Skeleton loaders match final layout dimensions; zero layout shift on data arrival
- [ ] Distinct empty states for "no data yet" vs. "filters matched nothing"
- [ ] Zero-data charts render axes + message, never a blank box
- [ ] Errors state the cause and the fix; no apologies, no vagueness
- [ ] Stale-data indicator present
- [ ] One panel failing does not blank the page

**Quality floor**
- [ ] Responsive down to tablet (ops dashboards may skip phone, but must not break)
- [ ] Visible keyboard focus rings
- [ ] `prefers-reduced-motion` respected
- [ ] No `console.error` on load

---

## 12. If you only have one day

1. Install Pretendard + add `tabular-nums` globally.
2. Drop in Radix Colors; delete every raw hex from the codebase.
3. `git clone` Langfuse, run it locally, and copy its screen structure. **[LLMOps]**
4. Pull the Tremor dashboard blocks and replace your hand-rolled cards.
5. Strip every chart to defaults-off (§6.1).

That sequence alone closes most of the gap.
