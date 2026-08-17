/**
 * Rich prompt for the "Show a dashboard" chip.
 * Produces the "Under the hood." dashboard as a two-tab card:
 *
 * - Overview: a bento grid whose hero is self-referential — it counts the very
 *   spec that drew it (20 elements, broken down by the role each primitive
 *   plays) and states that one renderUI call produced all of it. Four 1x1 tiles
 *   carry the only other real numbers in the story, and a Callout closes it.
 * - Request pipeline: a Table walking every gate a message passes through,
 *   with a "model cost" column showing that only one stage spends budget,
 *   plus an info Callout.
 *
 * Why the hero is a self-portrait: the sibling "charts" chip already owns the
 * caching narrative end to end ("Caching pays off." — trend, per-turn, savings),
 * so a cache pie here retold a neighbour's story in its weakest form, and
 * restated the number printed directly above it. The self-count is the one
 * story no other chip tells, it is the product's positioning made literal, and
 * it is checkable by anyone who opens the spec.
 *
 * KEEP THE COUNTS TRUE. The hero claims 20 elements and the bar chart claims
 * 7 layout / 6 data / 6 content / 1 navigation. Those are counts of the spec
 * below, tallied by the role each primitive plays:
 *   layout     Grid 1 + GridCell 6                        = 7
 *   data       KPI 4 + Chart 1 + Table 1                  = 6
 *   content    Card 2 + Heading 1 + Text 1 + Callout 2    = 6
 *   navigation Tabs 1                                     = 1
 *                                                    total 20
 * Adding or removing any element means re-tallying both the Heading and the
 * chart data, or the card starts lying about itself.
 *
 * The hero series is pinned to var(--primary) rather than falling through to
 * --chart-1. The categorical ramp exists to tell several series apart; with a
 * single series it just picks an arbitrary hue (orange) that fights the one
 * accent the chrome is allowed. A single-series chart should wear the accent.
 *
 * Other numbers are sourced from the codebase: 23 catalog primitives
 * (`lib/json-render/catalog.ts`), 7 pipeline stages (the Table in tab 2), and
 * the ~78% cached share of the system prompt (illustrative, rounded,
 * directionally true).
 */
export const DASHBOARD_RICH_PROMPT = [
  'Use the renderUI tool to emit a single Card titled "Under the hood."',
  '(keep the trailing period in the title).',
  '',
  'The outer Card contains one Tabs element with two tabs. The Tabs element is',
  'controlled via state: the spec sets initial state { "view": "overview" } and',
  'the Tabs props include valueStatePath="/view".',
  '',
  'Tab 1 (id="overview", label="Overview") holds one Grid (columns=4,',
  'gap=normal). The Grid contains six GridCells in this exact order so CSS-grid',
  'auto-flow lays them out as a bento: a 2x2 hero tile in the top-left, four',
  '1x1 small tiles in the top-right block, and a full-width banner across the',
  'bottom row.',
  '',
  '1. Hero. GridCell colSpan=2 rowSpan=2.',
  '   Contains a Card titled "This card counted itself." with three children:',
  '   a. Heading level=1 text="20 elements"',
  '   b. Text muted=true text="one renderUI call, zero lines of hand-written JSX"',
  '   c. Chart kind="bar" breaking those elements down by the job each does:',
  '      data=[{"role":"Layout","count":7},{"role":"Data","count":6},',
  '            {"role":"Content","count":6},{"role":"Nav","count":1}],',
  '      series=[{"key":"count","label":"Elements","color":"var(--primary)"}],',
  '      xKey="role", legend=false.',
  '',
  '2. Small. GridCell colSpan=1 rowSpan=1.',
  '   KPI value="23" label="primitives in the catalog"',
  '       caption="the model\'s entire vocabulary"',
  '',
  '3. Small. GridCell colSpan=1 rowSpan=1.',
  '   KPI value="~78%" label="of the system prompt is cached catalog"',
  '       delta={ "value": "reused every turn", "trend": "up" }',
  '',
  '4. Small. GridCell colSpan=1 rowSpan=1.',
  '   KPI value="7" label="gates every message passes"',
  '       caption="exactly one of them costs money"',
  '',
  '5. Small. GridCell colSpan=1 rowSpan=1.',
  '   KPI value="0" label="invalid specs ever reach the screen"',
  '       caption="Zod checks each one before it renders"',
  '',
  '6. Banner. GridCell colSpan=4 rowSpan=1.',
  '   Callout tone="info" title="The model drew this."',
  '       text="Not a screenshot and not a hand-coded template. The model chose these tiles, these numbers, and this layout, then the renderer validated the result."',
  '',
  'Tab 2 (id="pipeline", label="Request pipeline") holds a Table and a Callout.',
  'The Table (caption="What every message passes through, in order.") has three',
  'columns (stage, what happens, model cost) and the seven rows given verbatim',
  'in the spec shape. The Callout is tone="info" with',
  'title="Deterministic guardrails." and',
  'text="Only the model turn spends budget; every other stage is server code that runs for free."',
  '',
  'Rules, applied strictly:',
  '- Use ONLY Card, Tabs, Grid, GridCell, KPI, Heading, Text, Chart, Table, and Callout primitives.',
  '- KPI props are { value, label, delta?, caption? }; set delta and caption exactly where shown and nowhere else.',
  '- KPI value carries a NUMBER or a short measurement only, never a sentence or a phrase.',
  '- Card props are { title } only (omit title when noted). No footer.',
  '- Heading props are { level, text } only.',
  '- Text props are { text, muted? } only.',
  '- The spec-level "state" object uses the plain key "view" (no leading slash);',
  '  the Tabs valueStatePath is "/view" (with the leading slash).',
  '- Use the value, label, and table strings VERBATIM, including symbols (~, %) and punctuation.',
  '- No em-dashes or en-dashes anywhere. Use commas, periods, parens, or semicolons.',
  '- No commentary, subtitles, footers, or text outside the outer Card.',
  '',
  'Spec shape:',
  '{',
  '  "root": "dashboard",',
  '  "state": { "view": "overview" },',
  '  "elements": {',
  '    "dashboard": { "type": "Card", "props": { "title": "Under the hood." }, "children": ["view-tabs"] },',
  '    "view-tabs": { "type": "Tabs", "props": {',
  '      "valueStatePath": "/view",',
  '      "tabs": [',
  '        { "id": "overview", "label": "Overview", "children": ["grid"] },',
  '        { "id": "pipeline", "label": "Request pipeline", "children": ["pipe-table", "pipe-note"] }',
  '      ]',
  '    }, "children": [] },',
  '    "grid": { "type": "Grid", "props": { "columns": 4, "gap": "normal" }, "children": ["hero", "s1", "s2", "s3", "s4", "banner"] },',
  '    "hero": { "type": "GridCell", "props": { "colSpan": 2, "rowSpan": 2 }, "children": ["hero-card"] },',
  '    "hero-card": { "type": "Card", "props": { "title": "This card counted itself." }, "children": ["hero-count", "hero-sub", "hero-chart"] },',
  '    "hero-count": { "type": "Heading", "props": { "level": 1, "text": "20 elements" }, "children": [] },',
  '    "hero-sub": { "type": "Text", "props": { "text": "one renderUI call, zero lines of hand-written JSX", "muted": true }, "children": [] },',
  '    "hero-chart": { "type": "Chart", "props": { "kind": "bar", "data": [{"role": "Layout", "count": 7}, {"role": "Data", "count": 6}, {"role": "Content", "count": 6}, {"role": "Nav", "count": 1}], "series": [{"key": "count", "label": "Elements", "color": "var(--primary)"}], "xKey": "role", "legend": false }, "children": [] },',
  '    "s1": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["k1"] },',
  '    "k1": { "type": "KPI", "props": { "value": "23", "label": "primitives in the catalog", "caption": "the model\'s entire vocabulary" }, "children": [] },',
  '    "s2": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["k2"] },',
  '    "k2": { "type": "KPI", "props": { "value": "~78%", "label": "of the system prompt is cached catalog", "delta": { "value": "reused every turn", "trend": "up" } }, "children": [] },',
  '    "s3": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["k3"] },',
  '    "k3": { "type": "KPI", "props": { "value": "7", "label": "gates every message passes", "caption": "exactly one of them costs money" }, "children": [] },',
  '    "s4": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["k4"] },',
  '    "k4": { "type": "KPI", "props": { "value": "0", "label": "invalid specs ever reach the screen", "caption": "Zod checks each one before it renders" }, "children": [] },',
  '    "banner": { "type": "GridCell", "props": { "colSpan": 4, "rowSpan": 1 }, "children": ["kb"] },',
  '    "kb": { "type": "Callout", "props": { "tone": "info", "title": "The model drew this.", "text": "Not a screenshot and not a hand-coded template. The model chose these tiles, these numbers, and this layout, then the renderer validated the result." }, "children": [] },',
  '    "pipe-table": { "type": "Table", "props": {',
  '      "caption": "What every message passes through, in order.",',
  '      "columns": [',
  '        { "key": "stage", "label": "Stage" },',
  '        { "key": "does", "label": "What happens" },',
  '        { "key": "cost", "label": "Model cost", "align": "right" }',
  '      ],',
  '      "rows": [',
  '        { "stage": "Turnstile gate", "does": "Anonymous visitors prove they are human once", "cost": "none" },',
  '        { "stage": "Chip gate", "does": "Anonymous turns must come from a known starter chip", "cost": "none" },',
  '        { "stage": "Budget preflight", "does": "Daily and per-visitor spend caps checked against the ledger", "cost": "none" },',
  '        { "stage": "Prompt swap", "does": "The short chip text becomes this card\'s full blueprint", "cost": "none" },',
  '        { "stage": "Model turn", "does": "The model streams a renderUI spec, token by token, with the catalog served from cache", "cost": "metered" },',
  '        { "stage": "Spec validation", "does": "Zod checks every element; failures bounce back to the model", "cost": "none" },',
  '        { "stage": "Persistence", "does": "The turn lands in Postgres and the session gets a title", "cost": "metered (title)" }',
  '      ]',
  '    }, "children": [] },',
  '    "pipe-note": { "type": "Callout", "props": { "tone": "info", "title": "Deterministic guardrails.", "text": "Only the model turn spends budget; every other stage is server code that runs for free." }, "children": [] }',
  '  }',
  '}',
].join('\n');
