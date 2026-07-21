from __future__ import annotations

import csv
import importlib.util
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parents[1]
AUDIT_DIR = PROJECT_ROOT / "tmp" / "raw_material_supplier_audit"
RAW_PLAN_FILE = AUDIT_DIR / "reviewed_final_raw_materials.csv"
REVIEW_PLAN_FILE = AUDIT_DIR / "reviewed_raw_material_supplier_plan.csv"
OUTPUT_RAW_SQL = SCRIPT_DIR / "01_insert_unified_suppliers_and_raw_materials.sql"
OUTPUT_PRODUCTS_SQL = SCRIPT_DIR / "02_insert_clean_production_products_and_schemas.sql"
OUTPUT_VERIFY_SQL = SCRIPT_DIR / "03_verify_clean_production_import.sql"
BELDI_RECIPE_FILE = Path.home() / "Downloads" / "Fiche Beldi.docx"
LOT_CODIFICATION_FILE = PROJECT_ROOT / "src" / "lib" / "productionLotCodification.ts"


RECIPE_FILES = {
    "Bombe d amoure.docx": "patisserie",
    "BROWNIE NOISETTE.docx": "cake",
    "cake americain.docx": "cake",
    "CAKE GR CHOCO VANILLE PROD.docx": "cake",
    "CAnnelle.docx": "patisserie",
    "COOKIES AMR PISTACHE.docx": "cake",
    "fich prod fondo chocolat.docx": "cake",
    "Fiche de production des cremes.docx": "patisserie",
    "FICHE PROD BROWNIE NOIX.docx": "cake",
    "fiche prod les tartes.docx": "cake",
    "FICHE PRODUCTION PATE SABLE.docx": "patisserie",
    "Fiche production viennoiserie.docx": "viennoiserie",
    "honey cake.docx": "cake",
    "les eclaire.docx": "patisserie",
    "les glacages.docx": "patisserie",
    "MACARON PRODUCTION.docx": "patisserie",
    "madelin-financier.docx": "cake",
    "MILLE FEILLE VANILLE CHOCO.docx": "patisserie",
    "Noisella.docx": "patisserie",
    "Paris breste.docx": "patisserie",
    "POP CAKE.docx": "cake",
    "production cake dattes.docx": "cake",
    "PRODUCTION FUILLTAGE.docx": "viennoiserie",
    "RED VEL VET.docx": "patisserie",
    "Soiree.docx": "patisserie",
    "tarte amande noix pomme.docx": "cake",
    "tromp leile.docx": "patisserie",
}


def load_pastry_generator():
    path = SCRIPT_DIR / "generate_pastry_import_sql.py"
    spec = importlib.util.spec_from_file_location("pastry_import_generator", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("\xa0", " ")).strip()


def key(value: str | None) -> str:
    normalized = clean(value).lower().replace("œ", "oe")
    normalized = unicodedata.normalize("NFKD", normalized)
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.replace("?", " ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", normalized)).strip().upper()


def strip_supplier_suffix(value: str) -> str:
    return clean(re.sub(r"\([^)]*\)", "", value).strip(" -–—:;"))


def sql_text(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def values_sql(rows: list[tuple[str, ...]]) -> str:
    return ",\n".join("  (" + ", ".join(sql_text(value) for value in row) + ")" for row in rows)


def supplier_code(name: str) -> str:
    code = re.sub(r"[^A-Z0-9]+", "-", key(name)).strip("-")
    return code or "SUPPLIER"


def read_raw_plan() -> list[dict[str, str]]:
    if not RAW_PLAN_FILE.exists():
        raise SystemExit(f"Missing raw material plan: {RAW_PLAN_FILE}. Run review_production_raw_material_suppliers.py first.")
    with RAW_PLAN_FILE.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def read_review_plan() -> tuple[dict[str, str], set[str]]:
    if not REVIEW_PLAN_FILE.exists():
        raise SystemExit(f"Missing review plan: {REVIEW_PLAN_FILE}. Run review_production_raw_material_suppliers.py first.")

    raw_aliases: dict[str, str] = {}
    semi_finished_aliases: set[str] = set()
    with REVIEW_PLAN_FILE.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            action = clean(row.get("action"))
            source = strip_supplier_suffix(row.get("source_material", ""))
            canonical = clean(row.get("canonical_material"))
            variants = [strip_supplier_suffix(value) for value in row.get("source_variants", "").split(";") if clean(value)]
            names = [source, *variants]
            if action == "raw_material":
                for name in names:
                    raw_aliases[key(name)] = canonical
            elif action == "semi_finished":
                for name in names:
                    semi_finished_aliases.add(key(name))
    return raw_aliases, semi_finished_aliases


def infer_unit(name: str, gen) -> str:
    overrides = {
        key("Eau"): "L",
        key("Eau de fleur"): "L",
        key("Huile"): "L",
        key("Lait"): "L",
    }
    return overrides.get(key(name), gen.infer_unit(name))


def parse_typescript_code_block(source: str, block_name: str) -> dict[str, str]:
    match = re.search(rf"{re.escape(block_name)}[^=]*=\s*\{{(?P<body>.*?)\n\}};", source, re.S)
    if not match:
        return {}

    result: dict[str, str] = {}
    for line in match.group("body").splitlines():
        entry = re.match(r'\s*(?:"(?P<quoted>[^"]+)"|(?P<bare>[A-Za-z0-9_]+))\s*:\s*"(?P<code>[^"]+)"', line)
        if entry:
            name = entry.group("quoted") or entry.group("bare")
            result[key(name)] = entry.group("code")
    return result


def parse_beldi_code_overrides() -> dict[str, dict[str, str]]:
    if not LOT_CODIFICATION_FILE.exists():
        return {"finished": {}, "semi_finished": {}}

    source = LOT_CODIFICATION_FILE.read_text(encoding="utf-8")
    category_match = re.search(r"beldi\s*:\s*\{(?P<body>.*?)\n\s*\},\n\s*viennoiserie\s*:", source, re.S)
    finished: dict[str, str] = {}
    if category_match:
        for line in category_match.group("body").splitlines():
            entry = re.match(r'\s*(?:"(?P<quoted>[^"]+)"|(?P<bare>[A-Za-z0-9_]+))\s*:\s*"(?P<code>[^"]+)"', line)
            if entry:
                name = entry.group("quoted") or entry.group("bare")
                finished[key(name)] = entry.group("code")

    return {
        "finished": finished,
        "semi_finished": parse_typescript_code_block(source, "beldiSemiFinishedCodes"),
    }


def ensure_product(
    products: dict[str, dict[str, str | None]],
    gen,
    product_type: str,
    name: str,
    category: str,
    official_code: str | None = None,
) -> str:
    internal_key = gen.product_key(product_type, name)
    existing = products.get(internal_key)
    if existing:
        if official_code and not existing.get("official_code"):
            existing["official_code"] = official_code
        return internal_key

    products[internal_key] = {
        "name": name,
        "type": product_type,
        "category": category,
        "official_code": official_code,
    }
    return internal_key


def append_unique_component(schemas: dict[str, list[str]], target_key: str, component: str) -> None:
    target_components = schemas.setdefault(target_key, [])
    existing = {key(value) for value in target_components}
    if key(component) not in existing:
        target_components.append(component)


def add_beldi_recipes(products: dict, schemas: dict, gen, code_overrides: dict[str, dict[str, str]], semi_aliases: set[str]) -> int:
    if not BELDI_RECIPE_FILE.exists():
        return 0

    finished_codes = code_overrides["finished"]
    semi_codes = code_overrides["semi_finished"]
    document = gen.Document(BELDI_RECIPE_FILE)
    parsed_tables = 0

    for table in document.tables:
        rows = [[clean(cell.text) for cell in row.cells] for row in table.rows]
        if not rows or len(rows[0]) < 2:
            continue

        parsed_type = gen.target_type(rows[0][0])
        if parsed_type is None:
            continue

        header_keys = {key(value) for value in rows[0]}
        table_had_rows = False
        for row in rows[1:]:
            if len(row) < 2:
                continue

            target_name = gen.canonical_product_name(strip_supplier_suffix(row[0]))
            component_name = gen.canonical_product_name(strip_supplier_suffix(row[1]))
            target_key = key(target_name)
            component_key = key(component_name)

            if not target_name or not component_name:
                continue
            if target_key in header_keys or component_key in header_keys:
                continue
            if target_key in {"PRODUIT FINI", "PRODUIT SEMI FINI", "PRODUIT SF", "PF", "PSF"}:
                continue

            if target_key in finished_codes:
                product_type = "finished"
                official_code = finished_codes[target_key]
            elif target_key in semi_codes:
                product_type = "semi_finished"
                official_code = semi_codes[target_key]
            else:
                product_type = parsed_type
                official_code = code_overrides[product_type].get(target_key)

            internal_target_key = ensure_product(products, gen, product_type, target_name, "beldi", official_code)

            component_is_semi = (
                "(PSF" in row[1].upper()
                or component_key in semi_codes
                or component_key in semi_aliases
            )
            if component_is_semi:
                ensure_product(products, gen, "semi_finished", component_name, "beldi", semi_codes.get(component_key))

            if component_key != target_key:
                append_unique_component(schemas, internal_target_key, component_name)
                table_had_rows = True

        if table_had_rows:
            parsed_tables += 1

    return parsed_tables


def raw_material_import_sql(raw_rows: list[dict[str, str]], gen) -> str:
    material_rows = []
    for row in raw_rows:
        material = clean(row["canonical_material"])
        supplier = clean(row["supplier"]).upper()
        material_rows.append((material, supplier, infer_unit(material, gen)))
    material_rows = sorted(set(material_rows), key=lambda item: (item[1].casefold(), item[0].casefold()))

    supplier_rows = sorted({supplier for _, supplier, _ in material_rows}, key=str.casefold)

    return f"""-- Generated by generate_clean_traceability_import_sql.py.
-- Safe to run after reset_traceability_business_data.sql.

begin;

with supplier_input(name) as (
  values
{values_sql([(supplier,) for supplier in supplier_rows])}
)
insert into suppliers (name, is_active)
select name, true
from supplier_input
on conflict (name) do update
set is_active = excluded.is_active;

with material_input(name, supplier_name, unit) as (
  values
{values_sql(material_rows)}
),
inserted_products as (
  insert into products (code, name, type, unit)
  select
    'MP-' || upper(substr(md5(input.name), 1, 12)),
    input.name,
    'raw'::product_type,
    input.unit
  from material_input input
  where not exists (
    select 1
    from products existing
    where existing.type = 'raw'
      and lower(trim(existing.name)) = lower(trim(input.name))
  )
  on conflict (code) do nothing
  returning id, name
),
updated_existing_products as (
  update products
  set unit = input.unit,
      is_active = true,
      updated_at = now()
  from material_input input
  where products.type = 'raw'
    and lower(trim(products.name)) = lower(trim(input.name))
    and (
      products.unit is distinct from input.unit
      or products.is_active is distinct from true
    )
  returning products.id, products.name
),
raw_products as (
  select products.id, products.name
  from products
  join material_input input on lower(trim(input.name)) = lower(trim(products.name))
  where products.type = 'raw'
    and products.is_active = true
  union
  select id, name
  from inserted_products
  union
  select id, name
  from updated_existing_products
),
supplier_links as (
  insert into supplier_raw_materials (supplier_id, product_id)
  select suppliers.id, raw_products.id
  from material_input input
  join suppliers on lower(trim(suppliers.name)) = lower(trim(input.supplier_name))
  join raw_products on lower(trim(raw_products.name)) = lower(trim(input.name))
  on conflict (supplier_id, product_id) do nothing
  returning product_id
)
select
  (select count(*) from material_input) as requested_raw_materials,
  (select count(*) from inserted_products) as newly_created_raw_materials,
  (select count(*) from supplier_links) as newly_created_supplier_links,
  (select count(*) from raw_products) as total_raw_materials_found;

commit;
"""


def canonicalize_recipes(products, schemas, gen, raw_aliases: dict[str, str], semi_aliases: set[str]) -> tuple[dict, dict]:
    semi_finished_by_name = {
        gen.product_name_key(internal_key): internal_key
        for internal_key, product in products.items()
        if product["type"] == "semi_finished"
    }

    updated_schemas: dict[str, list[str]] = {}
    for target_key, components in schemas.items():
        target = products.get(target_key)
        if not target:
            continue

        resolved: list[str] = []
        for component in components:
            base_component = strip_supplier_suffix(component)
            component_key = key(base_component)
            manufactured_name = gen.canonical_product_name(base_component)
            manufactured_key = key(manufactured_name)

            if manufactured_key in semi_finished_by_name:
                resolved.append(str(products[semi_finished_by_name[manufactured_key]]["name"]))
            elif component_key in semi_aliases or manufactured_key in semi_aliases:
                semi_name = manufactured_name
                internal_key = gen.product_key("semi_finished", semi_name)
                products.setdefault(
                    internal_key,
                    {
                        "name": semi_name,
                        "type": "semi_finished",
                        "category": target["category"],
                        "official_code": None,
                    },
                )
                resolved.append(semi_name)
            elif component_key in raw_aliases:
                resolved.append(raw_aliases[component_key])
            elif manufactured_key in raw_aliases:
                resolved.append(raw_aliases[manufactured_key])
            else:
                # Fall back to the legacy aliases for already-confirmed supplier-tagged rows.
                resolved.append(raw_aliases.get(key(gen.canonical_raw_name(base_component)), gen.canonical_raw_name(base_component)))

        unique: dict[str, str] = {}
        for component in resolved:
            component_key = key(component)
            if component_key != gen.product_name_key(target_key):
                unique.setdefault(component_key, component)
        if unique:
            updated_schemas[target_key] = list(unique.values())

    return products, updated_schemas


def build_products_and_schemas(gen, raw_aliases: dict[str, str], semi_aliases: set[str]):
    gen.DOWNLOADS = Path.home() / "Downloads" / "PRODUCTION"
    gen.RECIPE_FILES = {name: category for name, category in RECIPE_FILES.items() if (gen.DOWNLOADS / name).exists()}

    code_by_name, known_semi_finished = gen.parse_codification()
    known_semi_finished.update(gen.key(name) for name in gen.FORCED_SEMI_FINISHED)
    products, schemas = gen.parse_recipes(known_semi_finished)
    gen.apply_context_aliases(products, schemas)
    resolved_schemas, _legacy_raw = gen.resolve_products_and_components(products, schemas, code_by_name, known_semi_finished)
    code_overrides = parse_beldi_code_overrides()
    all_semi_aliases = set(semi_aliases) | set(code_overrides["semi_finished"])
    beldi_table_count = add_beldi_recipes(products, resolved_schemas, gen, code_overrides, all_semi_aliases)
    products, resolved_schemas = canonicalize_recipes(products, resolved_schemas, gen, raw_aliases, all_semi_aliases)
    return products, resolved_schemas, beldi_table_count


def clean_verification_sql(base_sql: str) -> str:
    extra = """
raw_without_supplier as (
  select products.name
  from products
  where products.type = 'raw'
    and products.is_active = true
    and not exists (
      select 1
      from supplier_raw_materials link
      where link.product_id = products.id
    )
),
duplicate_raw_names as (
  select lower(trim(name)) as normalized_name, count(*) as duplicate_count
  from products
  where type = 'raw' and is_active = true
  group by lower(trim(name))
  having count(*) > 1
),
"""
    return base_sql.replace(
        "duplicate_active_recipes as (",
        extra + "duplicate_active_recipes as (",
    ).replace(
        "coalesce((select array_agg(name order by name) from unlinked_divers_materials), array[]::text[]) as raw_materials_not_linked_to_divers,",
        "coalesce((select array_agg(name order by name) from raw_without_supplier), array[]::text[]) as raw_materials_without_supplier,\n"
        "  coalesce((select array_agg(normalized_name || ' (' || duplicate_count || ')' order by normalized_name) from duplicate_raw_names), array[]::text[]) as duplicate_raw_names,",
    ).replace(
        "unlinked_divers_materials as (",
        "legacy_unlinked_divers_materials as (",
    )


def main() -> None:
    gen = load_pastry_generator()
    raw_rows = read_raw_plan()
    raw_aliases, semi_aliases = read_review_plan()
    products, schemas, beldi_table_count = build_products_and_schemas(gen, raw_aliases, semi_aliases)

    OUTPUT_RAW_SQL.write_text(raw_material_import_sql(raw_rows, gen), encoding="utf-8")
    OUTPUT_PRODUCTS_SQL.write_text(
        "-- Generated by generate_clean_traceability_import_sql.py.\n"
        "-- Run after 01_insert_unified_suppliers_and_raw_materials.sql.\n\n"
        + gen.product_schema_sql(products, schemas)
        .replace("Run after 01_insert_divers_raw_materials.sql.", "Run after 01_insert_unified_suppliers_and_raw_materials.sql.")
        .replace("Run 01_insert_divers_raw_materials.sql first.", "Run 01_insert_unified_suppliers_and_raw_materials.sql first."),
        encoding="utf-8",
    )
    OUTPUT_VERIFY_SQL.write_text(
        "-- Generated by generate_clean_traceability_import_sql.py.\n"
        "-- Run after 02_insert_clean_production_products_and_schemas.sql.\n\n"
        + clean_verification_sql(gen.verification_sql(products, schemas)),
        encoding="utf-8",
    )

    summary = {
        "raw_materials": len({(row["canonical_material"], row["supplier"]) for row in raw_rows}),
        "suppliers": len({row["supplier"] for row in raw_rows}),
        "products": len(products),
        "schemas": len(schemas),
        "component_links": sum(len(components) for components in schemas.values()),
        "recipe_files": len(gen.RECIPE_FILES),
        "beldi_recipe_tables": beldi_table_count,
        "outputs": [str(OUTPUT_RAW_SQL), str(OUTPUT_PRODUCTS_SQL), str(OUTPUT_VERIFY_SQL)],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
