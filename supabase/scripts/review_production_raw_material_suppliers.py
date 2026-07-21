from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AUDIT_DIR = ROOT / "tmp" / "raw_material_supplier_audit"
OCCURRENCES_FILE = AUDIT_DIR / "all_raw_material_occurrences.csv"


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("\xa0", " ")).strip()


def key(value: str | None) -> str:
    normalized = clean(value).lower().replace("œ", "oe")
    normalized = unicodedata.normalize("NFKD", normalized)
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.replace("?", " ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", normalized)).strip().upper()


def title_supplier(value: str) -> str:
    known = {
        "CREATIVE DISTRIBUTION": "CREATIVE DISTRIBUTION",
        "DIVERS": "DIVERS",
        "ECOMAB": "ECOMAB",
        "LACTO GROUP": "LACTO GROUP",
        "MANARA PRODUCT": "MANARA PRODUCTS",
        "MANARA PRODUCTS": "MANARA PRODUCTS",
        "MILKY FOOD": "MILKY FOOD",
        "OUMOUZOUN DISTRIBUTION": "OUMOUZOUN DISTRIBUTION",
        "OVODIC": "OVODIC",
        "OVOTEC": "OVOTEC",
        "PANNA NEGOCE": "PANNA NEGOCE",
        "PANNA NIGOCE": "PANNA NEGOCE",
        "RAFII": "RAFII",
        "RICA MAROC": "RICA MAROC",
        "RICA MAROCE": "RICA MAROC",
        "SOCRECH": "SOCRECH",
        "SONIPALE": "SONIPALE",
    }
    return known.get(key(value), clean(value).upper())


# User-approved decisions from the July 2026 raw material reset review.
EXACT_RULES: dict[str, tuple[str, str]] = {
    key("Acajou"): ("Acajou", "DIVERS"),
    key("Agar-agar"): ("Agar-agar", "DIVERS"),
    key("Amand noire"): ("Amande noire", "MANARA PRODUCTS"),
    key("Amande"): ("Amande noire", "MANARA PRODUCTS"),
    key("Amande effilée"): ("Amande effilée", "ECOMAB"),
    key("Amande haché"): ("Amande hachée", "ECOMAB"),
    key("Amande hachée"): ("Amande hachée", "ECOMAB"),
    key("Amande noir"): ("Amande noire", "MANARA PRODUCTS"),
    key("Amande noire"): ("Amande noire", "MANARA PRODUCTS"),
    key("Amande noir concassé"): ("Amande noire", "MANARA PRODUCTS"),
    key("Amande noire concassé"): ("Amande noire", "MANARA PRODUCTS"),
    key("Amande noire concassée"): ("Amande noire", "MANARA PRODUCTS"),
    key("Amande poudre"): ("Amande poudre", "ECOMAB"),
    key("Ananas"): ("Ananas", "DIVERS"),
    key("Banane"): ("Banane", "DIVERS"),
    key("Beurre"): ("Beurre", "LACTO GROUP"),
    "BEURRE SP CIAL": ("Beurre", "LACTO GROUP"),
    key("Beurre spécial"): ("Beurre", "LACTO GROUP"),
    key("Beurre de cacao"): ("Beurre de cacao", "ECOMAB"),
    key("Beurre rigale"): ("Beurre rigale", "DIVERS"),
    key("Bicarbonate"): ("Bicarbonate de soude", "DIVERS"),
    key("Bicarbonate de soude"): ("Bicarbonate de soude", "DIVERS"),
    key("Citron"): ("Citron", "DIVERS"),
    key("Cornflower"): ("Cornflower", "DIVERS"),
    key("Crème pistache"): ("Crème pistache", "CREATIVE DISTRIBUTION"),
    "CR ME FRA CHE": ("Crème fraîche", "SOCRECH"),
    key("Crème fraîche"): ("Crème fraîche", "SOCRECH"),
    key("Crème caramel"): ("Crème caramel", "CREATIVE DISTRIBUTION"),
    key("Crème pâtisserie"): ("Poudre pâtissière", "ECOMAB"),
    key("Crème pâtissier"): ("Poudre pâtissière", "ECOMAB"),
    key("Crème pâtissière"): ("Poudre pâtissière", "ECOMAB"),
    key("Danone perle"): ("Danone perle", "DIVERS"),
    key("Eau"): ("Eau", "DIVERS"),
    key("Eau de fleur"): ("Eau de fleur", "DIVERS"),
    key("Eau de fleure"): ("Eau de fleur", "DIVERS"),
    key("Eau floral"): ("Eau de fleur", "DIVERS"),
    key("Eau florale"): ("Eau de fleur", "DIVERS"),
    key("Ecorces d'orange"): ("Ecorces d'orange", "ECOMAB"),
    key("Ecorces d’orange"): ("Ecorces d'orange", "ECOMAB"),
    key("Extrait liquide café"): ("Extrait liquide café", "ECOMAB"),
    key("Framboise"): ("Framboise", "DIVERS"),
    key("Gala blanc"): ("Gala blanc", "CREATIVE DISTRIBUTION"),
    key("Gala noir"): ("Gala noir", "CREATIVE DISTRIBUTION"),
    key("Gingembre"): ("Gingembre", "DIVERS"),
    key("Gousse de vanille"): ("Gousse de vanille", "ECOMAB"),
    key("Gélatine"): ("Gélatine poudre", "CREATIVE DISTRIBUTION"),
    "G LATINE POUDRE": ("Gélatine poudre", "CREATIVE DISTRIBUTION"),
    key("Gélatine poudre"): ("Gélatine poudre", "CREATIVE DISTRIBUTION"),
    key("Konafa"): ("Konafa", "DIVERS"),
    key("Kunafa"): ("Konafa", "DIVERS"),
    key("Lait"): ("Lait", "RAFII"),
    key("Lait liquide"): ("Lait", "RAFII"),
    key("Masse gélatine"): ("Gélatine poudre", "CREATIVE DISTRIBUTION"),
    "MA ZENA": ("Maïzena", "ECOMAB"),
    key("Maïzena"): ("Maïzena", "ECOMAB"),
    key("Mélange de graines"): ("Mélange de graines", "ECOMAB"),
    key("Nappage"): ("Nappage normal", "CREATIVE DISTRIBUTION"),
    key("Nappage normal"): ("Nappage normal", "CREATIVE DISTRIBUTION"),
    key("Nestlé"): ("Nestlé", "DIVERS"),
    key("Nestle"): ("Nestlé", "DIVERS"),
    key("Nestlé caramel"): ("Nestlé caramel", "DIVERS"),
    key("Nestle caramel"): ("Nestlé caramel", "DIVERS"),
    key("Noix hachée"): ("Noix", "ECOMAB"),
    key("Noix haché"): ("Noix", "ECOMAB"),
    key("Noix"): ("Noix", "ECOMAB"),
    key("Pate pistache"): ("Pate pistache", "ECOMAB"),
    key("Pectine"): ("Pectine NH", "ECOMAB"),
    key("Pectine NH"): ("Pectine NH", "ECOMAB"),
    key("Pétales de fleurs"): ("Pétales de fleurs", "DIVERS"),
    key("Philadelphia"): ("Philadelphia", "DIVERS"),
    key("Pistache hachée"): ("Pistache", "ECOMAB"),
    key("Pistache haché"): ("Pistache", "ECOMAB"),
    key("Poudre de coco"): ("Poudre cacao", "ECOMAB"),
    key("Poudre vanille"): ("Poudre vanille", "CREATIVE DISTRIBUTION"),
    key("Raisin"): ("Raisin", "DIVERS"),
    key("Raisins"): ("Raisin", "DIVERS"),
    key("Royal tine"): ("Feuilletine", "ECOMAB"),
    key("Royaltine"): ("Feuilletine", "ECOMAB"),
    key("Sésame blanc"): ("Sésame", "DIVERS"),
    key("Sésame"): ("Sésame", "DIVERS"),
    key("Sucre cassonade"): ("Sucre cassonade", "DIVERS"),
    key("Tournesol"): ("Tournesol", "DIVERS"),
    key("Trablit café"): ("Extrait liquide café", "ECOMAB"),
    "TRABLIT CAF": ("Extrait liquide café", "ECOMAB"),
    key("Trablet café"): ("Extrait liquide café", "ECOMAB"),
    key("Tri Moline"): ("Trimoline", "ECOMAB"),
    key("Trimoline"): ("Trimoline", "ECOMAB"),
    key("Vanille"): ("Poudre vanille", "CREATIVE DISTRIBUTION"),
    key("Vanille poudre"): ("Poudre vanille", "CREATIVE DISTRIBUTION"),
    key("Xanthan"): ("Xanthane", "DIVERS"),
    key("Xanthane"): ("Xanthane", "DIVERS"),
    key("Xanthine"): ("Xanthane", "DIVERS"),
    key("Yaourt poudre"): ("Yaourt poudre", "DIVERS"),
    "JAUNE D UF": ("Jaune d'œuf", "OVOTEC"),
    key("Jaune d'œuf"): ("Jaune d'œuf", "OVOTEC"),
    key("Œufs"): ("Œufs", "OVODIC"),
}


def resolve_rule(material: str) -> tuple[str, str] | None:
    material_key = key(material)

    if material_key in EXACT_RULES:
        return EXACT_RULES[material_key]

    if material_key.startswith("AROME ") or material_key.startswith("AR ME "):
        return (canonical_arome(material), "CREATIVE DISTRIBUTION")

    if "COLORANT" in material_key or material_key.startswith("COULEUR") or material_key.startswith("COULERENT") or material_key.startswith("COULEURENT") or material_key.startswith("COOL"):
        return (canonical_colorant(material), "CREATIVE DISTRIBUTION")

    if material_key.startswith("CHOCOLAT"):
        return resolve_chocolate(material)

    if material_key == "FARINE" or material_key.startswith("FARINE ") or material_key == "LA FARINE":
        return (canonical_farine(material), "RICA MAROC")

    if material_key == "HUILE" or material_key.startswith("HUILE ") or "HUILE" in material_key:
        return ("Huile", "OUMOUZOUN DISTRIBUTION")

    if material_key in {"JUS CITRON", "JUS DE CITRON"}:
        return ("Purée citron", "ECOMAB")

    if material_key.startswith("PUREE ") or material_key.startswith("PUR E "):
        return (canonical_puree(material), "ECOMAB")

    if material_key.startswith("VERMICELLE"):
        return (canonical_vermicelle(material), "CREATIVE DISTRIBUTION")

    return None


def canonical_arome(material: str) -> str:
    material_key = key(material)
    if "CAFE" in material_key:
        return "Arôme café"
    if "ORANGE" in material_key:
        return "Arôme orange"
    if "PISTACHE" in material_key:
        return "Arôme pistache"
    if "CITRON" in material_key:
        return "Arôme citron"
    return clean(material)


def canonical_colorant(material: str) -> str:
    material_key = key(material)
    for color_key, name in {
        "ROUGE": "Colorant rouge",
        "JAUNE": "Colorant jaune",
        "NOIR": "Colorant noir",
        "NOIRE": "Colorant noir",
        "VERT": "Colorant vert",
        "VERS": "Colorant vert",
        "BLANC": "Colorant blanc",
        "ORANGE": "Colorant orange",
        "PISTACHE": "Colorant pistache",
    }.items():
        if color_key in material_key:
            return name
    return "Colorant"


def resolve_chocolate(material: str) -> tuple[str, str]:
    material_key = key(material)
    if "LUBECA" in material_key or "LUBEKA" in material_key:
        supplier = "PANNA NEGOCE"
        brand = "Lubeca"
    else:
        supplier = "ECOMAB"
        brand = "Callebaut"

    if "BLANC" in material_key:
        return (f"Chocolat blanc {brand}", supplier)
    if "LAIT" in material_key:
        return (f"Chocolat au lait {brand}", supplier)
    if "NOIR" in material_key or "NOIRE" in material_key:
        return (f"Chocolat noir {brand}", supplier)
    if "CARAMEL" in material_key:
        return ("Chocolat caramel", supplier)
    return (clean(material), supplier)


def canonical_farine(material: str) -> str:
    material_key = key(material)
    if "FORCE" in material_key:
        return "Farine force"
    if "VIENNOISERIE" in material_key:
        return "Farine viennoiserie"
    return "Farine"


def canonical_puree(material: str) -> str:
    material_key = key(material)
    for token, name in {
        "ABRICOT": "Purée abricot",
        "ANANAS": "Purée ananas",
        "BANANE": "Purée banane",
        "CITRON": "Purée citron",
        "COCO": "Purée coco",
        "COCE": "Purée coco",
        "FRAMBOISE": "Purée framboise",
        "FRUIT": "Purée fruit",
        "MANGE": "Purée mangue",
        "MANGUE": "Purée mangue",
        "MYRTILLE": "Purée myrtille",
        "PASSION": "Purée passion",
    }.items():
        if token in material_key:
            return name
    return clean(material)


def canonical_vermicelle(material: str) -> str:
    material_key = key(material)
    if "NOIR" in material_key or "NOIRE" in material_key:
        return "Vermicelle noire"
    return "Vermicelle"


def canonical_existing_material(material: str) -> str:
    material_key = key(material)
    if material_key in {"OEUF", "OEUFS", "UF", "UFS", "OUEF"}:
        return "Œufs"
    if material_key in {"BLANC D OEUF", "BLANC D UF"}:
        return "Blanc d'œuf"
    if material_key in {"JAUNE D OEUF", "JAUN OEUF", "JAUNE OEUF", "JAUNE D UF"}:
        return "Jaune d'œuf"
    if material_key in {"CREME FRAICHE", "CR ME FRA CHE", "C FRAICHE"}:
        return "Crème fraîche"
    if material_key in {"MAIZINA", "MAIZENA", "MA ZENA"}:
        return "Maïzena"
    if material_key in {"SUCRE GLACE", "SUCRE GLAC", "SUCRE GLACER"}:
        return "Sucre glacé"
    if material_key in {"FEUILLE GELATINE", "GELATINE FEUILLE"}:
        return "Gélatine feuille"
    if material_key in {"GLUCOSE"}:
        return "Glucose"
    return clean(material)


def read_occurrences() -> list[dict[str, str]]:
    if not OCCURRENCES_FILE.exists():
        raise SystemExit(f"Missing audit input: {OCCURRENCES_FILE}")

    with OCCURRENCES_FILE.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def suppliers_from_row(row: dict[str, str]) -> list[str]:
    return [title_supplier(value) for value in row.get("suppliers", "").split(";") if clean(value)]


def classify_material(material: str, observed_suppliers: Counter[str]) -> tuple[str, str, str]:
    rule = resolve_rule(material)
    if rule:
        canonical, supplier = rule
        return "raw_material", canonical, supplier

    if observed_suppliers:
        if len(observed_suppliers) == 1:
            return "raw_material", canonical_existing_material(material), next(iter(observed_suppliers))
        return "needs_review", canonical_existing_material(material), "; ".join(sorted(observed_suppliers))

    # Per user decision: raw materials not covered by the review list are semi-finished products.
    return "semi_finished", clean(material), ""


def main() -> None:
    rows = read_occurrences()

    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[key(row["material"])].append(row)

    reviewed = []
    for material_key, material_rows in sorted(grouped.items()):
        display_name = Counter(clean(row["material"]) for row in material_rows).most_common(1)[0][0]
        observed_suppliers: Counter[str] = Counter()
        for row in material_rows:
            observed_suppliers.update(suppliers_from_row(row))

        action, canonical, supplier = classify_material(display_name, observed_suppliers)
        reviewed.append(
            {
                "action": action,
                "source_material": display_name,
                "canonical_material": canonical,
                "supplier": supplier,
                "occurrences": len(material_rows),
                "observed_suppliers": "; ".join(f"{name} ({count})" for name, count in observed_suppliers.most_common()),
                "source_variants": "; ".join(sorted({clean(row["source_text"]) for row in material_rows})),
                "files": "; ".join(sorted({row["file"] for row in material_rows})),
                "material_key": material_key,
            }
        )

    raw_rows = [row for row in reviewed if row["action"] == "raw_material"]
    semi_rows = [row for row in reviewed if row["action"] == "semi_finished"]
    review_rows = [row for row in reviewed if row["action"] == "needs_review"]

    raw_by_canonical: dict[tuple[str, str], dict[str, str | int | set[str]]] = {}
    for row in raw_rows:
        raw_key = (row["canonical_material"], row["supplier"])
        current = raw_by_canonical.setdefault(
            raw_key,
            {
                "canonical_material": row["canonical_material"],
                "supplier": row["supplier"],
                "source_materials": set(),
                "occurrences": 0,
            },
        )
        current["source_materials"].add(row["source_material"])  # type: ignore[union-attr]
        current["occurrences"] = int(current["occurrences"]) + int(row["occurrences"])

    final_raw_rows = [
        {
            "canonical_material": value["canonical_material"],
            "supplier": value["supplier"],
            "source_materials": "; ".join(sorted(value["source_materials"])),  # type: ignore[arg-type]
            "occurrences": value["occurrences"],
        }
        for value in raw_by_canonical.values()
    ]
    final_raw_rows.sort(key=lambda row: str(row["canonical_material"]).casefold())

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    write_csv(
        AUDIT_DIR / "reviewed_raw_material_supplier_plan.csv",
        reviewed,
        ["action", "source_material", "canonical_material", "supplier", "occurrences", "observed_suppliers", "source_variants", "files", "material_key"],
    )
    write_csv(
        AUDIT_DIR / "reviewed_final_raw_materials.csv",
        final_raw_rows,
        ["canonical_material", "supplier", "source_materials", "occurrences"],
    )
    write_csv(
        AUDIT_DIR / "reviewed_semi_finished_exclusions.csv",
        semi_rows,
        ["source_material", "occurrences", "source_variants", "files"],
    )
    write_csv(
        AUDIT_DIR / "reviewed_needs_review.csv",
        review_rows,
        ["source_material", "canonical_material", "supplier", "occurrences", "observed_suppliers", "source_variants", "files"],
    )

    summary = {
        "source_material_names_reviewed": len(reviewed),
        "final_raw_materials": len(final_raw_rows),
        "semi_finished_exclusions": len(semi_rows),
        "needs_review": len(review_rows),
        "raw_materials_without_supplier": sum(1 for row in final_raw_rows if not row["supplier"]),
        "outputs": {
            "plan": str(AUDIT_DIR / "reviewed_raw_material_supplier_plan.csv"),
            "final_raw_materials": str(AUDIT_DIR / "reviewed_final_raw_materials.csv"),
            "semi_finished_exclusions": str(AUDIT_DIR / "reviewed_semi_finished_exclusions.csv"),
            "needs_review": str(AUDIT_DIR / "reviewed_needs_review.csv"),
        },
    }
    (AUDIT_DIR / "reviewed_raw_material_supplier_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def write_csv(path: Path, rows: list[dict[str, object]], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({name: row.get(name, "") for name in fieldnames})


if __name__ == "__main__":
    main()
