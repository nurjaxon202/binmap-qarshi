# BinMap Qarshi — visual direction

## The idea: a field survey in progress

BinMap is not a waste-management dashboard and not an environmental campaign
site. It is **a survey of public infrastructure, made by the people who use
it** — and its defining property is that it is honest about how much it knows.
A bin is verified, or community-reported, or doubtful. An empty area means
nobody has recorded anything there, not that nothing is there.

No competitor designs around that. So that is what the design is about:
**degrees of certainty, made visible.**

Everything below follows from it.

---

## 1. The memorable thing: confidence is a texture

Survey drawings, cadastral plans and utility locate marks encode categories
with **hatching**, not colour. BinMap does the same, and the convention runs
through every surface — map markers, status marks, the coverage grid, the
legend:

| State | Treatment |
| --- | --- |
| Verified on site | solid fill |
| Community-reported | 45° hatch |
| Needs re-check | open fill, dotted edge |
| Demonstration record | cross-hatch, dashed edge |

Three things this buys:

- It is **independent of colour**, so it survives colour blindness, a
  greyscale print and a phone in sunlight.
- It is **borrowed from the subject's own world** rather than from software.
- It is the one place the design is allowed to be bold. Everything else stays
  quiet so this reads.

## 2. Palette

The brief fixes the families: deep forest green, warm ivory, muted natural
green, restrained lime, charcoal. They are used **structurally**, not as a
wash.

| Token | Hex | Role |
| --- | --- | --- |
| `ink` | `#14160F` | Type. Near-black with a green cast, never pure black. |
| `forest` | `#15402A` | Full-bleed grounds, primary actions, solid marks. |
| `moss` | `#5E7D68` | Secondary marks, hatch lines, quiet type on paper. |
| `paper` | `#F5F1E4` | The working surface. |
| `paper-deep` | `#E9E2CD` | Inset regions, the operational ground. |
| `lime` | `#BCD946` | One accent per screen. Never a background. |
| `survey-red` | `#9C3A24` | Problems only. A surveyor's correction ink. |

Two axes, two visual languages, so they never read as one scale:

- **Confidence** (verified / not verified / disputed) is carried by
  **texture** — solid, hatched, dashed outline — as described below.
- **Provenance** (administrator / resident) is carried by **two tints of the
  same green**: `forest` for a record an administrator entered, `moss` for one
  a resident sent in. It is deliberately not a new hue: provenance is a second
  reading of the same object, not a third status. An earlier draft used a
  slate blue here, and it read as the one colour on the page from outside the
  palette — and as a status.

**A warm cream page with a green accent is the current house style of
generated design.** The defence is that cream is only half of it: the homepage
opens on a *full-bleed forest ground* and drops to paper below the fold.
Forest is the cover of the survey; paper is the sheet you work on. The two
grounds alternate down the site and carry different type colour, so no page is
one undifferentiated cream field.

## 3. Typography: one family, two widths

**Archivo** (variable, with the `wdth` axis) everywhere. It was drawn for
signage and highlighting — the literal vernacular of public infrastructure —
and it carries Latin Extended plus Cyrillic, so `oʻ`, `gʻ`, `Sh`, `Ch`, `Q`
render correctly today and Russian is possible later without a second family.

- **Display** — Archivo at `wdth 112`, weight 600, tracking −0.025em. The
  expanded width is what makes a headline here look like wayfinding rather
  than a SaaS hero.
- **Body** — Archivo at normal width, 400/500.
- **Coordinates** — IBM Plex Mono, and *only* for coordinate pairs and
  distances, where digits must align between rows. Not for labels, not for
  captions, not for eyebrows.

Not Inter, not Arial, not a system stack. Line length stays under 72
characters.

### Typographic rules

- **No tracked-out ALL-CAPS eyebrow above headings.** Where a small label
  genuinely carries information, it is a **legend key**: a texture swatch plus
  sentence-case text, which says something the heading does not.
- No `A · B · C` meta strings.
- No accenting one word of a headline in another colour.
- Numbers that can be compared between rows use tabular figures.

## 4. Structure: the coordinate gutter

Narrative pages carry a narrow left rail with latitude ticks and section
marks, like the margin of a plan sheet. It encodes where you are in the
document — it is information, not ornament. It is absent from the
administration area, which is a work surface, not a document.

## 5. Composition — deliberately different per surface

| Surface | Composition |
| --- | --- |
| **Homepage** | Forest cover, then paper. Asymmetric 7/5 split; a live Qarshi map fragment bleeding off the right edge. The hero *is* the product, with the real legend and real counts beside it. |
| **Map** | The map is the page. Chrome is one paper rail, hairline-separated. No cards. |
| **Submission** | Single column over the map. The gutter carries step marks — this content genuinely is a sequence, which is the only case where numbering is honest. |
| **User account** | Paper, two columns, hairline tables. Calm. |
| **Administration** | `paper-deep` ground, left nav rail, dense hairline tables, tabular figures, tight spacing, no rounded cards, no marketing rhythm. An operational tool, and it should feel like one. |

## 6. Motion

**One orchestrated moment:** on the homepage, the hero's markers plot in
sequence once — 20 ms stagger, under 400 ms total — which reads as a survey
being recorded. Nothing else moves unless a person acts on it. State changes
(opening a panel, confirming a submission) animate because they show what
changed. `prefers-reduced-motion` removes all of it.

No fade-and-slide-up on every section. No hover transition on every surface.

## 7. Explicitly rejected

Purple or blue gradients · glassmorphism · a grid of identical rounded cards ·
decorative illustration · floating shapes · stock-photo hero sections ·
oversized empty headlines · an icon beside every label · the same layout on
every page · invented statistics · charts with no data behind them · animation
as texture · marketing copy that says nothing.

Also rejected, because they are the current generated-design defaults rather
than choices: the ALL-CAPS mono eyebrow, the `·`-joined meta line, monospace
as a label face, terracotta on cream, a single bright accent on near-black,
and the `→` appended to every link.

## 8. Writing

Uzbek (Latin), sentence case, active voice, plain verbs. A control says what
it does — "Xaritani ochish", not "Yuborish" — and keeps that name through the
whole flow. Empty states say what to do next. Errors say what happened and how
to fix it, and do not apologise. Nothing is sold; things are described.
