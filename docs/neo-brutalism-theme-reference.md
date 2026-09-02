# Neo-Brutalism Theme Reference for Tracability OS

Source inspected on 2026-08-19: [neubrutalism.com](https://neubrutalism.com/#ecosystem)

This document translates the site's complete guidance into an implementation reference for this application. It is intentionally a design-system brief, not a page-by-page copy of the source.

## 1. Definition and Design Intent

Neo-Brutalism is a modern, system-friendly version of anti-design. It uses strong visual structure rather than polished neutrality:

- high contrast;
- flat, categorical colors;
- thick outlines;
- square or nearly square geometry;
- hard offset shadows with zero blur;
- bold display and heading type;
- obvious, physical interaction feedback;
- visible grids and deliberately exposed structure.

The style is not an excuse for clumsy UX. Its successful form is repeatable and commercially usable. The interaction model remains conventional while the visual layer becomes louder and more memorable.

The useful distinction is:

- architectural brutalism exposed material and construction;
- early web brutalism often rejected normal conventions;
- Neo-Brutalism keeps modern navigation and component systems, then adds blunt graphic structure.

## 2. Visual Grammar

### Color

Color is used to separate objects and states, not to create atmosphere. Surfaces should look like discrete assembled pieces.

Canonical light palette observed on the source site:

| Token | Value | Role |
| --- | --- | --- |
| `--nb-ink` | `#000000` | Text, outlines, hard shadows |
| `--nb-bg` | `#FFFDF5` | Warm app background |
| `--nb-surface` | `#FFFFFF` | Main panels and controls |
| `--nb-surface-2` | `#F5F0E8` | Secondary surfaces |
| `--nb-yellow` | `#FFD23F` | Loud highlight |
| `--nb-pink` | `#FF6B6B` | Alert/accent |
| `--nb-blue` | `#74B9FF` | Informational accent and focus |
| `--nb-green` | `#88D498` | Success/finished product |
| `--nb-orange` | `#FFA552` | Warning/semi-finished product |
| `--nb-purple` | `#B8A9FA` | Secondary accent |
| `--nb-cyan` | `#7FDBDA` | Optional accent |
| `--nb-red` | `#FF4444` | Error/destructive action |

Supporting light fills observed on the source site:

| Accent | Light fill |
| --- | --- |
| Yellow | `#FFF3C4` |
| Pink | `#FFE0E0` |
| Blue | `#E3F2FD` |
| Green | `#E8F5E9` |
| Orange | `#FFF0E0` |
| Purple | `#F0ECFF` |

Canonical dark palette observed on the source site:

| Token | Value |
| --- | --- |
| Background | `#14131A` |
| Surface | `#1F1E28` |
| Secondary surface | `#2B2A37` |
| Text | `#ECECED` |
| Outline/shadow | `#F3F3F6` |
| Yellow dark fill | `#2A2512` |
| Pink dark fill | `#2D191E` |
| Blue dark fill | `#14202F` |
| Green dark fill | `#13271B` |
| Orange dark fill | `#2D2414` |
| Purple dark fill | `#1F1B2F` |

Rules:

- Use one neutral base, one structural outline color, and a limited number of accents on each screen.
- Keep gradients out of this theme.
- Do not make every panel equally saturated.
- Do not use color as the only state signal. Pair it with text, icon, border, or pattern.
- Normal body text must reach at least `4.5:1` contrast; large text and UI boundaries need at least `3:1` where WCAG allows it.

For Tracability OS, retain existing domain semantics:

- raw material: blue;
- semi-finished: orange/yellow;
- finished: green;
- destructive/error: red;
- selected/focus: blue or green outline plus a non-color cue.

### Geometry and Borders

The outline is the main structural signal.

Recommended tokens:

```css
--nb-border-thin: 2px solid var(--nb-ink);
--nb-border: 3px solid var(--nb-ink);
--nb-border-thick: 4px solid var(--nb-ink);
--nb-radius: 0;
```

Rules:

- Use one canonical stroke width for most components. `3px` is the source site's default.
- Use `2px` for dense tables, dividers, and secondary boundaries.
- Reserve `4px` for dialogs, important sections, or rare emphasis.
- Prefer `0` radius. A restrained product variant may use `2px` to `4px` only where a perfectly square control causes layout or clipping problems.
- Borders must communicate container, interaction, focus, selection, warning, or error. Remove decorative borders with no semantic role.
- Keep dense table gridlines lighter than primary control outlines so the data remains the visual priority.

### Shadows and Depth

Neo-Brutalist shadows are offset layers, not atmospheric elevation. Blur is always zero.

```css
--nb-shadow-sm: 3px 3px 0 0 var(--nb-ink);
--nb-shadow: 5px 5px 0 0 var(--nb-ink);
--nb-shadow-lg: 8px 8px 0 0 var(--nb-ink);
--nb-shadow-xl: 12px 12px 0 0 var(--nb-ink);
```

Recommended hierarchy:

| Shadow | Use |
| --- | --- |
| Small | Chips, compact buttons, badges, inline actions |
| Medium | Primary buttons, cards, major panels |
| Large | Popovers, dialogs, important floating surfaces |
| Extra large | Rare hero/editorial elements; avoid in operational screens |

Do not give every object the same heavy shadow. Equal visual elevation destroys hierarchy and makes a dense screen exhausting.

### Typography

The source separates expressive display type from calm operational text.

Roles:

- Display: `Syne 800`, `Bebas Neue`, or `Archivo Black` for rare poster-scale moments.
- Heading: `Space Grotesk 700`, `Plus Jakarta Sans 700`, or `Outfit 700`.
- Body: `Inter 400` or `DM Sans 400`.
- Mono: `Space Mono` or `JetBrains Mono` for codes, lot numbers, timestamps, and technical metadata.

Recommended app stack:

```css
--nb-font-heading: "Space Grotesk", "Inter", sans-serif;
--nb-font-body: "Inter", ui-sans-serif, system-ui, sans-serif;
--nb-font-mono: "Space Mono", "JetBrains Mono", monospace;
```

Tracability OS should not use a display font throughout the UI. Operational labels, tables, forms, calendar details, and PDF-adjacent data must remain easy to scan. Use bold type for page titles, panel titles, selected tabs, primary actions, and numeric summaries. Use normal body weights for row content and component names.

### Layout

The source describes good Neo-Brutalist layout as structured disruption.

- Keep the underlying grid stable.
- Use asymmetry only at the macro level.
- Keep labels, fields, buttons, row cells, errors, and status feedback mechanically aligned.
- Keep navigation and reading order conventional.
- Avoid rotated controls, overlapping form fields, or intentionally irregular tables.
- Expressiveness may appear in section headers, empty states, selected cards, and accent panels, not in the traceability workflow itself.

## 3. Interaction Patterns

### Buttons

The physical model is lift on hover and press into the shadow on active.

```css
.nb-button {
  border: var(--nb-border);
  border-radius: var(--nb-radius);
  background: var(--nb-yellow);
  color: var(--nb-ink);
  box-shadow: var(--nb-shadow);
  font-weight: 700;
  transition: transform 100ms ease, box-shadow 100ms ease;
}

.nb-button:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0 0 var(--nb-ink);
}

.nb-button:active:not(:disabled) {
  transform: translate(3px, 3px);
  box-shadow: none;
}

.nb-button:focus-visible {
  outline: 3px solid var(--nb-blue);
  outline-offset: 3px;
}
```

For small icon buttons, use the small shadow and a shorter translation so the toolbar does not move excessively.

### Cards and Panels

```css
.nb-panel {
  border: var(--nb-border);
  border-radius: var(--nb-radius);
  background: var(--nb-surface);
  box-shadow: var(--nb-shadow);
}
```

Use medium shadows on a few ownership-level panels, not every nested region. The application already avoids cards inside cards; preserve that rule. Inner table areas should generally use borders without another hard shadow.

### Inputs, Selects, Date Pickers, and Textareas

```css
.nb-input {
  border: var(--nb-border);
  border-radius: var(--nb-radius);
  background: var(--nb-surface);
  box-shadow: var(--nb-shadow-sm);
}

.nb-input:focus,
.nb-input:focus-within {
  outline: 3px solid var(--nb-blue);
  outline-offset: 2px;
  box-shadow: var(--nb-shadow);
  transform: translate(-1px, -1px);
}
```

Application-specific rules:

- Do not reduce actual hit targets because the border makes controls look larger.
- Keep every interactive target at least `24x24px`; primary controls should remain closer to `36px` to `44px` high.
- Keep labels persistent and readable.
- Error states need text and an icon in addition to red.
- Keep dropdown and calendar widths tied to their trigger fields.
- Popovers need a stronger shadow than their trigger, but must remain inside the viewport.
- Keyboard focus must sit outside the thick structural border and remain visible.

### Checkboxes, Radios, Toggles, Tabs, and Segmented Controls

- Use a real checked/selected mark, not color alone.
- Use the same outline token as other controls.
- Selected tabs may use a flat accent fill and a small hard shadow.
- Unselected tabs should remain quieter and should not all look like primary buttons.
- Pressed and selected are different states: pressed is transient movement; selected is persistent fill/border/icon state.

### Toasts and Alerts

- Thick border plus a flat semantic fill makes alerts obvious.
- Use green for success, red/pink for error, blue for information, and yellow/orange for warning.
- Keep the message concise and include an icon or text label.
- Do not stack multiple equally loud toasts over important controls.

## 4. Accessibility Requirements

The source explicitly targets WCAG 2.2.

| Criterion | Minimum | Theme risk and response |
| --- | --- | --- |
| Text contrast | `4.5:1` normal, `3:1` large | Bright colors are not automatically accessible; verify each text/fill pair. |
| Non-text contrast | `3:1` for meaningful boundaries | Decorative outlines must not hide selected/error changes. |
| Focus visible | Clear keyboard focus | Use a separate outline and `outline-offset`; never rely on the hard shadow. |
| Target size | At least `24x24px` at AA | Count the actual clickable box, not the visible border/shadow. |
| Use of color | Color cannot be the only cue | Add text, icon, checkmark, border treatment, or shape. |

Additional app requirements:

- Respect `prefers-reduced-motion`; remove lift/press transitions where requested.
- Do not animate table layout or cause row/column shift.
- Preserve readable zoom behavior and prevent labels from being clipped.
- Test dark and light variants separately; reversing black and white does not prove accent contrast.

## 5. When the Style Fits

The source rates Neo-Brutalism highest for portfolios, creator sites, and marketing surfaces; moderate for e-commerce, editorial work, and dashboards; and risky for banking, healthcare, and government services.

Tracability OS is an information-dense operational product. Therefore:

- use the style as a theme and brand layer;
- keep traceability, production confirmation, reception, planning, and destructive workflows conventional;
- use the strongest visual moves on top-level navigation, primary actions, selected states, dialogs, summary panels, and empty states;
- use quieter `2px` borders and fewer shadows inside tables, timelines, calendars, diagrams, and long forms;
- avoid oversized display type inside compact widgets;
- never trade clarity or trust for visual personality.

This is the source site's likely long-term subtype: Soft Neo-Brutalism or component-library Neo-Brutalism.

## 6. Ecosystem and Historical Context

The movement developed through four layers:

1. Showcase: Dribbble, Behance, and Awwwards made the look visible.
2. Education: articles and community challenges turned the look into teachable rules.
3. Productization: Figma kits and commercial systems made it reusable.
4. Implementation: React, Tailwind, vanilla CSS, npm, and GitHub libraries made it shippable.

Important platforms and roles:

| Platform | Role |
| --- | --- |
| Dribbble | Early naming and visual clustering |
| Figma Community | Inspectable, remixable component systems |
| Awwwards/markets | Commercial templates and kits |
| Webflow | Low-code deployment and showcases |
| Framer | Design-to-publish templates |
| GitHub/npm | Installable components and curated libraries |

Reference implementations and brands named by the source:

- [neobrutalism.dev](https://www.neobrutalism.dev/): React, Tailwind, and shadcn-style component reference.
- [Awesome Neobrutalism](https://github.com/ComradeAERGO/Awesome-Neobrutalism): curated examples and resources.
- [Panda CSS](https://panda-css.com/): developer-tool marketing implementation.
- [Gumroad](https://gumroad.com/): prominent creator-economy adoption.
- [Tony's Chocolonely](https://tonyschocolonely.com/): consumer brand example.
- [Dodonut](https://dodonut.com/): agency/portfolio example.

Historical outline:

- 1950s-1960s: architectural New Brutalism and exposed structure.
- 1960s-1980s: anti-design and Memphis add bright color, exaggeration, and deliberate friction.
- 2014-2016: web brutalism becomes a named reaction to polished startup sameness.
- 2019-2021: Figma, Tailwind, Webflow, and Framer make tokenized visual systems easy to distribute.
- 2021-2023: the Neo-Brutalism label and reusable kits crystallize.
- 2024 onward: it becomes a component-library category rather than only a visual trend.

The source does not claim one uncontested inventor. It treats the style as a distributed movement popularized through platforms and reusable kits.

## 7. Future Direction

The maximal version is cyclical; the grammar is durable. The likely future is hybrid:

- strong brand surfaces;
- calmer product interaction;
- tokenized intensity;
- hard borders and shadows used selectively;
- greater emphasis on visible human authorship as generic AI layouts become common.

Named subtypes:

- Soft Neo-Brutalism: lower color intensity and more breathing room.
- Memphis hybrid: hard-outline UI plus playful geometry.
- Cyber-brutalism: dark surfaces, neon accents, glitch influence, and heavy monospace.
- Cute-alism: bright sticker-like styling inside a hard structural frame.
- Component-library Neo-Brutalism: standardized React/Tailwind primitives.
- Editorial/poster Neo-Brutalism: the most expressive, typography-led version.

For this app, Soft Neo-Brutalism plus component-library discipline is the correct direction.

## 8. Proposed Tracability OS Theme Tokens

These tokens preserve the source grammar while respecting the app's operational role and existing product colors.

```css
[data-theme="neobrutalism"] {
  color-scheme: light;

  --nb-ink: #111111;
  --nb-bg: #fffdf5;
  --nb-surface: #ffffff;
  --nb-surface-2: #f5f0e8;
  --nb-yellow: #ffd23f;
  --nb-pink: #ff6b6b;
  --nb-blue: #74b9ff;
  --nb-green: #88d498;
  --nb-orange: #ffa552;
  --nb-purple: #b8a9fa;
  --nb-red: #ff4444;

  --nb-border-thin: 2px solid var(--nb-ink);
  --nb-border: 3px solid var(--nb-ink);
  --nb-border-thick: 4px solid var(--nb-ink);
  --nb-shadow-sm: 3px 3px 0 0 var(--nb-ink);
  --nb-shadow: 5px 5px 0 0 var(--nb-ink);
  --nb-shadow-lg: 8px 8px 0 0 var(--nb-ink);
  --nb-radius: 0;

  --app-bg: var(--nb-bg);
  --surface: var(--nb-surface);
  --surface-soft: var(--nb-surface-2);
  --surface-muted: #ece7df;
  --table-header-bg: var(--nb-yellow);
  --border: var(--nb-ink);
  --border-soft: #555555;
  --text: var(--nb-ink);
  --muted: #4f4b45;
  --supabase-green: #138a62;
  --product-raw: #155fb8;
  --product-semi-finished: #8a5400;
  --product-finished: #086a49;
  --diagram-bg: var(--nb-bg);
  --diagram-grid-dot: #77716a;
  --diagram-link: var(--nb-ink);
  --scrollbar-track: var(--nb-surface-2);
  --scrollbar-thumb: var(--nb-ink);
}
```

The darker semantic text colors above are deliberate: black text on the canonical bright fills is often safe, but colored text still needs explicit contrast checks.

## 9. Component Coverage for a Future Implementation

A complete theme must cover all of these surfaces before it can be considered finished:

- app shell, page background, top bar, sidebar, branding, nav items, and avatars;
- primary, secondary, icon, pagination, calendar, and destructive buttons;
- panels, repeated cards, dialogs, drawers, modals, popovers, menus, and updater panel;
- text inputs, numeric inputs, selects, comboboxes, date pickers, textareas, checkboxes, radios, toggles, and unit fields;
- segmented controls, filters, tabs, active states, and selected rows;
- production, reception, supplier, planning, delivery, product, and report tables;
- raw/semi-finished/finished badges and conform/non-conform statuses;
- dashboard calendar days, day numbers, activity markers, and details sidebar;
- planification timeline, nodes, links, separators, and history states;
- production component substitutions and lot dropdowns;
- traceability diagrams, grid, edges, arrows, and empty states;
- loading screen, auth screen, toasts, notices, and error states;
- reduced-motion behavior and keyboard focus.

## 10. Implementation Strategy in This Repository

The project already implements theme-specific CSS using `[data-theme="..."]` overrides in `src/styles.css`. A future Neo-Brutalism implementation should follow that architecture and avoid a new UI dependency.

Recommended sequence:

1. Add `"neobrutalism"` to `ThemeMode`, `themeSequence`, `getThemeLabel`, and `getThemeIcon` in `src/App.tsx`.
2. Add a token block and broad component overrides at the end of `src/styles.css`.
3. Start with shell, buttons, panels, forms, menus, and focus states.
4. Add dense-screen moderation for tables, calendars, planning, and production components.
5. Verify every app screen in the running Tauri/Vite app at normal and smaller supported viewport sizes.
6. Test keyboard navigation, visible focus, actual hit targets, reduced motion, and contrast.
7. Only publish an updater after the visual audit passes.

Do not implement the theme as a global rewrite of base styles. Keeping it isolated under `[data-theme="neobrutalism"]` reduces regression risk for Light, Dark, Neumorphism, and Clay.

## 11. Completion Checklist

- [ ] Theme appears in the Theme popover with a clear label and icon.
- [ ] Existing themes remain visually unchanged.
- [ ] No gradients or blurred shadows appear in the Neo-Brutalism theme.
- [ ] Primary structure uses one consistent border system.
- [ ] Shadows use offsets with zero blur and a predictable hierarchy.
- [ ] Buttons lift on hover and press down on active without causing layout shift.
- [ ] Body and data typography remain calm and readable.
- [ ] Product type colors preserve current meaning.
- [ ] Tables and forms are quieter than top-level panels.
- [ ] Focus rings remain visible outside thick borders.
- [ ] Text contrast, non-text contrast, and target sizes meet WCAG 2.2 expectations.
- [ ] Color is never the only state signal.
- [ ] Popovers and calendars stay within the viewport.
- [ ] Dense screens do not overlap, clip, or lose information.
- [ ] Reduced-motion mode removes decorative movement.
- [ ] Desktop screenshots confirm calendar, reception, production, planification, deliveries, and dialogs.

## 12. Source Links

- [Primary guide](https://neubrutalism.com/#ecosystem)
- [Nielsen Norman Group best practices](https://www.nngroup.com/articles/neobrutalism/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Michał Malewicz essay](https://uxdesign.cc/neubrutalism-is-taking-over-the-web-e9d09e0fe441)
- [neobrutalism.dev](https://www.neobrutalism.dev/)
- [Awesome Neobrutalism](https://github.com/ComradeAERGO/Awesome-Neobrutalism)
- [Source site's GitHub repository](https://github.com/neubrutalism/neubrutalism.com)
