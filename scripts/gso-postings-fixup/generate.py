"""
Bring the City General Services Office (GSO) up to the same standard as the
four offices imported on 2026-10-20.

The 25 GSO seats and 24 posts already exist in the live database (labels
112–150), but they went in bare: no office in `departments`, no divisions, no
qualifications, duties, documents or summary, and the vacant posts are On Hold
with no dates. This script writes one transactional SQL file that:

  - adds the office (named exactly as the posts store it), weighting C, and its
    divisions as child departments;
  - fills every GSO post's posting fields with the same CSC rules and Faker
    wording as scripts/import-sheet-postings;
  - opens the 5 vacant posts with deadlines; filled-only posts stay Closed.

It UPDATEs posts in place (matched by office + title), so post and seat ids are
kept. Plan: docs/plans/2026-10-21-gso-postings-fixup.md.

    python scripts/gso-postings-fixup/generate.py

Writes gso_postings_fixup.sql next to this file. Review it, then run it in the
Supabase SQL editor. It holds no personal data.
"""

from __future__ import annotations

import csv
import importlib.util
import sys
from collections import Counter, OrderedDict
from pathlib import Path

from faker import Faker

HERE = Path(__file__).resolve().parent
SHEET = HERE / "gso_sheet.csv"
OUTPUT = HERE / "gso_postings_fixup.sql"

# Reuse the job-post rules (families, CSC qualifications, wording) so GSO posts
# read exactly like the other offices'.
_spec = importlib.util.spec_from_file_location(
    "import_sheet_postings", HERE.parent / "import-sheet-postings" / "generate.py"
)
base = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = base  # dataclasses look their module up here
_spec.loader.exec_module(base)  # type: ignore[union-attr]

FAKER_SEED = 20261021
OFFICE_NAME = "Office of the City General Services Officer"  # exactly as job_postings.department stores it
OFFICE_CODE = "OCGSO"
WEIGHTING_CODE = "C"

Family = base.Family
ELIG_PROF = base.ELIG_PROF

# GSO-only job families. Same shape and conventions as base.FAMILIES.
GSO_FAMILIES: dict[str, Family] = {
    "gso_head": Family(
        "College Graduate",
        "Bachelor's degree in Public Administration, Business Administration or Management",
        ELIG_PROF,
        "General services, property or supply management",
        "Fiscal Management/Budgeting for LGU",
        ["Property and supply management", "Procurement (RA 9184)", "Office leadership"],
        [
            "Directs the city's property, supply, procurement and facilities services",
            "Takes custody of city property and maintains the property inventory",
            "Oversees procurement support to the Bids and Awards Committee",
            "Supervises building, grounds and motorpool operations",
            "Submits property and supply reports to COA and the City Mayor",
            "Prepares the office's budget and work and financial plan",
        ],
        ["Master's degree in Public Administration", "Training on the Government Procurement Reform Act (RA 9184)"],
        ["Leads the city's general services and property management."],
    ),
    "supply": Family(
        "College Graduate",
        "Bachelor's degree in Business Administration, Commerce or a related course",
        None,
        "Supply, property or inventory management",
        "Transparency and Accountability Practices",
        ["Inventory management", "Property accountability (PAR/ICS)", "Supply records"],
        [
            "Receives, inspects and records deliveries of supplies and equipment",
            "Maintains stock cards, property cards and the inventory system",
            "Issues supplies and property against approved requisitions",
            "Conducts physical inventory and reconciles property records",
            "Processes disposal of unserviceable property",
            "Prepares supply and property reports for COA",
        ],
        ["Training on government property management", "Experience with an inventory system"],
        ["Keeps the city's supplies and property accounted for."],
    ),
    "building_official": Family(
        "College Graduate",
        "Bachelor of Science in Civil Engineering or Architecture",
        "RA 1080 (Civil Engineer or Architect)",
        "Building maintenance or facilities management",
        "Project Management in a Public Setting",
        ["Facilities maintenance planning", "National Building Code (PD 1096)", "Crew supervision"],
        [
            "Plans and supervises repair and maintenance of city buildings",
            "Inspects facilities for structural and safety issues",
            "Prepares programs of work and estimates for repairs",
            "Supervises carpenters, plumbers and utility crews",
            "Ensures compliance with the National Building Code and fire safety rules",
        ],
        ["Experience in public building maintenance"],
        ["Keeps the city's buildings and grounds safe and serviceable."],
    ),
    "transport": Family(
        "College Graduate",
        "Bachelor's degree in Management, Public Administration or a related course",
        ELIG_PROF,
        "Fleet, transport or motorpool management",
        "Project Management in a Public Setting",
        ["Fleet management", "Vehicle dispatch and trip tickets", "Driver supervision"],
        [
            "Manages the city's vehicle fleet and motorpool",
            "Approves trip tickets and monitors fuel consumption",
            "Schedules preventive maintenance and repairs of vehicles",
            "Supervises drivers, mechanics and equipment operators",
            "Maintains vehicle registration, insurance and records",
        ],
        ["Experience in fleet management"],
        ["Keeps the city's fleet running and accounted for."],
    ),
    "driver": Family(
        "Elementary Graduate", "Elementary school graduate", "Driver (MC 11, s. 1996 - Cat. II)",
        "Driving or vehicle operation",
        "Ethical Conduct and Public Service Standards",
        ["Professional driving", "Basic vehicle maintenance", "Road safety"],
        [
            "Drives city vehicles for official trips",
            "Keeps trip tickets and fuel records",
            "Performs daily vehicle checks and basic upkeep",
            "Reports vehicle defects for repair",
        ],
        ["Professional Driver's License"],
        ["Supports the office's official travel and logistics."],
    ),
    "plumber": Family(
        "Elementary Graduate", "Elementary school graduate", "Plumber (MC 11, s. 1996 - Cat. II)",
        "Plumbing installation and repair",
        "Ethical Conduct and Public Service Standards",
        ["Plumbing", "Pipe fitting", "Water system maintenance"],
        [
            "Installs and repairs water and drainage lines in city facilities",
            "Fixes leaks, fixtures and pumps",
            "Estimates plumbing materials for repairs",
            "Maintains plumbing tools and equipment",
        ],
        ["TESDA Plumbing NC II"],
        ["Keeps the city's water and plumbing systems working."],
    ),
    "mechanic": Family(
        "High School Graduate", "High school graduate", "Mechanic (MC 11, s. 1996 - Cat. II)",
        "Automotive or heavy equipment repair",
        "Ethical Conduct and Public Service Standards",
        ["Engine diagnostics", "Preventive maintenance", "Heavy equipment repair"],
        [
            "Diagnoses and repairs city vehicles and heavy equipment",
            "Performs scheduled preventive maintenance",
            "Requests and accounts for spare parts",
            "Keeps job orders and repair records",
        ],
        ["TESDA Automotive Servicing NC II"],
        ["Keeps the city's fleet and equipment in working order."],
    ),
    "equipment_operator": Family(
        "Elementary Graduate", "Elementary school graduate", "Heavy Equipment Operator (MC 11, s. 1996 - Cat. II)",
        "Heavy equipment operation",
        "Disaster Risk Reduction and Management",
        ["Crane and boom truck operation", "Equipment safety", "Basic equipment upkeep"],
        [
            "Operates cranes, boom trucks and other heavy equipment",
            "Supports road clearing and rescue operations",
            "Performs pre-operation equipment checks",
            "Keeps equipment logs and reports defects",
        ],
        ["TESDA Heavy Equipment Operation NC II", "Professional Driver's License"],
        ["Supports the city's heavy equipment and rescue operations."],
    ),
}

# Checked before base.FAMILY_RULES; first match wins.
GSO_RULES = [
    ("general services officer", "gso_head"),
    ("supply officer", "supply"),
    ("building official", "building_official"),
    ("transportation regulation", "transport"),
    ("(driver", "driver"),
    ("plumber", "plumber"),
    ("mechanic", "mechanic"),
    ("equipment operator", "equipment_operator"),
    ("utility foreman", "utility"),
]

base.FAMILIES.update(GSO_FAMILIES)
base.FAMILY_RULES[:0] = GSO_RULES


def read_gso() -> list:
    rows = []
    with SHEET.open(encoding="utf-8", newline="") as f:
        for i, r in enumerate(csv.DictReader(f), start=2):
            rows.append(base.Row(
                sheet_row=i, item=r["item"].strip(), title=r["title"].strip(), division=r["division"].strip(),
                sg=int(r["sg"]), status=r["status"].strip(), function=r["function"].strip(),
                office_code=OFFICE_CODE, office_name=OFFICE_NAME,
            ))
    if len(rows) != 25 or len({r.item for r in rows}) != 25:
        sys.exit("Expected 25 GSO seats with unique numbers.")
    return rows


def main() -> None:
    Faker.seed(FAKER_SEED)
    fake = Faker("en_PH")
    q, j = base.sql_str, base.sql_json

    rows = read_gso()

    # One post per title (the merge migration groups by title + office). A post
    # with any vacant seat opens; otherwise it stays Closed.
    posts: "OrderedDict[str, list]" = OrderedDict()
    for r in rows:
        posts.setdefault(r.title, []).append(r)

    divisions = list(OrderedDict.fromkeys(r.division for r in rows))
    # D6 of the 2026-10-20 import: a division name another office already uses
    # gets the office code appended.
    shared = {"Executive & Administrative Division"}

    out = [
        "-- Generated by scripts/gso-postings-fixup/generate.py. Do not edit by hand.",
        "-- Plan: docs/plans/2026-10-21-gso-postings-fixup.md",
        f"-- {len(rows)} seats, {len(posts)} posts, {len(divisions)} divisions; all-or-nothing.",
        "",
        "BEGIN;",
        "",
        "DO $$",
        "DECLARE n int;",
        "BEGIN",
        f"  IF EXISTS (SELECT 1 FROM public.departments WHERE code = {q(OFFICE_CODE)} OR lower(name) = lower({q(OFFICE_NAME)})) THEN",
        "    RAISE EXCEPTION 'GSO office already exists in departments; this already ran?';",
        "  END IF;",
    ]
    for r in rows:
        slot_status = "filled" if r.status == "FILLED" else "open"
        out += [
            "  SELECT count(*) INTO n FROM public.plantilla_slots ps JOIN public.job_postings jp ON jp.id = ps.job_posting_id",
            f"   WHERE jp.deleted_at IS NULL AND jp.department = {q(OFFICE_NAME)} AND jp.title = {q(r.title)}",
            f"     AND ps.label = {q('Plantilla ' + r.item)} AND ps.status = {q(slot_status)};",
            f"  IF n <> 1 THEN RAISE EXCEPTION 'GSO seat {r.item} ({r.title}) not found as expected'; END IF;",
        ]
    out += [
        "  SELECT count(*) INTO n FROM public.job_postings WHERE deleted_at IS NULL AND department = " + q(OFFICE_NAME) + ";",
        f"  IF n <> {len(posts)} THEN RAISE EXCEPTION 'Expected {len(posts)} GSO posts, found %', n; END IF;",
        "END $$;",
        "",
        "-- The office, weighting C, and its divisions as child departments.",
        f"INSERT INTO public.departments (code, name, is_active) VALUES ({q(OFFICE_CODE)}, {q(OFFICE_NAME)}, true);",
        "INSERT INTO public.department_weighting_configs (department_id, schema_option_id, is_active)",
        "SELECT d.id, o.id, true FROM public.departments d, public.weighting_schema_options o",
        f" WHERE d.code = {q(OFFICE_CODE)} AND o.code = {q(WEIGHTING_CODE)};",
        "INSERT INTO public.departments (code, name, parent_department_id, is_active)",
        "SELECT v.code, v.name, d.id, true FROM (VALUES",
        ",\n".join(
            f"  ({q(f'{OFFICE_CODE}-D{i:02d}')}, {q(f'{name} ({OFFICE_CODE})' if name in shared else name)})"
            for i, name in enumerate(divisions, start=1)
        ),
        ") AS v(code, name) JOIN public.departments d ON d.code = " + q(OFFICE_CODE) + ";",
        "",
        "-- Posting fields, CSC rules as in the 2026-10-20 import.",
    ]

    report = []
    for title, seats in posts.items():
        vacant = [s for s in seats if s.status == "VACANT"]
        lead = vacant[0] if vacant else seats[0]  # wording and dates follow the open seat when there is one
        p = base.build_posting(fake, lead)
        status = "Open" if vacant else "Closed"
        report.append((title, status, p["family"], p["eligibility"], [s.item for s in seats]))
        out += [
            "UPDATE public.job_postings SET",
            f"  status = {q(status)}, division = {q(lead.division)}, summary = {q(p['summary'])},",
            f"  position_type = {q(base.POSITION_TYPE)}, employment_status = {q(base.EMPLOYMENT_STATUS)},",
            f"  education_requirement = {q(p['education_requirement'])}, education_field = {q(p['education_field'])},",
            f"  experience_years = {p['experience_years']}, experience_field = {q(p['experience_field'])},",
            f"  training_requirement = {q(p['training_requirement'])}, eligibility = {q(p['eligibility'])},",
            f"  competency = {q(p['competency'])}, preferred_qualifications = {q(p['preferred_qualifications'])},",
            f"  responsibilities = {j(p['responsibilities'])}, required_skills = {j(p['required_skills'])},",
            f"  certifications = {j(p['certifications'])}, required_documents = {j(base.REQUIRED_DOCUMENTS)},",
            f"  application_deadline = {q(p['application_deadline'])}, expected_start_date = {q(p['expected_start_date'])},",
            f"  posted_by = {q(base.POSTED_BY)}, updated_at = now()",
            f"WHERE deleted_at IS NULL AND department = {q(OFFICE_NAME)} AND title = {q(title)};",
        ]

    n_open = sum(1 for r in report if r[1] == "Open")
    out += [
        "",
        "DO $$",
        "BEGIN",
        f"  IF (SELECT count(*) FROM public.job_postings WHERE deleted_at IS NULL AND department = {q(OFFICE_NAME)}",
        f"        AND education_requirement IS NOT NULL AND posted_by = {q(base.POSTED_BY)}) <> {len(posts)}",
        f"     OR (SELECT count(*) FROM public.job_postings WHERE deleted_at IS NULL AND department = {q(OFFICE_NAME)} AND status = 'Open') <> {n_open}",
        f"     OR (SELECT count(*) FROM public.departments d JOIN public.departments p ON p.id = d.parent_department_id WHERE p.code = {q(OFFICE_CODE)}) <> {len(divisions)}",
        "  THEN RAISE EXCEPTION 'GSO fix-up counts do not match; rolled back'; END IF;",
        "END $$;",
        "",
        "COMMIT;",
        "",
    ]
    OUTPUT.write_text("\n".join(out), encoding="utf-8", newline="\n")

    print(f"Wrote {OUTPUT.name}: {len(posts)} posts ({n_open} open), {len(divisions)} divisions")
    for title, status, fam, elig, items in report:
        print(f"  {status:6} {fam:18} {','.join(items):8} {title}  [{elig}]")
    fams = Counter(r[2] for r in report)
    print("  families:", dict(sorted(fams.items())))


if __name__ == "__main__":
    main()
