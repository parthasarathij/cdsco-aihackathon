from __future__ import annotations
from src.utils.logger import get_logger
logger = get_logger(__name__)

import re
from dataclasses import dataclass, field
from typing import Literal

from ..constants import dossier_field_maps as maps

FieldResult = Literal["CONSISTENT", "NEEDS_REVIEW", "INCONSISTENT"]


@dataclass
class NormalizedFieldValue:
    """Single module value after normalization."""

    display: str
    canonical: str
    unit_family: str | None = None  
    numeric_strength: float | None = None
    dosage_group: str | None = None
    dosage_subtype: str | None = None
    be_code: str | None = None
    months_lt: int | None = None
    months_acc: int | None = None
    months_shelf: int | None = None
    site_city_country: str | None = None
    dmf_cep_flag: bool = False
    multiple_sites_flag: bool = False
    conditional_shelf_flag: bool = False
    flags: list[str] = field(default_factory=list)


def _lower_alnum(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def normalize_strength(raw: str) -> NormalizedFieldValue:
    t = (raw or "").strip()
    if not t:
        return NormalizedFieldValue(display="Not found", canonical="", unit_family=None, numeric_strength=None)

    s = t.lower()
    s = s.replace("µ", "u").replace("μ", "u")
    s = re.sub(r"\s+", " ", s)
    # unify unit tokens
    s = re.sub(r"milligrams?", "mg", s)
    s = re.sub(r"micrograms?", "mcg", s)
    s = re.sub(r"\bmcg\b", "mcg", s)
    s = re.sub(r"\bmg\b", "mg", s)
    s = re.sub(r"\bgrams?\b", "g", s)
    s = re.sub(r"\bml\b", "ml", s)

    # Extract first numeric + unit pattern for strength (not time phrases in isolation)
    m = re.search(
        r"(\d+(?:\.\d+)?)\s*(mg|mcg|g|iu|units?|%|w/w|w/v|ml)\b",
        s,
        re.I,
    )
    if not m:
        # try "10 milligrams" already normalized
        m = re.search(r"(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml)\b", s)
    num = None
    uf = None
    canonical = _lower_alnum(s)
    if m:
        num = float(m.group(1))
        if num == int(num):
            num = int(num)  # type: ignore[assignment]
        uf = m.group(2).lower()
        if uf in ("µg",):
            uf = "mcg"
        canonical = f"{num} {uf}"
    flags: list[str] = []
    return NormalizedFieldValue(
        display=canonical or t[:120],
        canonical=canonical,
        unit_family=uf,
        numeric_strength=float(m.group(1)) if m else None,
        flags=flags,
    )


def normalize_product_name(raw: str) -> NormalizedFieldValue:
    t = (raw or "").strip()
    if not t:
        return NormalizedFieldValue(display="Not found", canonical="")

    s = t.lower()
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # strip leading dosage form words
    s = re.sub(
        r"^(tab\.?|tablet|cap\.?|capsule|inj\.?|injection|syrup|oral\s+solution)\s+",
        "",
        s,
        flags=re.I,
    )
    # strip trailing strength
    s = re.sub(r"\s+\d+(?:\.\d+)?\s*(mg|mcg|g|ml)\s*$", "", s, flags=re.I)
    parts = s.split()
    new_parts = [p for p in parts if p not in maps.SALT_SUFFIXES]
    base = " ".join(new_parts).strip()
    base_key = base
    if base in maps.INN_ALIASES:
        base_key = maps.INN_ALIASES[base]
    for k, v in maps.INN_ALIASES.items():
        if k in base.split():
            base_key = v
            break
    return NormalizedFieldValue(display=base[:200] or t[:200], canonical=base_key or _lower_alnum(t))


def normalize_dosage_form(raw: str) -> NormalizedFieldValue:
    t = (raw or "").strip()
    if not t:
        return NormalizedFieldValue(display="Not found", canonical="", dosage_group=None)
    low = t.lower()
    matched_group = None
    matched_phrase = ""
    for code, phrases in maps.DOSAGE_FORM_GROUP_PHRASES.items():
        for ph in sorted(phrases, key=len, reverse=True):
            if ph in low:
                matched_group = code
                matched_phrase = ph
                break
        if matched_group:
            break
    subtype = None
    if matched_group:
        for hint in maps.DOSAGE_FORM_SUBTYPE_HINTS.get(matched_group, ()):
            if hint in low:
                subtype = hint
                break
    can = matched_group or _lower_alnum(t)[:80]
    return NormalizedFieldValue(
        display=t[:120],
        canonical=can,
        dosage_group=matched_group,
        dosage_subtype=subtype,
    )


def normalize_applicant(raw: str) -> NormalizedFieldValue:
    t = (raw or "").strip()
    if not t:
        return NormalizedFieldValue(display="Not found", canonical="")
    s = t.lower()
    s = re.sub(r"[^\w\s\-]", " ", s)
    # strip after em-dash or comma if looks like address tail
    for sep in (" – ", " — ", ",", " - "):
        if sep in s:
            idx = s.find(sep)
            tail = s[idx + len(sep) :]
            if any(k in tail for k in maps.DIVISION_STRIP_KEYWORDS):
                s = s[:idx]
                break
    s = re.sub(r"\s+", " ", s).strip()
    words = s.split()
    out = [w for w in words if w.rstrip(".") not in maps.APPLICANT_LEGAL_SUFFIXES]
    root = " ".join(out).strip()
    return NormalizedFieldValue(display=t[:160], canonical=root or _lower_alnum(t))


def _strip_postal_noise(s: str) -> str:
    s = re.sub(r"\bplot\s*no\.?\s*\d+[\w\-/]*", " ", s, flags=re.I)
    s = re.sub(r"\bsurvey\s*no\.?\s*\d+[\w\-/]*", " ", s, flags=re.I)
    s = re.sub(r"\b(pin|postal)\s*[:]?\s*\d{3,10}\b", " ", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()


def normalize_manufacturer_site(raw: str) -> NormalizedFieldValue:
    t = (raw or "").strip()
    if not t:
        return NormalizedFieldValue(display="Not found", canonical="")
    flags: list[str] = []
    if re.search(r"\bDMF\s*[A-Z0-9\-]+", t, re.I):
        flags.append("dmf_reference")
    if re.search(r"\bCEP\s*[A-Z0-9\-]+", t, re.I):
        flags.append("cep_reference")
    s = _strip_postal_noise(t)
    # Heuristic: last line or segment with country name
    countries = (
        "india",
        "usa",
        "united states",
        "china",
        "germany",
        "ireland",
        "italy",
        "spain",
        "france",
        "uk",
        "united kingdom",
        "japan",
    )
    low = s.lower()
    cc = None
    for c in countries:
        if c in low:
            # take up to 80 chars around country
            i = low.rfind(c)
            window = s[max(0, i - 40) : i + len(c) + 20]
            cc = _lower_alnum(window)[:120]
            break
    if not cc:
        cc = _lower_alnum(s[-120:])
    multi = bool(re.search(r"\band\b|\n|;", s, re.I)) and len(s) > 80
    return NormalizedFieldValue(
        display=t[:200],
        canonical=cc,
        site_city_country=cc,
        dmf_cep_flag=bool(flags),
        multiple_sites_flag=multi,
        flags=flags,
    )


def normalize_indication(raw: str) -> NormalizedFieldValue:
    t = (raw or "").strip()
    if not t:
        return NormalizedFieldValue(display="Not found", canonical="")
    low = t.lower()
    for canon, aliases in maps.INDICATION_SYNONYMS.items():
        if canon in low:
            return NormalizedFieldValue(display=t[:200], canonical=canon)
        for a in aliases:
            if a in low:
                return NormalizedFieldValue(display=t[:200], canonical=canon)
    return NormalizedFieldValue(display=t[:200], canonical=_lower_alnum(t)[:120])


def _parse_months_token(s: str) -> int | None:
    s = (s or "").lower().strip()
    m = re.search(r"(\d+(?:\.\d+)?)\s*(month|months|mo\b|m\b)", s)
    if m:
        return int(float(m.group(1)))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(year|years|yr|yrs)\b", s)
    if m:
        return int(round(float(m.group(1)) * 12))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(day|days)\b", s)
    if m:
        return max(1, int(round(float(m.group(1)) / 30.5)))
    m = re.search(r"\b(\d{2,3})\s*M\b", s, re.I)
    return int(m.group(1)) if m else None


def normalize_stability(raw: str) -> NormalizedFieldValue:
    t = (raw or "").strip()
    if not t:
        return NormalizedFieldValue(display="Not found", canonical="")
    low = t.lower()
    lt = None
    acc = None
    if re.search(r"long\s*[- ]?term|real\s*time|lt\s*stability", low):
        chunk = t
        lt = _parse_months_token(chunk)
    if re.search(r"accelerat|stress|acc\s*stability", low):
        acc = _parse_months_token(t)
    if lt is None and acc is None:
        lt = _parse_months_token(t)
    can = f"LT:{lt}|ACC:{acc}"
    return NormalizedFieldValue(
        display=t[:200],
        canonical=can,
        months_lt=lt,
        months_acc=acc,
    )


def normalize_shelf_life(raw: str) -> NormalizedFieldValue:
    t = (raw or "").strip()
    if not t:
        return NormalizedFieldValue(display="Not found", canonical="")
    low = t.lower()
    flags: list[str] = []
    if re.search(r"after\s+opening|reconstitut|storage\s+condition|if\s+stored", low):
        flags.append("conditional_storage")
    mo = _parse_months_token(t)
    can = str(mo) if mo is not None else _lower_alnum(t)[:80]
    return NormalizedFieldValue(
        display=t[:200],
        canonical=can,
        months_shelf=mo,
        conditional_shelf_flag=bool(flags),
        flags=flags,
    )


def normalize_bioequivalence(raw: str) -> NormalizedFieldValue:
    t = (raw or "").strip()
    if not t:
        return NormalizedFieldValue(display="Not found", canonical="", be_code=None)
    low = t.lower()
    code = None
    for c, phrases in maps.BE_STUDY_PHRASES.items():
        for ph in sorted(phrases, key=len, reverse=True):
            if ph in low:
                code = c
                break
        if code:
            break
    return NormalizedFieldValue(display=t[:200], canonical=code or _lower_alnum(t)[:80], be_code=code)


FIELD_NAMES: dict[int, str] = {
    1: "Strength of product",
    2: "Name of product",
    3: "Dosage form",
    4: "Applicant name",
    5: "Finished product manufacturer site",
    6: "Drug substance manufacturer site",
    7: "Indication",
    8: "Stability data (months)",
    9: "Shelf life",
    10: "Bioequivalence tests",
}


def normalize_for_field(field_num: int, raw: str) -> NormalizedFieldValue:
    # Dictionary dispatch for field normalization
    normalizers = {
        1: normalize_strength,
        2: normalize_product_name,
        3: normalize_dosage_form,
        4: normalize_applicant,
        7: normalize_indication,
        8: normalize_stability,
        9: normalize_shelf_life,
        10: normalize_bioequivalence,
    }
    
    if field_num in normalizers:
        return normalizers[field_num](raw)
    if field_num in {5, 6}:
        return normalize_manufacturer_site(raw)
    return NormalizedFieldValue(display=raw[:200], canonical=_lower_alnum(raw))


def compare_field_across_modules(
    field_num: int,
    by_module: dict[str, NormalizedFieldValue],
    raw_by_module: dict[str, str],
) -> tuple[FieldResult, str, str]:
    """
    Returns (result, canonical_group, notes).
    """
    mods = list(by_module.keys())
    vals = [by_module[m] for m in mods]

    # Missing / not found (per spec: show "Not found" → NEEDS_REVIEW)
    if missing := [m for m in mods if (by_module[m].display or "").strip() == "Not found"]:
        return (
            "NEEDS_REVIEW",
            "",
            f"Value not found or empty in: {', '.join(missing)}. Treat as review.",
        )

    if field_num == 1:
        nums = [v.numeric_strength for v in vals if v.numeric_strength is not None]
        fams = {v.unit_family for v in vals if v.unit_family}
        if len(mods) >= 2 and len(nums) < len(mods):
            return ("NEEDS_REVIEW", "", "Strength could not be parsed as numeric+unit in all modules.")
        if not nums:
            return ("NEEDS_REVIEW", "", "Could not parse numeric strength.")
        if len(nums) >= 2 and len(set(nums)) > 1:
            return ("INCONSISTENT", vals[0].canonical, "Different numeric strengths across modules.")
        if len(fams) > 1:
            return ("NEEDS_REVIEW", vals[0].canonical, "Same or similar strength but different unit families (e.g. mg vs mcg).")
        cans = {v.canonical for v in vals}
        if len(cans) == 1:
            return ("CONSISTENT", vals[0].canonical, "Strength matches after normalization.")
        return ("INCONSISTENT", "|".join(sorted(cans)), "Strength strings differ after normalization.")

    if field_num == 2:
        cans = {v.canonical for v in vals}
        if len(cans) == 1:
            return ("CONSISTENT", list(cans)[0], "Product name matches normalized INN/base.")
        # crude salt vs base: one token set subset
        return ("NEEDS_REVIEW", "|".join(sorted(cans)), "Product naming differs; verify salt form vs base INN.")

    if field_num == 3:
        groups = [v.dosage_group for v in vals]
        if any(g is None for g in groups):
            return ("NEEDS_REVIEW", "|".join(str(g) for g in groups), "Could not map all modules to a dosage form group.")
        if len(set(groups)) > 1:
            return ("INCONSISTENT", "|".join(str(g) for g in groups), "Different dosage form groups (e.g. tablet vs injection).")
        subtypes = [v.dosage_subtype for v in vals]
        if len({s for s in subtypes if s}) > 1:
            return ("NEEDS_REVIEW", str(groups[0]), "Same group but different sub-types (e.g. IR vs ER tablet).")
        return ("CONSISTENT", str(groups[0]), "Dosage form maps to the same group.")

    if field_num == 4:
        cans = {v.canonical for v in vals}
        if len(cans) == 1:
            return ("CONSISTENT", list(cans)[0], "Applicant root name matches.")
        # similar length / overlap heuristic
        return ("NEEDS_REVIEW", "|".join(sorted(cans)), "Applicant strings differ; may be subsidiary vs parent — review.")

    if field_num in {5, 6}:
        if any(v.dmf_cep_flag for v in vals):
            return (
                "NEEDS_REVIEW",
                vals[0].canonical,
                "DMF or CEP reference detected — confirm it maps to the same physical site.",
            )
        if any(v.multiple_sites_flag for v in vals):
            return ("NEEDS_REVIEW", vals[0].canonical, "Multiple sites or long address blocks — confirm primary site.")
        sites = {v.site_city_country or v.canonical for v in vals}
        if len(sites) == 1:
            return ("CONSISTENT", list(sites)[0], "Site fingerprint (city/country heuristic) matches.")
        return ("INCONSISTENT", "|".join(sorted(sites)), "Different city/country heuristics across modules.")

    if field_num == 7:
        cans = {v.canonical for v in vals}
        if len(cans) == 1:
            return ("CONSISTENT", list(cans)[0], "Indication maps to the same canonical term.")
        return ("NEEDS_REVIEW", "|".join(sorted(cans)), "Indications differ or not in synonym map — review specificity.")

    if field_num == 8:
        lts = [v.months_lt for v in vals]
        lts_n = [x for x in lts if x is not None]
        if not lts_n:
            return ("NEEDS_REVIEW", "", "Could not parse long-term stability months.")
        if len(set(lts_n)) > 1:
            return ("INCONSISTENT", str(set(lts_n)), "Different long-term stability durations (months).")
        return ("CONSISTENT", str(lts_n[0]), "Long-term stability months match.")

    if field_num == 9:
        months_list = [v.months_shelf for v in vals if v.months_shelf is not None]
        if not months_list:
            return ("NEEDS_REVIEW", "", "Could not parse shelf life as months in one or more modules.")
        if len(set(months_list)) > 1:
            return ("INCONSISTENT", str(sorted(set(months_list))), "Different shelf life durations across modules.")
        if any(v.conditional_shelf_flag for v in vals):
            return ("NEEDS_REVIEW", str(months_list[0]), "Conditional shelf life / storage wording — review.")
        return ("CONSISTENT", str(months_list[0]), "Shelf life months align across modules (engine also cross-checks vs stability LT).")

    if field_num == 10:
        codes = [v.be_code for v in vals]
        if all(c is None for c in codes):
            return ("NEEDS_REVIEW", "", "Could not classify bioequivalence statements; review manually.")
        if all(c == "NO-BE" for c in codes):
            return ("CONSISTENT", "NO-BE", "No in-vivo BE claimed or not required across modules.")
        defined = [c for c in codes if c is not None]
        if len(set(defined)) > 1:
            return ("NEEDS_REVIEW", "|".join(sorted(set(defined))), "Different BE study type codes — review.")
        return ("CONSISTENT", str(defined[0]), "Bioequivalence category aligns.")

    return ("CONSISTENT", vals[0].canonical, "Compared using generic rule.")


def refine_shelf_life_result(
    result: FieldResult,
    canonical: str,
    notes: str,
    shelf_by_mod: dict[str, NormalizedFieldValue],
    stability_lt_by_mod: dict[str, int | None],
) -> tuple[FieldResult, str, str]:
    """Apply shelf vs stability rule after field 8 LT known."""
    bad: list[str] = []
    review: list[str] = []
    for m, sv in shelf_by_mod.items():
        sh = sv.months_shelf
        lt = stability_lt_by_mod.get(m)
        if sh is not None and lt is not None and sh > lt:
            bad.append(f"{m}: shelf {sh}mo > stability LT {lt}mo")
        if sv.conditional_shelf_flag:
            review.append(f"{m}: conditional storage wording")
    if bad:
        return ("INCONSISTENT", canonical, f"{'; '.join(bad)}{' | ' + notes if notes else ''}")
    if review:
        return ("NEEDS_REVIEW", canonical, "; ".join(review))
    if result == "CONSISTENT":
        return ("CONSISTENT", canonical, notes)
    return (result, canonical, notes)


def refine_be_m2_m5(
    result: FieldResult,
    canonical: str,
    notes: str,
    be_by_mod: dict[str, NormalizedFieldValue],
) -> tuple[FieldResult, str, str]:
    m2 = be_by_mod.get("M2")
    m5 = be_by_mod.get("M5")
    if m2 and m5:
        c2, c5 = m2.be_code, m5.be_code
        invivo_like = {"BE-INVIVO", "BE-FAST", "BE-FED"}
        if c2 in invivo_like and (c5 is None or c5 == "NO-BE"):
            return ("INCONSISTENT", canonical, "M2 claims in-vivo BE-type study but M5 does not show matching BE data category.")
        if c2 in invivo_like and c5 in invivo_like:
            return ("CONSISTENT", str(c2), "M2 and M5 both reference in-vivo BE-type content.")
    return (result, canonical, notes)
