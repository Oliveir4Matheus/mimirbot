# SPEC — MimirBot | Unified File Preview and Visual Annotation

**Version:** 1.0 — functional and visual specification (based on prototype v4 + requested positioning change)  
**Status:** interface and interaction scope defined  
**Visual reference:** `mimir_preview_arquivos_v4.html`  
**Supported formats:** `.md`, `.html`, `.csv`, `.xlsx`, `.mp4`, `.pdf`

**Language preservation:** This specification is written in English to simplify technical reading, **not to change the application's language**. Preserve the UI's existing language/localization. For the Portuguese interface shown in the approved prototype, examples include **Baixar** (Download), **Anotar** (Annotate), **Fechar** (Close), **Alternar posição** (Switch position), **Adicionar ao prompt** (Add to prompt), **Enviar ao agente** (Send to agent), **Leitura** (Reading), **Código-fonte** (Source), **Prévia** (Preview), **Tabela** (Table), **Planilha** (Spreadsheet), **Pesquisar na tabela** (Search table), **Limpar** (Clear), **Aplicar** (Apply), **Descartar** (Discard), and **Concluir** (Done). English terms in the tables below describe those controls; they do not require translating the product UI.

> **Fundamental constraint — no architectural decisions:** This document specifies **what users must see and be able to do**, including dimensions, positions, colors, states, and observable outcomes. It does not prescribe internal components, directories, frameworks, libraries, endpoints, services, data models, screenshot mechanisms, or how to modify the project. The implementer must inspect the existing project and choose the appropriate integration, preserving existing functionality.

---

## 1. Goal and primary change

**Current behavior to replace:** Clicking a document generated in the conversation opens the folder/directory containing the file.

**Expected behavior:** Clicking the **name, card, or actionable element of a generated file** immediately opens **a preview of that same file**, without navigating to its folder. No additional “Open preview” click should be required.

- Previews support all six formats listed above.
- The viewer offers **two user-selectable positions:** **Center** and **Left side of the conversation**.
- A **new position button sits immediately next to the Download button** in the viewer header.
- There are no **previous file / next file** arrows in the header; those were removed. **Previous page / next page** controls remain valid **inside PDF preview**, since they navigate pages rather than files.
- Download, visual annotation, and format-specific tools work in both positions.
- Opening and using a preview **must not move, overwrite, or automatically change** the source file.

### 1.1 Outside the scope of this SPEC

Do not specify or infer MimirBot's current structure, source filenames, UI framework, rendering libraries, APIs, backend, database, storage mechanism, execution security, permissions, paths, or infrastructure. The referenced HTML is a **visual outcome reference**, not an architectural contract or code to copy wholesale.

Do not ship items created solely to demonstrate the prototype (e.g., the fake six-file list, test-environment “Select file” button, sample datasets, or notices that sending is simulated). The product requirement is to preview **real files associated with the conversation**.

---

## 2. Expected user flow

| Step | User action | Required visible outcome |
|---|---|---|
| 1 | Clicks a generated document in the conversation | Opens that file's preview in the currently selected position. |
| 2 | Looks at the header | Sees format icon, filename, extension, file size when available, and **Download**, **Switch position**, **Annotate**, **Close**. |
| 3 | Clicks the button next to **Download** | Switches **Center ↔ Left side** without closing the current file. |
| 4 | Uses format-specific controls | Reads, searches, filters, sorts, plays, zooms, or switches views, as appropriate. |
| 5 | Clicks the pencil (**Annotate**) | Can select a region of the preview visually. |
| 6 | Drags across an area and comments | Sees the selection highlighted and types an instruction about it. |
| 7 | Selects **Add to prompt** | Sees an editable message with the instruction and **a screenshot of the highlighted area, including annotation identification**. |
| 8 | Selects **Send to agent** | Posts the message, file reference, and image to the agent conversation; closes the preview as in the approved prototype. |
| 9 | Clicks **Download** | Downloads the displayed original file, without applying preview filters/sorting. |
| 10 | Closes the viewer | Returns to the conversation without navigating to the file directory. |

**Important:** “Annotate” means **requesting a change by messaging the agent**, not directly editing spreadsheet cells, HTML, Markdown, PDF, or video within the preview.

---

## 3. Single viewer structure

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Icon] filename.ext           [View mode] [Search/Zoom]                   │
│        EXT · Size                 [Download] [Position] [Annotate] [Close] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              PREVIEW AREA                                    │
│                       (format-specific content)                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Optional: annotation message + image + send to agent]                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Read-only preview]                               [Copy] [Done]             │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **One file viewer at a time.** Switching position does not create a second preview.
- Header, content, and optional footer belong to **the same window/panel**.
- The header is **compact**, with no separate tall title bar and toolbar.
- **Content** fills the remaining height. The content, table, or document scrolls while the header remains accessible.
- The footer is understated and **does not consume space in MP4 and PDF previews** in the approved design, leaving that space for content.
- The prompt composer only appears after an annotation is added; it is hidden during normal preview.

### 3.1 Header item order

**Left to right on wide screens:**

1. Extension-specific icon in a small box.
2. Filename (primary line) and metadata (secondary line).
3. View selector, when relevant: **Reading / Source**, **Preview / Source**, **Table**, **Spreadsheet**.
4. Contextual control, when relevant: table search or PDF page/zoom controls.
5. **Download**.
6. **Switch position** (**NEW**, immediately next to Download).
7. **Annotate** (pencil).
8. **Close** (X).

Items 3 and 4 appear only for relevant formats. Items 5–8 are persistent global actions. When space is insufficient, the header wraps into two rows, **without adding a separate toolbar component beneath the window**.

---

## 4. Positioning: center or left side

### 4.1 Center mode

| Property | Visual reference |
|---|---|
| Position | Horizontally and vertically centered over the application. |
| Width | `min(1030px, available width)`; approved reference maximum: **1030 px**. |
| Height | `min(790px, viewport height − 44px)`; approved reference maximum: **790 px**. |
| Outer margin | **22 px** around the window on desktop. |
| Desired minimum height | **360 px** where space permits; fitting the viewport takes priority. |
| Window background | `#18191B`. |
| Border | **1 px**, `#3A3C41`. |
| Corner radius | **16 px**. |
| Shadow | Soft, broad dark shadow (reference: `0 35px 120px #000C`). |
| Background behind window | Dark overlay `#030407C8` with approximately **5 px** blur. |
| Conversation behavior | Remains visible behind the overlay; the preview is the primary interaction until closed or moved aside. |

### 4.2 Left-side mode — **new requirement**

**Visual outcome:** Preview on the **left** and MimirBot conversation on the **right**. Both remain visible so users can reference the file while writing or following the conversation.

| Property | UI target for the new mode |
|---|---|
| Position | Aligned to the **left side** of the conversation area. |
| Target width | `clamp(420px, 43vw, 680px)` on screens that can fit side-by-side content. |
| Target height | `calc(100dvh - 24px)` within available space; adjust for any application-owned bars. |
| Visual outer spacing | Approximately **12 px** on free edges. |
| Gap from conversation | Approximately **12 px**. |
| Surface, border, radius | Same values as Center mode; no separate theme. |
| Conversation dimming | **Do not apply** the center modal's blocking backdrop. |
| Conversation | Must remain visible and interactive. |
| Internal content | Same structure and controls as Center mode, scaled proportionally to the narrower width. |

> Left-side measurements above are **UI target values for the new layout**, not measurements from prototype v4 (which only had the centered modal). Fine adjustments are permitted **only** to fit the actual interface without compromising the expected layout.

### 4.3 New **Switch position** button

| Property | Specification |
|---|---|
| Placement | **Immediately to the right of Download**, before Annotate. |
| Appearance | Same compact header button style (`#26272A`, `#383B41` border, **7 px** radius). |
| Height | **29 px**, aligned with Download and Annotate. |
| Icon | Layout/window icon indicating **center** or **left panel**; **15 px**. |
| Width | **29–31 px** for icon-only; may include a short label when space allows. |
| Accessible name / tooltip | In Center mode: **“Move to left side”**. In left mode: **“Center preview”**. |
| Click from Center | Moves the **same preview** to the left side. |
| Click from left | Moves the **same preview** to Center. |
| Content and context | Keeps **current file, selected sheet/tab, page/zoom, scroll when possible, filters/sorting, and annotation draft**. |
| Visual state | Icon and tooltip reflect the available action. |

**Opening rule:** Clicking a generated document **always opens its preview**, **never** its directory. **Default position is Center** until the user first changes it. After that, the initial position is the last one selected **while the interface remains open**. This SPEC **does not require** the choice to persist between sessions; that was not defined.

**On narrow screens:** When there is insufficient room for side-by-side preview and conversation, temporarily use a full-screen/responsive centered view while keeping the position control accessible. When space returns, the selected left-side mode may be displayed again. Never clip controls or compress the conversation to unusable dimensions.

---

## 5. Dimensions, typography, and visual structure

Values are taken from the **final styles** in HTML v4, including the latest overrides (not older overridden rules).

| Element | Size / placement / appearance |
|---|---|
| Header height | **54 px on desktop**; may increase only when items must wrap. |
| Header padding | **8 px vertical × 14 px horizontal** (desktop); **8 × 11 px** compact. |
| Header element gap | **9 px**; **5 px** between grouped action buttons. |
| Format icon | **32 × 32 px** box, **8 px** radius; **18 px** glyph. |
| Filename | **12 px**, approximately **630** weight, `#EFF0F2`; ellipsis for long names. |
| Metadata | **10 px**, `#868A92`; format tag **9 px**. |
| Global buttons | Minimum **29 px** height, **1 px** border, **7 px** radius, **11 px** label, **15 px** icons. |
| Close button | **28 × 28 px**, round, `#2D2E31` background, X icon. |
| Content area | Takes **100% of remaining space**, `#151618` background, internal scrolling. |
| Footer (when displayed) | **44 px** high, **15 px** horizontal padding, `#1B1C1E` background, `#2D2E32` top border. |
| Footer buttons | **11.5 px** text, approximately **7 × 13 px** padding, **8 px** radius. |
| General text | Inter or an equivalent existing interface font; **13 px**, **1.55** line height. |
| Standard UI icon | **17 × 17 px**; smaller variants **15 px**. |
| Button hover | `#34363A` background or matching component state, light text. |
| Keyboard focus | Visible **2 px** `#85A9FF` outline, **2 px** offset. |

### 5.1 Preview color palette

| Visual token | Color | Use |
|---|---|---|
| Application background (prototype reference) | `#0D0E10` | Surrounding context; not a request to rebrand the app. |
| Main preview surface | `#18191B` | Viewer frame. |
| Header/footer surface | `#1B1C1E` | Fixed bars. |
| Content background | `#151618` | Preview body. |
| Raised surface | `#242528` / `#26272A` | View selectors and buttons. |
| Internal borders | `#2B2D31` / `#303236` | Dividers and outlines. |
| Primary text | `#E9EAEC` / `#EFF0F2` | Titles and content. |
| Secondary text | `#8D9097` / `#868A92` | Metadata and supporting text. |
| Purple accent | `#A485EE` | Highlights, selections, annotations, indicators. |
| Selected tab | `#3A3B3E` | Active tab or viewing mode. |
| Active annotation | `#3A314B` background, `#776398` border, `#D8C4FC` text | Active Annotate button. |
| Primary comment button | `#B39CEF` background, `#1A1424` text | Add to prompt. |
| Send to agent button | `#C0ADF0` background, `#241C2E` text | Send annotated message. |

### 5.2 Format icon colors

| Format | Icon background | Icon color | Icon border |
|---|---|---|---|
| `.md` | `#2B2935` | `#C2A1FF` | `#3B344A` |
| `.html` | `#302923` | `#E7A473` | `#44352D` |
| `.csv` | `#1D302A` | `#83CBA8` | `#30473E` |
| `.xlsx` | `#193329` | `#70C59A` | `#284636` |
| `.mp4` | `#222D3A` | `#96BFF0` | `#2E3B4E` |
| `.pdf` | `#372825` | `#F39C91` | `#563934` |

Colors in this document apply **only to the preview and its contents**; they do not imply changes to the rest of MimirBot.

---

## 6. Shared button behavior

### 6.1 Download

- Always visible in the header for all six formats.
- Downloads **the currently open original file**, preserving its name and extension.
- Sorting, search, zoom, filtering, and view mode are **display-only**: download **must not** replace the original with a filtered, cropped, or modified version.
- Does not open the containing folder.
- On narrow screens, may show **icon only** with accessible name/title “Download file”.

### 6.2 Switch position

- See section **4.3**.
- Located beside Download, not in the footer or overflow menu.
- Does not change files, unnecessarily restart playback/query, or clear annotation text.

### 6.3 Annotate

- **Pencil** icon; always visible for all six formats.
- Click enables **region selection** over the file preview; clicking again cancels it.
- While active, the button uses the highlighted purple style in section 5.1.
- The selection layer covers **only the file area**, never the global header.
- Full flow is specified in section **13**.

### 6.4 Close / Done

- **X** at the far right of the header closes the preview.
- **Done** in the footer, when shown, also closes it.
- In Center mode, clicking the backdrop outside the window closes the preview, as in the prototype.
- **Esc** closes the preview when no higher-priority internal interaction must first be dismissed.
- In left mode, clicking the conversation **does not** automatically close the preview; simultaneous use is the point.
- Closing neither opens folders nor modifies the source file.

### 6.5 Copy content

- Secondary footer action for **Markdown, HTML, and CSV** (when textual content is available), as in prototype v4.
- Copies the corresponding text without editing the file.
- **Do not** add Copy content to XLSX, MP4, or PDF by assumption.

---
## 7. Markdown preview (`.md`)

**Expected outcome:** readable, formatted Markdown within the same modal/panel.

| Element | Specification |
|---|---|
| View tabs | **Reading** (default) and **Source**. |
| Reading area | Centered content, maximum width **750 px** where space allows. |
| Reading margins | Top padding **31 px**, responsive side padding **19–55 px**, bottom padding **70 px**. |
| Document text | **13 px**, **1.86** line height, `#D0D2D6`. |
| H1 | **26 px**, `#F1F2F4`. |
| H2 | **18 px**, `#F0F1F3`, subtle bottom divider. |
| H3 | **14 px**. |
| Code blocks | `#0F1012` background, `#34353B` border, **10 px** radius, approximately **15 × 17 px** padding. |
| Source | Monospaced **12 px**, **1.8** line height, **29 px** vertical and **17–50 px** horizontal padding. |

**Behaviors:**

- **Reading** renders headings, paragraphs, lists, bold, links, quotes, code blocks, and tables as present in the document.
- **Source** shows the original Markdown as monospaced text; this is not an editing mode.
- Switching Reading/Source never modifies the file.
- Content scrolls when taller than the available area.
- Download, Copy content, and Annotate remain available.

---

## 8. HTML preview (`.html`)

**Expected outcome:** render HTML directly inside the preview body, using **100% of the available width and 100% of the available height**.

| Element | Specification |
|---|---|
| Tabs | **Preview** (default) and **Source**. |
| Preview body | **100% of available content area**, without extra margins, padding, borders, or radius between HTML and viewer. |
| Fake browser chrome | **Remove** any browser-like inner frame, fake address bar, or space-reducing inner container. |
| Rendered content | Fills the body while respecting the HTML document's own layout. |
| Source | Monospaced text, its own scrolling, layout similar to Markdown Source mode. |

**Behaviors:**

- Clicking the file displays the rendered page rather than opening its folder.
- **Preview** and **Source** can be switched from the header.
- Rendering HTML is a **preview**, not automatic authorization to perform external actions; how existing protections are upheld must be determined within the project, not by this SPEC.
- Annotate lets users select and comment on visible regions of rendered HTML.
- In left mode, HTML adapts to the panel's inner width, with no extra viewer margins.

---

## 9. CSV preview (`.csv`)

**Expected outcome:** readable, searchable table with per-column sorting and filtering.

### 9.1 Visual structure

| Element | Specification |
|---|---|
| View mode | **Table** indicator in header. |
| Global search | Approximately **188 × 30 px** on desktop; `#242528` background, `#34363A` border, **7 px** radius, **11 px** font. |
| Summary bar | Just above grid, `#1A1B1D` background, approximately **9 × 16 px** padding. |
| Summary data | Count of **visible / total rows**, **columns**, and **active filters**. |
| Table | Dark surface, **11.5 px** cell font; no row-by-row cards needed. |
| Minimum column-header height | **37 px**. |
| Cells | Approximately **10 × 15 px** padding; subtle `#2C2E32` borders. |
| Maximum visible cell width | Approximately **260 px**, with ellipsis if longer; full value may be exposed via title/details. |
| Row index column | Minimum **47 px** width, on left. |
| Table header | Sticky at top of grid scrolling. |
| Scrolling | Vertical and horizontal **within the grid**. |

### 9.2 Sorting: behavior and visible arrow

- Clicking a **column name** toggles **ascending ↑** and **descending ↓** order.
- Show an arrow of about **13 px** next to the name of **the currently sorted column**.
- Active arrow color: `#BBA5FA`.
- **↑ = ascending; ↓ = descending.** The indicator must match the actual displayed ordering, not just the latest click.
- When no sorting is applied, **show no active arrow**.
- The approved prototype sorts by **one column at a time**; do not introduce multi-column sorting as a requirement.
- Sorting changes the displayed row order **without modifying the original file's row sequence**.

### 9.3 Per-column filtering

- Each column heading has a **filter button** at its right edge, with a clickable area approximately **28 px** wide.
- Clicking it opens that column's **context menu**; it does not edit cells or open another file modal.
- Menu: approximately **245 px** wide, **11 px** radius, `#242528` background, `#424449` border, **9 px** padding; viewport-constrained height with its own scroll.
- Menu contents, in order:
  1. Selected column name.
  2. **↑ A → Z** and **↓ Z → A** sort actions.
  3. **Filter column values** text.
  4. **Search values…** field, **31 px** high.
  5. Scrollable list of distinct values from that column with **checkboxes** to include/exclude values; maximum scrollable height **165 px**.
  6. **Clear** button.
  7. **Apply** button.
- The menu may open and close without losing the current file.
- After **Apply**, show only rows satisfying that column's filter.
- Filters on **different columns** can coexist and must be reflected in the row/filter summary.
- Filtered columns have a highlighted icon (`#9AA8FA`) and a small purple marker, as in the prototype.
- **Clear** removes the selected column's filter (and its sorting, if it is the sorted column), without removing other columns' filters.
- Clicking outside the menu or scrolling the grid closes the **filter menu**, not the preview.

### 9.4 Global search

- **Search table** field in the header.
- Filters displayed rows as the user types.
- Works together with per-column filters.
- Summary counts update to reflect visible rows.
- With no matches, display: **“No rows match the filters.”**

---

## 10. XLSX preview (`.xlsx`)

**Expected outcome:** spreadsheet viewer with the same table-reading tools as CSV plus workbook sheet navigation.

### 10.1 XLSX-specific elements

- Directly below the main header/before the grid, display a horizontal **sheet tab bar**.
- Each tab shows the **sheet name**.
- Active tab: light text, `#242629` background, **2 px** green `#7BCBA5` bottom indicator.
- Tabs can scroll horizontally when they do not fit.
- Target tab-bar height, based on prototype padding: approximately **42 px**.

### 10.2 Behaviors

- Opening XLSX displays its first available worksheet.
- Clicking another tab switches **only the displayed worksheet**; the viewer remains open.
- The active worksheet has **global search, per-column sorting, ↑/↓ arrow, and per-column value filters** exactly as CSV does.
- In prototype v4, switching sheets clears the previous grid's search, filters, and sorting; use that behavior as the visual reference.
- Row, column, and filter indicators refer **to the current sheet**.
- This is a **read-only view**, not direct cell editing.
- **Download** delivers the original XLSX with all worksheets; preview filters do not rewrite it.
- If no viewable sheets exist, show **“No worksheets found in this file.”**

---

## 11. Video preview (`.mp4`)

**Expected outcome:** video player using the maximum area available inside the viewer.

| Element | Specification |
|---|---|
| Player area | **100% of preview body width and 100% of preview body height**. |
| Video body padding | **0 px**. |
| Inner player borders / rounding | **0 px**; outer viewer provides the visual boundary. |
| Player background | `#050608` / `#0B0C0F` in unused areas. |
| Video sizing | Preserve aspect ratio without cropping, visually equivalent to **contain**. |
| Controls | Play, pause, timeline/progress, volume, and standard player commands. |
| Secondary footer | **Hidden**, freeing vertical space for video. |

**Behaviors:**

- Opens the player **inside the preview**, never the file folder.
- Do not show descriptions, decorative borders, or an extra panel underneath the video.
- Letterboxing is acceptable if video and container aspect ratios differ; **never stretch or crop** just to fill the box.
- Annotate can mark a region **of the currently visible video frame** for a comment.
- Closing the viewer must stop audio playing in the background.
- Switching Center ↔ Left retains the current file and avoids unnecessary video restarts.

---

## 12. PDF preview (`.pdf`)

**Expected outcome:** read document pages within the viewer, with compact header controls and the entire body available for the document.

| Element | Specification |
|---|---|
| PDF area | Uses **100% of the content area**, without a second decorative window. |
| Viewer background | `#292A2D`, with bright pages standing out. |
| Navigation | **Previous page**, **current page / total**, **next page**. |
| Zoom | **−** and **+** buttons with visible percentage between them. |
| Initial zoom | **100%**. |
| Prototype zoom increment | **25 percentage points** per click. |
| Intended zoom range | **50%–200%**. |
| Control group | Compact, `#252629` background, `#393A40` border, **8 px** radius, buttons approximately **27 × 26 px**. |
| Zoom label | Monospaced **11 px** font, approximately **39 px** visual width. |
| Footer | **Hidden** for PDF preview. |

**Behaviors:**

- Users navigate pages without changing files.
- The indicator shows the correct current page and total.
- At the first/last page, unavailable navigation buttons become disabled.
- Zoom percentage updates with each adjustment.
- The document remains legible and scrollable in both positions.
- Annotate lets users highlight a region **of the visible PDF page** and send the comment with its screenshot.
- **Do not confuse** PDF page arrows with the removed **previous/next file** navigation.

---
## 13. Complete visual annotation flow (all six formats)

### 13.1 Enable selection

1. The user opens a file preview.
2. Clicks **Annotate** (pencil in the header).
3. The button enters its active state (`#3A314B` background, `#776398` border, `#D8C4FC` text).
4. A translucent layer appears **within the content area only**, with a selection cursor.
5. Instruction at the top of the content: **“Drag to select the area you want to change”**.
6. The user drags to draw a rectangle over the target area.

### 13.2 Visual selection

| Element | Specification |
|---|---|
| Valid area | **Visible file region** inside the preview body; not header/footer. |
| Selection outline | Rectangle with **2 px** purple `#AA89F2` border. |
| Selection fill | Translucent purple `#AA89F21B`. |
| Outside area | Soft dimming around the selected region. |
| Cursors | Indicate selection while the mode is active. |
| Tiny selection | Selections under approximately **22 × 22 px** do not open the form; prompt the user to select a larger area. |
| Cancel selection | Click the pencil again or **Cancel** in the form. |

### 13.3 Comment on a selected region

- Once dragging ends, show **a small floating form inside the preview**, preferably near the bottom-right of the available area, without leaving the container.
- **Width:** up to **334 px**, limited to the available inner width (`inner width − 32 px`).
- **Desktop reference position:** **16 px** from the right and **16 px** from the bottom.
- **Compact position:** **9 px** from those edges, filling available width if needed.
- **Background:** `#232429`; **border:** `#54505C`; **radius:** **12 px**; **padding:** **13 px**.
- Title: **“Comment on selected region”**, **12 px**.
- Helper text: **“Describe what you want changed in the highlighted area.”**, approximately **10.5 px**.
- Textarea: minimum **67 px** height, approximate maximum **140 px**, **12 px** text, `#17181B` background, `#44414D` border, **8 px** radius.
- Reference placeholder: **“E.g., Align this card and reduce its height…”**.
- Actions: **Cancel** and **Add to prompt**.
- Primary button: `#B39CEF` background, `#1A1424` text, **7 px** radius.
- **Add to prompt** must not proceed with an empty comment; ask for text first.

### 13.4 Create the annotated capture

Selecting **Add to prompt** prepares a message containing:

1. **Identification of the file** the request refers to.
2. **Instruction text** provided by the user.
3. **An image capture of the selected region**, with visual annotation/identification and a reference to the comment.

**Capture appearance in the prototype:** an image with a purple outline delimiting the selection and a numbered **“1”** marker; a label strip reading **“Comment 1:”** followed by the comment. The crop must show **the actual content visible** in the selected area, not a generic placeholder.

**Outcome requirement:** no particular screenshot mechanism is mandated. What matters is that **the user can submit to the conversation a faithful image of the selected area plus a textual instruction**. The implementer should inspect the existing project for the appropriate way to achieve this.

### 13.5 Message composer before sending

After **Add to prompt**, display a composition area attached to the preview, as in v4:

| Element | Dimensions / style |
|---|---|
| Composer | Bar at the bottom of the viewer, before the footer (where present). |
| Background | `#1D1D22`; `#493C5E` top border. |
| Padding | **10 px** vertical and **14 px** horizontal. |
| Title | **“Message with annotation”**, **11 px**, emphasized. |
| Discard action | **Discard**, at the top-right of the bar. |
| Capture thumbnail | **102 × 66 px**, **6 px** radius, `#5C5070` border; compact approximately **88 × 62 px**. |
| Prompt field | Editable, minimum **66 px** high, `#47434E` border, `#141518` background, **7 px** radius, **11.5 px** text. |
| Send | **“Send to agent”** button, `#C0ADF0` background, `#241C2E` text, **7 px** radius. |
| Compact layout | Composer wraps; Send button may use **100% width**. |

Suggested starting text from the prototype, **editable by the user**:

> In the file `filename.ext`, make the following change to the highlighted region:
>
> [user's comment]

- User can inspect the capture thumbnail before sending.
- **Discard** removes the annotation draft without changing the file.
- **Send to agent** posts the instruction and image in the conversation and closes the preview, leaving the request visible in chat history.
- Do not send if the user has not entered a valid instruction.
- A preview response must not imply the agent has already made the requested change.
- The prototype handles **one pending annotation at a time**. Do not add simultaneous multi-annotation management as new scope.

### 13.6 Annotation in left-side mode

- The same selection and comment workflow works in the narrower panel.
- The form and composer must remain **fully inside that panel**, never overlapping the conversation.
- Switching Center ↔ Left **must not discard** the typed comment or prepared capture.
- The final message is delivered **to the conversation on the right**, regardless of the preview's position.

---

## 14. Interface states

| State | Expected appearance / interaction |
|---|---|
| Closed | No preview open; conversation works as before. |
| Open in Center | Centered window, dark backdrop, accessible header. |
| Open on left | Preview on left, interactive conversation on right; no blocking backdrop. |
| Long content | Header stays accessible; scroll inside content. |
| Long filename | Ellipsis on filename; actions do not disappear. |
| No tabular data | Empty-state message in the body, not a broken screen. |
| No search/filter matches | **“No rows match the filters.”** |
| Active sorting | ↑/↓ beside the relevant column heading. |
| Active filter | Highlighted column filter button + active-filter count. |
| Selecting an annotation | Subtle overlay and purple selection rectangle. |
| Selection completed | Comment form shown within the file area. |
| Prompt prepared | Composer and thumbnail visible; no automatic send. |
| MP4/PDF preview | Maximum body usage; secondary footer hidden. |
| Preview failure | Understandable message **within the same container**; keep possible actions, especially Download and Close. |

---

## 15. Responsive behavior

The rule is to **preserve all features while scaling dimensions proportionally**; do not remove functionality merely to make the layout fit.

| Available width | Expected behavior |
|---|---|
| **Above ~920 px** | Header actions may show icon + text; centered modal capped at 1030 px. |
| **Up to ~920 px** | **Download / Annotate** may become icon-only; the new Position button stays visible with icon and tooltip. |
| **Up to ~760 px** | Header rearranges into **two rows**: file + actions above; view tabs and contextual tools below. |
| **Up to ~650 px** | Centered modal uses **100vw × 100dvh**, without outer border/radius; header padding approximately **8 × 11 px**. |
| **Up to ~410 px** | Tabs and search fields shrink; file icon may be hidden in header; essential actions remain accessible. |
| **Insufficient left-panel space** | Temporarily fall back to a wide view; never squeeze both conversation and preview into unusable widths. |

Detailed rules:

- Long filenames must not push **Download / Position / Annotate / Close** off-screen.
- Tables scroll horizontally; **do not** turn CSV/XLSX into cards that obscure column relationships.
- Filter menus reposition to fit the viewer/panel and viewport boundaries.
- MP4 preserves aspect ratio in the left panel as well.
- HTML still fills **100% of available body** even when narrower.
- PDF supports zoom and scrolling when its pages exceed the visible area.
- Visual annotation and composer fit fully inside the preview in either position.
- Never clip controls, menus, or text fields when a virtual keyboard is open on mobile devices.

---

## 16. Usability and accessibility interactions

- Every icon-only button must clearly expose its purpose through a tooltip and accessible name.
- The Position control describes the **next action** (move left or center).
- Active buttons and selected tabs have unmistakable visual states.
- Search and comment fields support typing and keyboard focus.
- When the centered modal opens, focus moves into the viewer; when it closes, focus returns to the originating conversation item where possible.
- Keyboard navigation remains inside the centered modal while it is open; the conversation must remain keyboard-accessible in left mode.
- **Esc** can dismiss the centered preview without affecting the file.
- ↑ and ↓ must be visible and understandable next to the column name; do not rely solely on subtle color differences to indicate sorting.
- Secondary text and icons maintain sufficient contrast against the dark surfaces.
- Short, restrained open/close animations are allowed (v4 reference: approximately **170–200 ms**); honor reduced-motion preferences.

---

## 17. Removal and preservation rules

### Remove / replace

- **Remove:** clicking a generated document navigates straight to its folder.
- **Remove:** previous/next **file** navigation arrows from the header.
- **Remove:** duplication of two tall header and toolbar strips.
- **Remove from HTML preview:** extra browser-window frame, fake address bar, and unnecessary margins.
- **Remove from video preview:** inner margins, small nested video frame, and below-player information that reduces usable space.

### Preserve

- Existing functionality that generates files and makes them available in the conversation.
- Original file identity and data.
- Agent conversation and normal interaction while the panel is on the left.
- Preview of all six formats with the documented tools.
- Original-file download.
- Sorting/filtering as **display-only** operations.
- Annotation as a request to the agent, attached to an image of the selected region.

---

## 18. Acceptance criteria (observable and verifiable)

| ID | Check | Expected outcome |
|---|---|---|
| AC-01 | Click generated `.md` | Opens Reading/Source preview, not folder. |
| AC-02 | Click generated `.html` | Opens rendered page filling 100% of the body. |
| AC-03 | Click generated `.csv` | Opens grid with search, sorting, and per-column filtering. |
| AC-04 | Click generated `.xlsx` | Opens workbook sheets with search, sorting, and per-column filtering. |
| AC-05 | Click generated `.mp4` | Opens functional player filling the body. |
| AC-06 | Click generated `.pdf` | Opens PDF with page navigation and zoom. |
| AC-07 | Open any supported format | Header includes Download, Position, Annotate, Close. |
| AC-08 | Click **Position** beside **Download** | Switches Center ↔ Left while keeping the same file. |
| AC-09 | Preview on left | Conversation appears on right and remains interactive. |
| AC-10 | Preview centered | Uses specified center dimensions and backdrop. |
| AC-11 | Reopen a file after switching positions | Opens preview, not directory, at last selected position for the active UI session. |
| AC-12 | Inspect preview header | No previous/next **file** arrows. |
| AC-13 | Click CSV/XLSX column heading | Toggles ascending/descending, shows ↑/↓, reorders rows. |
| AC-14 | Open column filter | Displays checkbox values, search, Clear, Apply. |
| AC-15 | Filter two columns | Both filters apply; row/filter counts update. |
| AC-16 | Search table | Displays matching rows or empty state when appropriate. |
| AC-17 | Switch XLSX sheet | Changes visible worksheet without closing preview. |
| AC-18 | Download after filtering/sorting | Downloads **original**, not filtered/sorted data. |
| AC-19 | HTML in Center and left mode | Rendered content fills body, no extra frame. |
| AC-20 | MP4 in Center and left mode | Video uses full available area without changing aspect ratio. |
| AC-21 | PDF on first/last page | Page indicator/buttons show correct boundary states. |
| AC-22 | PDF after zoom | Percentage changes in 25-point increments, from 50% to 200%. |
| AC-23 | Click pencil | Enables visual selection limited to file body. |
| AC-24 | Drag-select area | Shows highlighted rectangle and comment form. |
| AC-25 | Add valid comment | Creates editable prompt and faithful annotated thumbnail. |
| AC-26 | Try empty comment | Does not proceed; requests text. |
| AC-27 | Click Discard | Removes draft without modifying file. |
| AC-28 | Send to agent | Conversation receives text and image referencing the selected file. |
| AC-29 | Switch Center ↔ Left while preparing prompt | Preserves comment/capture and same file. |
| AC-30 | Close and reopen preview | Conversation does not redirect to the file folder. |
| AC-31 | Test narrow viewport | Header wraps, controls remain accessible without clipping. |
| AC-32 | Review implementation | SPEC dictated no architecture; existing project structure was respected. |

---

## 19. Summary for implementers

**Desired outcome in one sentence:** Clicking a file generated by MimirBot opens a complete, minimal, contextual preview with Download, format-specific tools, and an option to select a region and comment to the agent, with a button **next to Download** to switch **the same preview** between a **centered window** and a **panel on the left side of the conversation**.

**Basis:** The reference screenshots, design choices made across prototype iterations, and final visuals of `mimir_preview_arquivos_v4.html`. **No assumptions about the project's internal architecture were made.**
