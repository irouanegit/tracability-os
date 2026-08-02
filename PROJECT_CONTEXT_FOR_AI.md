# Tracability OS - Project Context for Future AI Agents

This file is a handoff document for future AI agents working on this project. It intentionally includes project history, user preferences, data decisions, and domain rules that are not obvious from reading the source code alone.

Use it as context before touching code, SQL imports, Supabase policies, release builds, or PDF generators.

## Project Identity

- Product name: `Tracability OS`
- Domain: bakery/pastry production traceability for Casabianca.
- Main workspace path: `C:\Users\user\myprojects\solution traçabilité`
- Current app type: Tauri desktop app with a React/Vite frontend and Supabase backend.
- Current release line: `0.1.16` at the time this document was written.
- Current NSIS installer path pattern:
  `src-tauri\target\release\bundle\nsis\Tracability OS_<version>_x64-setup.exe`

The app tracks:

- Supplier raw-material receptions.
- Raw-material lots.
- Fabrication blueprints/schemas for semi-finished and finished products.
- Production lot confirmation.
- Traceability from produced products back to raw material and semi-finished lots.
- PDF traceability forms for production and reception.
- User audit tracking for who created/modified/validated/confirmed critical records.

## Stack

- Language: TypeScript/React for frontend, Rust for Tauri commands, SQL/Postgres for Supabase.
- Frontend framework: React 19 + Vite 7.
- Desktop shell: Tauri 2.
- Backend/database/auth: Supabase.
- Diagram engine: `@xyflow/react` / React Flow.
- UI icons: `lucide-react` and local `AppIcon` wrapper in `src/App.tsx`.
- PDF generation: `pdf-lib`, invoked from frontend and saved/opened through Tauri Rust commands.
- Package manager: npm.

Important Windows note:

- Use `npm.cmd`, not plain `npm`, in PowerShell. Plain `npm` may fail because `npm.ps1` is blocked by execution policy.

Common commands:

```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run tauri dev
npm.cmd run tauri build -- --bundles nsis
```

## Important Files

- `package.json` / `package-lock.json`: frontend package metadata and version.
- `src-tauri/tauri.conf.json`: Tauri app metadata, CSP, app version, product name.
- `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`: Rust package metadata and version.
- `src-tauri/src/main.rs`: Tauri commands for saving and opening PDFs.
- `src/App.tsx`: main application shell and most screens. This file is large; avoid broad refactors.
- `src/styles.css`: app design system and many screen-specific styles.
- `src/lib/traceabilityApi.ts`: Supabase API/data layer, RPC wrappers, and type definitions.
- `src/lib/supabase.ts`: Supabase client creation, env-var checks, user label helpers.
- `src/lib/productSearch.ts`: accent-insensitive product search helpers.
- `src/lib/productionLotCodification.ts`: production lot formula and codification aliases.
- `src/lib/productionTraceabilityPdf.ts`: production PDF generator.
- `src/lib/receptionQualityPdf.ts`: reception quality PDF generator.
- `src/FabricationDiagramWorkspace.tsx`: editable fabrication schema workspace.
- `src/ProductionTraceabilityDiagram.tsx`: production traceability schema view.
- `src/DiagramProductCard.tsx`: shared diagram card.
- `src/assets/casablanca-logo.jpg`: logo used in generated PDFs.
- `supabase/migrations`: schema migrations and audited RPC changes.
- `supabase/scripts`: import, repair, verification, and data-cleanup SQL scripts.

## Environment and Supabase

Frontend Supabase configuration comes from Vite env variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If these are missing or wrong, the app will show Supabase connection errors or an unconfigured/auth screen.

The app is intended to support multiple users from different devices as long as:

- They all use the same Supabase project.
- Supabase Auth users exist.
- The installed app has correct Supabase URL/key embedded at build time or provided through the expected env/build setup.
- Network access to Supabase is available.

Known Auth users in the project context:

- `achraf@trac.os`
- `admin@trac.os`
- `wisal@trac.os`

## Business Model

Core product types:

- Raw material: `raw`
- Semi-finished product: `semi_finished`
- Finished product: `finished`

Core categories:

- `beldi`
- `boulangerie`
- `cake`
- `patisserie`
- `viennoiserie`

Visual type colors are important:

- Finished products: green.
- Semi-finished products: orange.
- Raw materials: blue.
- Diagram links: black in light theme, light-colored in dark theme through `--diagram-link`.

Raw materials are supplier-linked. This matters more than it first appears:

- Reception creates lots for supplier-linked raw materials.
- Production confirmation resolves available lots through these raw material records.
- If schemas reference a duplicate or wrong raw-material product, that component will show no lots even when a visually similar material was received.
- Do not import product blueprints before raw materials are unified and linked to suppliers.

## Raw Material Unification Rules

The biggest data risk in this project has been duplicate raw materials that mean the same thing but have different names or suppliers. Example: one recipe uses `Amande`, another uses `Amande noire`; receiving one material does not automatically provide a lot for the other.

Before large imports, the intended flow is:

1. Extract all raw materials from source production files.
2. Normalize and unify names intentionally.
3. Link every raw material to its supplier.
4. Only then import products and active schemas.

Important current supplier/material decisions:

- `Eau` is water. It should be linked to `DIVERS`, but it is also a production-confirmation exception: the user may confirm a product even if `Eau` has no lot.
- `Cornflower` = `DIVERS`.
- `Mélange de graines` = `ECOMAB`.
- All Nestle/Nestlé types = `DIVERS`.
- `Pate pistache` = `ECOMAB`.
- `Pétales de fleurs` = `DIVERS`.
- `Sucre cassonade` = `DIVERS`.
- `Tournesol` = `DIVERS`.
- `Xanthane` = `DIVERS`.
- `Crème caramel` is a raw material supplied by `CREATIVE DISTRIBUTION`.
- ECOMAB is the supplier that brings `Amande effilée`, `Amande hachée`, and `Amande poudre`. Product schemas that need those materials should use the ECOMAB-linked materials, not DIVERS/BELDI duplicates.

Historical grouping decisions existed, but do not apply them blindly without checking the latest import scripts and user corrections:

- `Amande` -> `Amande noire`
- `Beurre` -> `Beurre spécial`
- `Gélatine` -> `Gélatine poudre`
- `Farine` -> `Farine viennoiserie`
- `Huile` -> `Huile végétale`
- `Lait liquide` -> `Lait`
- `Nappage normal` + `Nappage` -> `Nappage simple`
- `Vanille poudre` + `Vanille` -> `Poudre vanille`
- `Confiture Zakia` -> `Confiture`
- `Bicarbonate de soude` -> `Bicarbonate`
- `Levure` -> `Levure ideal`
- `Pectine` -> `Pectine NH`

Later Boulangerie correction from the user supersedes generic normalization for that import:

- Raw material names copied from the Boulangerie file should stay as the user entered them in the database.
- `méliorant de Panification IBIS` / `IBIS` must not be renamed to generic `Améliorant`.
- `SESAME BLANC` must stay `SESAME BLANC`.
- Only `BEURRE SPECIAL` should map/change to `Beurre`.

Semi-finished items found in raw-material columns should not automatically become raw materials:

- `nougat amande`, `Pate bastille`, and `Pate noisette` are examples.
- If such an item has a fabrication recipe, treat it as semi-finished.
- If it has no recipe, leave it without components instead of inventing raw components.

## Supabase SQL and Import Flow

The user often runs SQL manually in the Supabase dashboard. Prefer giving a direct SQL script or exact script path/order over a complex explanation.

Current clean-import direction:

1. Run schema/migrations as needed.
2. If intentionally wiping business data, run `supabase/scripts/reset_traceability_business_data.sql`.
3. Insert unified suppliers and raw materials with `supabase/scripts/01_insert_unified_suppliers_and_raw_materials.sql`.
4. Insert clean production products and schemas with `supabase/scripts/02_insert_clean_production_products_and_schemas.sql`.
5. Verify with scripts such as:
   - `supabase/scripts/03_verify_clean_production_import.sql`
   - `supabase/scripts/03_verify_casabianca_products_and_schemas.sql`
   - `supabase/scripts/08_verify_boulangerie_products_and_schemas.sql`

Older scripts such as the first BELDI/DIVERS imports are historical. Use the clean unified scripts unless the user specifically asks for a surgical repair.

Known direct repair scripts include:

- `supabase/scripts/fix_creme_caramel_raw_material.sql`
- `supabase/scripts/add_delete_product_catalog_item_function.sql`

Do not assume every SQL script is idempotent. Inspect before telling the user to rerun. Some scripts are written with `on conflict`, delete-and-reinsert, or active-schema replacement patterns, but this varies.

## User Audit Tracking

The user wants a full tracking system:

- Who validated a reception?
- Who created a schema?
- Who modified a schema?
- Who confirmed production lots?
- Who created/updated important records?

Migration:

- `supabase/migrations/016_user_audit_tracking.sql`

This migration is large and intended to be run as a full migration. It adds audit/profile infrastructure and audited RPC replacements. The user previously hit:

```text
column pb.traceability_snapshot does not exist
```

The migration was then adjusted to include the missing `production_batches.traceability_snapshot` column. If this error reappears, inspect the migration around production batch/view sections.

Audit concepts:

- `profiles`
- `audit_logs`
- `created_by`
- `updated_by`
- `validated_by`
- `confirmed_by`
- `schema_updated_by`
- view columns such as `*_by_name` and `*_by_email`

`traceabilityApi.ts` has fallback behavior when audit columns/views are missing, so the app may partially work before this migration, but full tracking requires the migration and compatible RPCs/views.

If the app becomes a black screen right after login, suspect a frontend runtime exception from a schema/view mismatch. `loadSupabaseData()` generally catches Supabase load failures, so a blank shell often means a render-time error rather than a normal Supabase status error.

## Lot Codification

Production lot formula:

```text
PBC + ZONE + PRODUCT_CODE + "-" + DDMMYY
```

The implementation lives in `src/lib/productionLotCodification.ts`.

Category zones:

- `boulangerie` -> `PBC01`
- `cake` -> `PBC02`
- `patisserie` -> `PBC02`
- `beldi` -> `PBC03`
- `viennoiserie` -> `PBC04`

The file contains many aliases and misspelling mappings. Do not casually delete them. They exist because source Word files and manual imports used inconsistent spelling.

Important examples:

- `Pate Viennoiserie` should resolve to `PV`.
- `nouga`/`nougat` mismatches caused missing codifications, so aliases for both forms matter.
- Product-level database fields `lot_zone` and `lot_code` override built-in mappings.

If a product cannot generate a lot, the UI shows:

```text
Impossible de generer le lot: categorie ou codification manquante.
```

Debug this by checking:

1. Product type/category.
2. `lot_zone` / `lot_code` stored on the product.
3. Alias mapping in `productionLotCodification.ts`.
4. Accent/case/name mismatch.

## Reception Workflow

Reception has two main screens:

- Reception history.
- New reception entry.

Reception history:

- The history table is grouped by supplier name and date into one row.
- In grouped rows, display only the first reception lot.
- Do not show a list of every grouped reception lot.
- Do not show labels like `3 receptions groupees`.
- The detail widget below shows articles for the selected group.
- Rows use checkboxes for selecting receptions to include in reception PDF.
- The checkbox design should match the production history checkbox style.

New reception entry:

- Supplier catalogue is on the left.
- Reception parameters and received articles are on the right.
- `Heure` option was removed from reception parameters.
- `DLC / DLUO` column was removed from received articles.
- Product code was removed from supplier catalogue where requested.
- `Articles Receptionnes` should use the same custom table design as `Table des produits`.
- Quantity input has no spinner/counter.
- Double-clicking a product in the catalogue adds it to received articles and focuses the quantity field.
- Pressing Enter moves to the next field, supporting keyboard-only entry.
- Row deletion is by selecting the row and pressing Delete/Canc.
- There is no permanent floating confirm button. It was temporarily added to unblock a save issue, then removed.
- If many rows make the confirm button unreachable, fix layout/scroll containment rather than adding permanent floating UI unless the user asks again.

## Reception PDF

Generator:

- `src/lib/receptionQualityPdf.ts`

Rules:

- Based on `Fiche de réception controle qualite.docx`.
- Only checked reception history rows are included.
- PDFs save to Downloads subfolder `tracabilite reception`.
- `Date d'application` must be `13/07/2026`.
- Header rows need a visible background in light theme/generated output.

## Suppliers Workflow

Suppliers screen:

- Supplier details widget must have an internal scrollbar.
- `Matieres premieres associees` has a searchbar.
- Associated materials table should not show the raw product code.
- Details widget edit button was removed.
- `Ajouter une matiere` uses a small green `+` icon button.
- In `Ajouter une matiere` popup:
  - Remove the `Fermer` button.
  - Unit combobox must be able to render/open outside the popup bounds.

Raw material edit/migration:

- Associated materials have a three-dots action menu with `Modifier` and `Detacher`.
- Edit modal includes supplier selector.
- Changing supplier automatically detaches from old supplier and links to new supplier.
- Data layer function: `updateRawMaterialCatalogItem` in `traceabilityApi.ts`.

## Fabrication Workflow

Main screen:

- `Table des produits` should not show `code` column.
- It should show a `categorie` column.
- Product search should search by product name only.
- Search must be accent-insensitive, so typing `e` finds names containing `é`.
- Existing helper: `src/lib/productSearch.ts`.

Product type filters:

- Earlier type tabs were removed/replaced by a search/filter bar.
- Do not re-add type tabs unless asked.

Product-table filter bar:

- Suggestions should show options only, without labels like `Colonnes de la table` or `Composants`.
- Remove filter action should use a proper remove icon, not plain `x` text.
- Returning from diagram workspace should preserve the applied filter.
- `Colonnes` and `+ Produit` buttons were removed as useless in that context.
- Type suggestions: `Matiere premiere`, `Semi-fini`, `Produit fini`.
- Recette/nomenclature suggestions are direct options such as active/missing/not-required states.
- Derniere modification opens a calendar dropdown styled like the app dropdown.
- Selecting a suggestion closes the dropdown.
- Opening a new filter closes the previous dropdown.
- Removing all filters closes open dropdowns.
- For Type, Recette, and Derniere modification, Backspace removes the entire selected option, not one letter at a time.

Important caution:

- The user recently asked to undo a previous "Creer button / finished tab in products sidebar / configuration placeholder changes" request. Do not reapply that set of changes unless the user asks again.

## Fabrication Diagram Workspace

File:

- `src/FabricationDiagramWorkspace.tsx`

Rules:

- Uses React Flow.
- Product cards are movable.
- Product sidebar should be closed by default when opening via `Modifier schema`.
- The user can add products/components.
- The user can remove selected product cards or links by pressing Delete/Canc.
- Deletion must show a confirmation popup.
- Configuration sidebar contains product/schema metadata such as name, type, category, lot zone, and lot code.
- Avoid broad layout rewrites; the existing tree/slot layout patterns matter.

Important layout concepts:

- The diagram has a leaf-slot tree pattern to avoid overlapping cards.
- Constants include column gap, row gap, tree gap, and nested offset.
- If imported data looks messy, inspect and reuse this tree layout approach instead of inventing a new one.

## Production Workflow

Production screen has evolved heavily. Check current code before changing UI, but the intended user model is:

- Left widget: `Catalogue des recettes`.
- Right side can show confirm-lots view, production history, preview, or schema depending current state.

`Catalogue des recettes`:

- Cards show product name, type, category, component count, and status.
- Cards should not show product code or unit.
- Search by recipe/product name.
- Semi-finished cards can show a small icon/popover listing products whose active schema contains that component. This acts like a component usage filter.

Confirm-lots view:

- Topbar includes:
  - Product name.
  - Generated lot or `Lot non genere`.
  - `Date de production` calendar.
  - Optional `Fabrique par` field.
  - `Retour`.
  - `Confirmer les lots`.
- The topbar should be clean and not stacked awkwardly. If options crowd, improve grouping/spacing rather than cramming more buttons.
- `Exporter PDF` was removed from the confirm-lots topbar.
- A small green dot indicator should appear near/above the confirm button if the same product with the same production date already exists in history.
- Changing production date should update the generated product lot without reloading all component rows/lots unless the workflow truly requires it. The user explicitly questioned unnecessary reloads.
- Confirming lots should keep the user on the same screen, not jump back to history.
- Duplicate production confirmations are allowed.
- `Eau` is an exception: production can be confirmed even if water has no selected lot.

Confirm-lots table:

- Column name is `Lot`, not `Lot fournisseur`.
- For lot display, only the lot number is bold. Separator `|` and date are normal font.
- If a raw material has no lot, keep the PDF lot cell empty.
- Raw material type badges are blue.
- Semi-finished badges are orange.
- Finished badges are green.
- Semi-finished components with their own schema are collapsible; their child rows appear below.
- Child rows must use `Lot` semantics too, not `Lot interne` as a visible mistake.

Production history:

- The user wanted a more useful UX:
  - The right details area can act as production history table.
  - Each history row has a right-arrow button.
  - Clicking it smoothly swipes from the history table to the preview/schema detail.
  - The older left history widget acts as a workspace.
  - Double-clicking a history row adds it to the workspace.
  - Workspace actions such as PDF export apply only to items in the workspace.
- The user later changed their mind about deletion: do not add a remove/delete action to production history unless they ask again.
- There is a checkbox-selection mode in product history. Its toggle uses a trash/dumpster icon and light red style, and checkboxes are red.

## Production Traceability Diagram

File:

- `src/ProductionTraceabilityDiagram.tsx`

Rules:

- It should use the same shared visual language and tree pattern as fabrication schema diagrams.
- Cards should be movable.
- Cards should have a little space between them, not overlap and not be stretched with huge empty gaps.
- It uses React Flow and the shared `DiagramProductCard`.
- Current important constants include:
  - `DIAGRAM_ROW_GAP`
  - `DIAGRAM_TREE_GAP`
  - `DIAGRAM_NESTED_OFFSET`
- Current zoom should allow zooming out significantly (`minZoom` low, such as `0.05`).
- Link color comes from `var(--diagram-link)` so it can be black in light theme and light in dark theme.
- Production schema can be built from a confirmed batch `traceability_snapshot` or from current schema/component rows.

When new imported data does not follow the leaf-slot pattern, do not immediately blame React Flow. Inspect:

- Whether schema component parent/child links are correct.
- Whether the active schema graph is properly nested.
- Whether the tree layout is counting leaf slots correctly.
- Whether nested semi-finished rows are being treated as ordinary raw leaves.

## Production PDF

Generator:

- `src/lib/productionTraceabilityPdf.ts`

Output:

- Single production PDFs save to Downloads subfolder `tracabilite production`.
- Grouped production PDFs also save to `tracabilite production`.
- Generated files can be opened through Tauri command `open_pdf_file`.
- Alert/window after PDF export should include a remove option.

Common generated folder names must be:

- `tracabilite production`
- `tracabilite reception`

Do not rename these back to earlier folder names.

Header:

- Logo: `src/assets/casablanca-logo.jpg`.
- `Date d'application` must be `13/07/2026`.

Ordering:

- Grouped production PDF tables should be ordered by `date de production`, older to newer.

Table behavior:

- A4 form.
- Header rows need background, including light theme/PDF output.
- Table content font size was increased because the user found it too small.
- Rows should shrink/adapt so the table fits one page when possible.
- Avoid awkward two-page splits when a single A4 table can reasonably fit.
- Observation column should be one merged big cell, not separated per component row.

Dynamic columns:

For finished products with only raw materials:

```text
Produit fini | Matiere Premiere | N° Lot MP | N° Lot PF | Observations/Actions
```

For finished products with semi-finished components:

```text
Produit fini | Produit semi fini | Matiere Premiere | N° Lot MP | N° Lot SF | N° Lot PF | Observations/Actions
```

For semi-finished products:

- Show only the semi-finished product column where there is no finished product column needed.
- If there is an actual nested semi-finished level, use the vertical divider pattern inside the semi-finished column.
- Do not show two semi-finished columns when there is only one semi-finished level.
- If a semi-finished product contains another semi-finished product, separate them with a vertical line, not a `>` character.
- If the same semi-finished name would appear twice, merge the visual area by removing the separating line so the name appears once.
- Remove useless line fragments where there is no nested level.

If a raw-material lot is missing:

- Leave the lot cell empty in the PDF.
- Do not print `A completer`.

## Reception PDF

Generator:

- `src/lib/receptionQualityPdf.ts`

Rules:

- `Date d'application` must be `13/07/2026`.
- Only checked reception rows are included.
- The design follows the user-provided reception quality Word form.
- Save folder is `tracabilite reception`.

## PDF Tauri Commands

File:

- `src-tauri/src/main.rs`

Commands include:

- `save_pdf_to_downloads`
- `open_pdf_file`

The Rust layer sanitizes PDF filenames and subfolders, ensures unique filenames, writes into Downloads, and only opens files with `.pdf` extension.

## UI Design Preferences

The user prefers:

- Practical, operational, dense UI.
- Clean widgets with internal scrollbars.
- No marketing-style pages.
- No unnecessary explanatory text inside the app.
- Consistent app theme and patterns.
- shadcn-like combobox/calendar styling where applicable.
- Small icon buttons where a text button is unnecessary.
- Tables designed for repeated use, scanning, and keyboard workflows.
- Smooth but restrained animations.

Avoid:

- Big decorative UI changes not asked for.
- Adding extra helper labels the user did not request.
- Reintroducing removed buttons.
- Overly wide cards or nested card-in-card layouts.
- Making a small change and accidentally redesigning a screen.

## Loader History

The user provided `loading.lottie` and briefly asked for centered screen-switch loading. They later asked to revert the centered loader over the main content. Do not reintroduce a screen-switch overlay loader unless explicitly asked.

A small loader may still exist for local loading states such as schema loading, but the user disliked extra text like `Chargement...` beside it.

## Search and Accent Handling

The user specifically asked that catalogue/product search should:

- Search product name only.
- Be accent-insensitive.
- Let typing `e` find names containing `é`.

The helper in `src/lib/productSearch.ts` normalizes strings by:

- Unicode NFD normalization.
- Removing diacritics.
- Lowercasing.
- Trimming.

If search feels slow:

- Avoid re-querying Supabase on each keystroke if data is already loaded.
- Keep input state responsive and defer expensive filtering.
- Do not use a debounce in a way that drops fast-typed letters. This happened once with `amande` becoming `aande`.

## Known Encoding Hazard

Some terminal output may display mojibake such as `CrÃ¨me` or `GlaÃ§age`. This can be a console encoding issue, but sometimes source/import files may actually contain broken text.

Before changing accented product/material names:

1. Inspect the file in context.
2. Check the database/source script.
3. Preserve user-intended display names.
4. Use accent-insensitive matching for search, not destructive accent removal for display names.

## Build and Release Rules

When building a new installer:

1. Bump version in all relevant files:
   - `package.json`
   - `package-lock.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
2. Run:

```powershell
npm.cmd run tauri build -- --bundles nsis
```

3. Confirm the generated installer path and version.

Known harmless warning:

- Vite may warn about large chunks. This has not blocked builds.

If the installer appears old:

- Check that all version files were bumped.
- Check the output folder for the newest timestamp.
- Make sure the command included `--bundles nsis`.

## Git and Protection

Git is enabled for the project. The user asked whether corrupted files can be restored and then enabled Git tracking.

Future agents must:

- Never run destructive git commands unless explicitly asked.
- Never revert user changes.
- Inspect `git status` before large work.
- Preserve unrelated modifications.
- Commit only when the user asks.

## Current Important SQL Scripts

The scripts folder has many historical and repair scripts. Do not assume the newest numbered script is safe to run without reading it.

Scripts mentioned frequently:

- `supabase/scripts/reset_traceability_business_data.sql`
- `supabase/scripts/01_insert_unified_suppliers_and_raw_materials.sql`
- `supabase/scripts/02_insert_clean_production_products_and_schemas.sql`
- `supabase/scripts/03_verify_clean_production_import.sql`
- `supabase/scripts/03_verify_casabianca_products_and_schemas.sql`
- `supabase/scripts/08_verify_boulangerie_products_and_schemas.sql`
- `supabase/scripts/fix_creme_caramel_raw_material.sql`
- `supabase/scripts/add_delete_product_catalog_item_function.sql`
- `supabase/migrations/016_user_audit_tracking.sql`

When the user gets SQL errors like:

```text
relation "..._input" does not exist
```

It often means the script depended on a temp/work table or earlier CTE/setup that was not included. The user prefers a direct standalone script.

## User Communication Preferences

The user values:

- Directness.
- Practical fixes.
- No over-engineering.
- Exact file/script paths.
- Exact SQL script order.
- UI changes that stay tightly scoped.
- Explanations of why a data issue happened before making fixes.

The user dislikes:

- Indirect or overcomplicated SQL workflows when a direct fix script would do.
- Rebuilding a UI beyond the requested scope.
- Reintroducing UI elements they removed earlier.
- Generic suggestions when they asked for concrete implementation.

When uncertain, ask a focused question. When the request is clear, implement.

## Recent State Snapshot

At the time this file was last updated:

- App version: `0.1.18`.
- Current installer path:
  `C:\Users\user\myprojects\solution traçabilité\src-tauri\target\release\bundle\nsis\Tracability OS_0.1.18_x64-setup.exe`
- The app uses a custom Node Schema Cherry logo generated from `app-icon.png` (a user-approved design: a green circle with a Y-shaped stem on dark background, representing cherry + schema nodes).
- All icon sizes were generated via `npm run tauri icon app-icon.png` and placed in `src-tauri/icons/`.
- `tauri.conf.json` now includes a `"bundle"` section with `"icon"` array and `"targets": ["nsis"]`.
- `public/favicon.ico` is a copy of the generated `icon.ico` for the web/Vite favicon.
- `index.html` includes `<link rel="icon" type="image/x-icon" href="/favicon.ico" />`.

Recent UI changes included:

- **Exported row highlighting**: Production history and reception history table rows that have been exported (PDF generated) are highlighted in blue using CSS class `exported-row`.
- **Production history selection toggle** uses a trash/dumpster icon with light red styling. Checkboxes are red.
- **Lots & Traçabilité screen** built (see dedicated section below).
- **Planification screen** set to empty "coming soon" mode using `<EmptyModule>` (see dedicated section below).

Recent audit/security work included:

- User audit tracking migration `016_user_audit_tracking.sql`.
- `traceability_snapshot` column issue fixed in migration context.

Recent PDF rules included:

- Production and reception `Date d'application` fixed to `13/07/2026`.
- PDF export alert should include remove option.
- Production PDF export button removed from confirm-lots widget topbar.

Recent production behavior included:

- Duplicate lot confirmations allowed.
- Water lot exception allowed.
- Confirming lots should keep the user in the same screen.

## Lots & Traçabilité Screen

View ID: `"traceability"`.
Component: `TraceabilityModule` in `src/App.tsx` (around line 5523).
Sidebar nav item: `{ id: "traceability", label: "Lots & traçabilité", icon: "boxes" }`.

### Purpose

A global registry and lot history viewer for all products and raw materials. Shows a single big table with filterable data about every product in the system.

### Table Columns

| Column | Description |
|--------|-------------|
| Produit | Product name |
| Type | Product type (Matiere premiere, Semi-fini, Produit fini) |
| Catégorie | Product category |
| Composants | Number of components in the product's active schema |
| Confirmé / Réceptionné | Count of how many times the product was confirmed (production) or recepted (raw material). Shows just the number, no "livraison(s)" or "confirmation(s)" text |
| Lot | Dropdown showing lot history. Displays last 5 lots visible with scrolling for more. Uses same lot dropdown pattern as confirm-lots screen |
| R.Q | Name of the user who confirmed or recepted |

### Design

- Uses the same table design as the fabrication screen's `Table des produits`.
- Implements the same filtering searchbar that the fabrication table has (column filters with type/category/component suggestions).
- **No header text**: The descriptive subtitle "Registre global et historique des lots par produit et matière première" was removed per user request. The screen goes straight to the filter bar and table.

### Data Sources

- `fetchLotHistoryForProduct()` in `traceabilityApi.ts` fetches lot history for each product (up to 50 lots).
- Confirmation/reception counts are calculated from `productionBatches` and `receptionBatches` props.
- Raw material reception counts use `receptionBatches` by counting how many batches contain the raw material in their items.

### Known Fix

- Raw materials initially all showed `50 livraison(s)` because the count logic was incorrectly counting all reception batches instead of only those containing the specific raw material. Fixed by filtering `receptionBatches` to only count batches where `batch.items.some(item => item.productId === product.id)`.

## Legacy Planification Notes (Obsolete)

The following subsection documents the abandoned localStorage auto-confirm prototype. It is retained only as historical context. It is not the current Planification implementation and must not be reconnected to the runtime.

View ID: `"planification"`.
Component: `PlanificationModule` in `src/App.tsx` (around line 5916).
Sidebar nav item: `{ id: "planification", label: "Planification", icon: "calendar" }`.

### Current State

The Planification screen is currently in **empty/coming-soon mode**. The `PlanificationModule` component returns `<EmptyModule activeView={activeView} />` which shows an empty state with just the nav label. The user explicitly requested: "dont add anything just keep the screen empty."

### Backend Engine (Built but Hidden)

The scheduler engine and resolver are fully implemented but not exposed in the UI:

- `src/lib/schedulerEngine.ts`: Types (`ScheduledRule`, `ExecutionLog`, `AutomationNotification`, `ScheduleFrequency`) and date/interval calculation functions (`computeNextRunAt`, `findDueRules`, `formatFrequencyLabel`).
- `src/lib/schedulerResolver.ts`: Bottom-up recipe tree lot resolver algorithm. Executes a scheduled rule by resolving the product's recipe tree, finding the latest lots for each component, and calling `createProductionWithTraceability`.

### Algorithm Design Decisions (User-Approved)

These decisions were confirmed through a Q&A with the user:

1. **Scope**: Production confirmation only (not reception). Example: "Baguette ancienne" (produit fini) gets produced every day, so the user sets it to auto-confirm daily. Its semi-fini "pate special" is produced every 2 days, so pate special lot 1 feeds into Baguette ancienne lots 1 and 2.
2. **Missing lot handling**: Skip the auto-confirmation and notify the user with a warning (option A). Do not auto-confirm without lots.
3. **Lot code generation**: Auto-generated using existing codification rules in `productionLotCodification.ts`.
4. **Responsible name**: `"Planification auto"` (hardcoded in the resolver).
5. **Frequency options**: `daily`, `weekdays`, `every_n_days`, `specific_days`.

### State Storage

Scheduler state is stored in `usePersistentState` (localStorage):

- `planification.rules`: `ScheduledRule[]`
- `planification.logs`: `ExecutionLog[]`
- `planification.notifications`: `AutomationNotification[]`

The `AppShell` component has a `useEffect` that checks for due rules on mount and runs them automatically, posting notifications.

## Planification (Current Supabase Implementation)

View ID: `"planification"`.

Primary files:

- `src/App.tsx`: `PlanificationModule` and integration with the existing Production Confirm Lots workflow.
- `src/lib/planningEngine.ts`: date-only recurrence expansion and child-occurrence matching.
- `src/lib/traceabilityApi.ts`: plan, dependency, lot, confirmation-context, cancellation, and refresh API helpers.
- `supabase/migrations/020_production_planification.sql`: database schema, validation, RLS, derived statuses, and RPCs.
- `supabase/scripts/verify_production_planification.sql`: read-only post-migration verification.
- `tests/planningEngine.test.ts`: focused recurrence and dependency-date tests.

### Core Workflow

- Planning is date-only. No time-of-day is stored or displayed.
- Confirmation is always manual. The planner never creates a production batch automatically.
- A finished or semi-finished product can be planned only when it has an active recipe.
- Every mandatory raw-material dependency must have a concrete eligible lot for the planned date. `Eau` is the only no-lot exception.
- Every required semi-finished dependency must resolve to a compatible production plan dated on or before the parent occurrence.
- A child planned every two days can serve daily parent occurrences through the latest compatible child occurrence.
- Plan creation is atomic: series, occurrences, and all dependency reservations are written by one security-definer RPC.
- Confirming a ready/overdue plan opens the existing Production Confirm Lots screen with the planned date, substitutions, and lots preselected.
- Production confirmation and plan completion are committed atomically by `create_production_with_traceability_v3`.
- Ad-hoc production confirmation remains supported and does not require a plan.

### Recurrence

Supported frequencies:

- One time.
- Daily.
- Weekdays.
- Every N days.
- Specific weekdays.

The default planning horizon is 14 calendar days. The hard maximum is 90 calendar days.
Nested semi-finished products can use their own cadence, including their own selected weekdays.

### Status Model

Stored statuses are `planned`, `completed`, and `cancelled`.
The database derives operational statuses:

- `blocked`: a raw lot is unavailable/expired, or a nested dependency is invalid.
- `waiting`: at least one required semi-finished plan has not been completed.
- `ready`: every dependency is usable.
- `overdue`: the planned date has passed.
- `recipe_changed`: the active recipe no longer matches the stored recipe snapshot.
- `completed`.
- `cancelled`.

Blockers propagate through nested semi-finished plans. Completed plans are immutable. A child plan referenced by an active parent cannot be cancelled.

### UI

The screen uses two operational widgets:

- Left: searchable/filterable occurrence list with status indicators.
- Right: date-only visual timeline showing raw lots in blue, semi-finished productions in orange, and finished products in green.

The creation dialog expands the full recipe tree, lets each semi-finished dependency use its own recurrence, blocks unresolved plans, and shows an editable review of the exact reserved raw lots and child productions before saving.

### Security and Audit

- Tables use RLS and expose authenticated read access only.
- Writes go through authenticated security-definer RPCs.
- `created_by`, `updated_by`, `completed_by`, and `cancelled_by` use the existing traceability profile/audit system.
- Creation, refresh, cancellation, and completion write traceability events.

### Deployment

Run the complete `supabase/migrations/020_production_planification.sql` migration once after migration 019, then run `supabase/scripts/verify_production_planification.sql`.
The migration has not been executed merely by building the desktop app; it must be applied to the Supabase project separately.

## Production PDF Fixes (This Session)

### Component Ordering Fix

**Problem**: Components in the PDF table were listed in random order (whatever Supabase returned). Semi-finished children and raw materials were not consistently ordered.

**Fix**: Added `sortComponentsOrder` helper function that sorts components so semi-finished items appear first, then raw materials, at every level of the tree. Applied in all walk functions, root iteration loops, saved snapshots, and consumption detail fallback paths.

**Location**: `src/lib/productionTraceabilityPdf.ts`, around line 69.

### DF Label Removal

**Problem**: The user asked to remove "DF" and "1 production(s) selectionnee(s)" from the PDF header.

**Fix**: Removed the info line from `drawBatchDocumentHeader`. Changed `DF :` labels to `Date de production :` in `drawDocumentHeader`. Removed the selection count text entirely.

### Empty Semi-Finished Cell Merging

When a semi-finished product contains only raw materials (no nested semi-finished), the empty semi-finished cells in the PDF table are merged into a single grouped empty cell rather than showing individual empty cells for each row.

## Reception PDF Fixes (This Session)

### Temperature and Hygiene Column Fix

**Problem**: The 'Température de transport' and 'Hygiène/Propreté' columns showed separating lines visible inside their cells.

**Fix**: Adjusted the cell rendering in `receptionQualityPdf.ts` to eliminate internal dividing lines within merged header cells.

## Lot Dropdown Changes (This Session)

- Lot dropdown in confirm-lots screen now suggests the **last 5 lots** (up from 3).
- Lot dropdown shows **date only** (removed time component from the display).

## App Icon and Logo

### Logo Selection Process

Multiple logo concepts were generated and presented to the user:
1. Various complex designs (rejected as "too complicated for an icon").
2. Ultra-simple designs including "Y-Stem" and "3-Dot Cherry" concepts.
3. The user selected the **Node Schema Cherry** concept: a large green circle at the bottom (cherry) connected to two smaller circles at the top via a Y-shaped stem (schema nodes), on a dark charcoal background.

### Implementation

- Source image: `app-icon.png` in project root (copied from the user-approved generated image `media__1784925021798.png`).
- Icon generation: `npm run tauri icon app-icon.png` generates all required sizes in `src-tauri/icons/`.
- Favicon: `public/favicon.ico` is a copy of `src-tauri/icons/icon.ico`.
- `index.html` includes the favicon link tag.

### Critical Build Note: Bundle Icon Configuration

In Tauri v2, if `tauri.conf.json` does not include a `"bundle"` section with an `"icon"` array, the build will embed the **default Tauri logo** (yellow/teal geometric shape) instead of the custom icons in `src-tauri/icons/`. This was the root cause of the desktop shortcut still showing the Tauri logo after initial builds.

The fix was adding to `tauri.conf.json`:

```json
"bundle": {
  "active": true,
  "targets": ["nsis"],
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]
}
```

## Build and Release Rules

When building a new installer:

1. Bump version in all three files (must be in sync):
   - `package.json` (`"version"`)
   - `src-tauri/tauri.conf.json` (`"version"`)
   - `src-tauri/Cargo.toml` (`[package] version`)
2. Run:

```powershell
npx.cmd tauri build
```

3. Confirm the generated installer path and version.
4. The `"bundle"` section in `tauri.conf.json` with `"targets": ["nsis"]` and `"icon"` array handles NSIS bundling and custom icon embedding automatically. No need for `-- --bundles nsis` flag when the config specifies it.

Note: `package-lock.json` and `src-tauri/Cargo.lock` update automatically during the build process.

Known harmless warning:

- Vite may warn about large chunks. This has not blocked builds.

If the installer appears to have the wrong icon:

- Check that `tauri.conf.json` has the `"bundle" > "icon"` array.
- Verify `src-tauri/icons/icon.ico` is the custom icon (not the default Tauri icon).
- Windows may cache old icons. Bumping the version and reinstalling forces a cache refresh.

## Git and Protection

Git is enabled for the project. The user asked whether corrupted files can be restored and then enabled Git tracking.

Future agents must:

- Never run destructive git commands unless explicitly asked.
- Never revert user changes.
- Inspect `git status` before large work.
- Preserve unrelated modifications.
- Commit only when the user asks.

## Current Important SQL Scripts

The scripts folder has many historical and repair scripts. Do not assume the newest numbered script is safe to run without reading it.

Scripts mentioned frequently:

- `supabase/scripts/reset_traceability_business_data.sql`
- `supabase/scripts/01_insert_unified_suppliers_and_raw_materials.sql`
- `supabase/scripts/02_insert_clean_production_products_and_schemas.sql`
- `supabase/scripts/03_verify_clean_production_import.sql`
- `supabase/scripts/03_verify_casabianca_products_and_schemas.sql`
- `supabase/scripts/08_verify_boulangerie_products_and_schemas.sql`
- `supabase/scripts/fix_creme_caramel_raw_material.sql`
- `supabase/scripts/add_delete_product_catalog_item_function.sql`
- `supabase/migrations/016_user_audit_tracking.sql`

When the user gets SQL errors like:

```text
relation "..._input" does not exist
```

It often means the script depended on a temp/work table or earlier CTE/setup that was not included. The user prefers a direct standalone script.

## User Communication Preferences

The user values:

- Directness.
- Practical fixes.
- No over-engineering.
- Exact file/script paths.
- Exact SQL script order.
- UI changes that stay tightly scoped.
- Explanations of why a data issue happened before making fixes.

The user dislikes:

- Indirect or overcomplicated SQL workflows when a direct fix script would do.
- Rebuilding a UI beyond the requested scope.
- Reintroducing UI elements they removed earlier.
- Generic suggestions when they asked for concrete implementation.

When uncertain, ask a focused question. When the request is clear, implement.

## Safe Working Approach for Future Agents

Before code edits:

1. Read this file.
2. Run `git status --short`.
3. Read the specific files involved.
4. Prefer small patches.
5. Build or run targeted checks when possible.

Before SQL/data edits:

1. Identify whether the user wants inspection, direct script, or automatic execution.
2. Do not assume current Supabase data is production data unless the user says so.
3. Preserve exact material names when the user has explicitly corrected them.
4. Check supplier links.
5. Check active schemas and component links.
6. Provide verification SQL after repair scripts.

Before release builds:

1. Ensure latest requested code changes are included.
2. Bump all three app version files consistently (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`).
3. Run the Tauri build.
4. Report the exact generated installer path.

## Things That Look Strange but Are Intentional

- Some codification aliases look redundant or misspelled. They handle real imported names.
- Raw materials can be supplier-specific.
- Duplicate production confirmations are allowed.
- `Eau` can be confirmed without a lot.
- Production PDF table columns are dynamic and depend on nested product type structure.
- The production schema view can render from a saved batch snapshot or current schema.
- Search should be accent-insensitive but display names should keep accents.
- The app may keep direct Supabase anon access on the client; security hardening relies on RLS/RPC policies in Supabase.
- Planification screen is intentionally empty. The scheduler engine code exists but is hidden.
- `app-icon.png` in the project root is the source icon image. Do not delete it; it's needed for regenerating Tauri icons.

## Things to Avoid

- Do not re-run import scripts without checking idempotency.
- Do not rename raw materials just because they look like duplicates.
- Do not import recipes before raw materials/suppliers are unified.
- Do not add permanent floating action buttons unless asked.
- Do not re-add removed `Exporter PDF` in confirm-lots topbar.
- Do not re-add product code/unit to recipe cards.
- Do not re-add `code` column to `Table des produits`.
- Do not reintroduce type tabs in `Table des produits`.
- Do not reintroduce centered screen-switch loader.
- Do not make production confirmation navigate away after confirm.
- Do not block confirmation only because the same product/date already exists.
- Do not block confirmation because `Eau` has no lot.
- Do not add UI or features to the Planification screen. Keep it empty until the user asks to activate it.
- Do not add "livraison(s)" or "confirmation(s)" text next to counts in the Lots & Traçabilité table.
- Do not add a descriptive subtitle header to the Lots & Traçabilité screen.
- Do not remove the `sortComponentsOrder` helper from the PDF generator. It ensures consistent semi-finished-first ordering.
- Do not remove the `"bundle"` configuration from `tauri.conf.json`. Without it, the app reverts to the default Tauri icon.
