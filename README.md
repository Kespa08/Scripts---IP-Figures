# FlowchartBuilder — ExtendScript Automation Tool

**Target application:** Adobe InDesign  
**Script file:** `FlowchartBuilder_Phase1_2_3.jsx`  
**Language:** ExtendScript (ES3-compatible JavaScript)  
**Scope:** Automates the construction of vertical flowchart diagrams within a fixed InDesign design system

---

## Background

This script exists within a specific organisational design system. Workflow diagrams are produced in InDesign using a set of template documents. Each template defines a **master spread** — a parent page that establishes the visual rules for a given diagram scale (typography, box dimensions, spacing, arrow style). Designers work by applying one of these masters to a page and then populating it with content.

Without the script, building a diagram means manually duplicating template objects, typing content into each one, repositioning every element by hand, and applying paragraph styles — a process that is slow, inconsistent, and difficult to hand off between designers.

The script replaces that process with a single dialog interaction.

---

## Document Structure Assumptions

The script expects an InDesign document structured as follows:

### Master Spreads

| Master name | Scale | Title object | TextBox template | Arrow template |
|---|---|---|---|---|
| `S1-Parent` | S1 | `Title_Flowchart` | `Object_TextBox_S1_01` | `Object_Arrow_01` |
| `S2-Parent` | S2 | `Title_Flowchart` | `Object_TextBox_S2_01` | `Object_Arrow_01` |
| `S3-Parent` | S3 | `Title_Flowchart` | `Object_TextBox_S3_01` | `Object_Arrow_01` |
| `S4-Parent` | S4 | `Title_Flowchart` | `Text_T1` + `Text_T2` | `Object_TextBox_S4_01` | `Object_Arrow_01` |

### Naming Conventions

All names are **case-sensitive** and matched by prefix in the Layers panel:

- **TextBox template:** name must start with `Object_TextBox` and contain the scale designator (e.g. `S2_`)
- **Arrow template:** name must start with `Object_Arrow`
- **Title frame:** exact name `Title_Flowchart`
- **S4 header frames:** exact names `Text_T1` and `Text_T2`
- **S4 child frames:** exact names `Text_Title` and `Text_Body` (nested inside `Object_TextBox_S4_01`)

### Paragraph Styles

The script applies paragraph styles automatically based on line prefix detection. The following styles must exist in the document:

| Style name | Applied when |
|---|---|
| `Body_S1` / `Body_S2` / `Body_S3` / `Body_S4` | Default — no prefix detected |
| `NumberedList_S1` … `NumberedList_S4` | Line starts with a digit followed by `.`, `)`, or space |
| `Bullets_S1` … `Bullets_S4` | Line starts with `-`, `•`, or `–` |

---

## How the Script Works

### Phase 1 — Dialog and Page Resolution

The designer interacts with a ScriptUI dialog containing:

- **Diagram Name** — populates `Title_Flowchart` on the working page
- **Artboard Scale** — radio buttons for S1, S2, S3, S4; selecting S4 swaps the step input panel for a dual-column layout
- **Flowchart Steps** — a scrollable list of multiline text inputs with `+` (add) and `×` (remove) buttons
- **Load from CSV** — loads step content from a CSV file instead of manual input
- **OK / Cancel**

**Page resolution logic:**

On OK, the script searches all pages in the document for one whose applied master name contains the selected scale identifier (e.g. `"S2"`). If a matching page exists and its template text box contains no content, that page is used as the working page. If all matching pages are already populated, a new page is added at the end of the document and the matching master is applied to it automatically.

### Phase 2 — Template Object Detection

The script locates the template text box and arrow on the working page by scanning `allPageItems` — which includes both page-level items and master-inherited items. It reads the exact geometric bounds of each object (`[top, left, bottom, right]` in document units) and stores them as the layout origin. No coordinates are hardcoded.

The arrow's vertical offset from the text box is also derived from the template geometry rather than a spec value, because the arrow is rotated and its axis-aligned bounding box does not coincide with its visual reference point.

### Phase 3 — Duplication, Text Injection, and Positioning

For each step in sequence:

1. **Duplicate** the template text box onto the working page
2. **Rename** it sequentially (e.g. `Object_TextBox_S2_02`, `Object_TextBox_S2_03`)
3. **Set the vertical position** — first box at the template's original Y; each subsequent box at `prevBoxBottom + 19.5pt`
4. **Inject text** — normalise all line endings to `\r` (InDesign's hard paragraph break) before setting `contents`, so each line becomes a distinct paragraph
5. **Apply paragraph styles** — snapshot all paragraph texts, detect style from prefix, strip the prefix character(s), reconstruct the full frame contents atomically in one `contents` assignment, then apply styles in a separate pass (this two-pass approach prevents paragraph merging caused by live DOM collection index drift)
6. **Auto-size height** — read the last character's baseline Y coordinate, add the scale's padding offset (6.5pt for S1, 13pt for S2/S3/S4), set that as the frame's bottom edge
7. **Place arrow** — duplicate the template arrow, move it by delta from its template position to sit at `boxBottom + templateArrowOffset` (preserving rotation), centred horizontally under the text box
8. **Skip arrow after the last step**

After the loop, the original template text box and arrow are removed from the working page if they are page-level items (not master-inherited), preventing invisible empty frames from overlapping the first generated box.

#### S4 Differences

For S4, each step contains two named child frames (`Text_Title` and `Text_Body`) nested inside `Object_TextBox_S4_01`. The script:

- Moves the outer frame to the target Y using `move()` (children translate with it)
- Places each child frame independently using the same text injection and auto-size logic
- Sets the outer frame's bottom to `max(Text_Title.bottom, Text_Body.bottom)`
- Syncs the shorter child's bottom edge to match the taller one, so both columns share the same bottom edge

---

## Layout Rules Reference

| Rule | Value |
|---|---|
| Gap between box bottom and next box top | 19.5pt |
| Arrow top from preceding box bottom | Derived from template geometry (visual gap preserved) |
| S1 box bottom padding (below last baseline) | 6.5pt |
| S2 / S3 / S4 box bottom padding | 13pt |
| Arrow horizontal alignment | Centred under text box |
| Sequential naming | Template suffix `n` → duplicate suffix `n+1`, zero-padded to same width |

---

## CSV Format

### S1 / S2 / S3 — Single Column

One quoted cell per step. Internal line breaks are preserved and treated as paragraph breaks. Numbered and bulleted prefixes are detected automatically.

```
"Pre-dispatch activities
1. Check, reconcile and pack votes
2. Set up a dispatch processing area"
"Logging dispatch
1. Enter dispatch details into EMS
2. Log all dispatches in Dynamics 365"
```

### S4 — Two Columns

Two columns per row: Column 1 (Title) and Column 2 (Body). Each row produces one step.

```
"Pre-dispatch activities","1. Check votes
2. Set up area"
"Logging dispatch","1. Enter dispatch details
2. Log all dispatches"
```

---

## Known Limitations

- **Mouse wheel scrolling** is not supported in the steps list. ScriptUI groups do not expose an `onWheel` event. Use the scrollbar arrows or drag the scrollbar thumb.
- **S1 pages** do not have a named `Title_Flowchart` object in the current template structure. The Diagram Name field is silently skipped for S1.
- **Master-inherited template objects** are not deleted after construction (only working-page items are removed). This is intentional — master items must remain for future page uses.
- **S4 child frame names** (`Text_Title`, `Text_Body`) are case-sensitive exact matches. If these names differ in the document, child placement will silently fall back to a fixed height.

---

## Key Debugging References

If the script fails silently, open the **ExtendScript Toolkit (ESTK)** console. The script writes diagnostic output via `$.writeln()` for paragraph style errors and S4 child frame issues.

Common failure modes:

| Symptom | Likely cause |
|---|---|
| "Template object not found" alert | Object name in Layers panel doesn't match expected prefix |
| "No page found with master" alert | Master spread name doesn't contain the scale identifier (e.g. `"S2"`) |
| Styles not applied | Paragraph style names in document don't match `NumberedList_S#` / `Bullets_S#` exactly |
| Boxes overlap or misalign | Template objects have been moved or resized since last QA pass — re-run Phase 2 QA alert to verify geometry |
| Dialog doesn't open | Check ESTK console for a syntax error — most commonly caused by smart/curly quotes introduced by a text editor |

---

## Development Notes for Claude Code

The script is structured as a single self-executing anonymous function `(function() { ... })()` containing all phases sequentially. The entry point is at the bottom of the file and calls `buildDialog()`, then `detectTemplateObjects()`, then `executePhase3()` in sequence, each gated by an error flag.

Key architectural decisions that should be preserved:

- **No hardcoded coordinates** anywhere in Phase 3. All positions derive from `getItemGeometry()` applied to the live template objects.
- **The two-pass paragraph style pattern** (snapshot → atomic rewrite → style pass) must not be collapsed into a single pass. Setting `paragraph.contents` in a loop against a live collection causes InDesign to merge paragraphs by dropping the `\r` separator.
- **`move()` not `geometricBounds` for arrows.** The arrow is rotated at −135°. Setting `geometricBounds` on a rotated object causes InDesign to back-calculate position ambiguously. `move(undefined, [deltaX, deltaY])` translates without distorting rotation.
- **`relayout()` must guard `updateS4Scrollbar()`** with a `typeof s4Rows !== "undefined"` check. `relayout()` is called before the S4 panel is built, at which point `s4Rows` is an uninitialised `var`. Calling `.length` on it throws a TypeError that silently prevents `dlg.update()` from firing, making new rows invisible.
- **Scroll content height** must be calculated as `rows.length * ROW_H`, not `rowContainer.size[1]`. The size property returns the clipped viewport height, not the logical content height.

