"""
Seat the 20 filled General Services Office (GSO) plantillas with employees,
following the conventions of the 2026-10-21 employee import (scripts/
import-employees, already applied live): Faker people with Filipino names,
CSC qualifications for their seat, eligibility and training records, hire
dates, ~10% probationary, a finalized 2025 IPCR, portal logins, and GSO's 5
critical positions with 2 Ready Now successors.

Plan: docs/plans/2026-10-21-import-employees.md, decision D25.
Run AFTER scripts/gso-postings-fixup/gso_postings_fixup.sql (the office must exist).

    python scripts/import-gso-employees/generate.py

Writes (gitignored, contains passwords):
    scratch/import-gso-employees/import_gso_employees.sql
    scratch/import-gso-employees/credentials.csv
    scratch/import-gso-employees/report.md
"""

from __future__ import annotations

import csv
import importlib.util
import re
import secrets
import string
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from faker import Faker

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT_DIR = ROOT / "scratch" / "import-gso-employees"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod  # dataclasses look their module up here
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# The GSO fix-up registers the GSO job families on the shared posting rules.
fixup = _load("gso_postings_fixup", HERE.parent / "gso-postings-fixup" / "generate.py")
base = fixup.base

FAKER_SEED = 20261022
REF_DATE = date(2026, 10, 21)            # same anchor as the main import
TENURE_BUFFER = timedelta(days=7)        # tenure is computed from date_hired; keep 3.0 from reading 2.99
PROBATION = timedelta(days=183)
IPCR_CUTOFF = date(2025, 1, 1)           # Regular employees hired before this get a 2025 IPCR
IPCR_CYCLE_TITLE = "2025 Performance Cycle"
FIRST_EMPLOYEE_NUMBER = 211              # the main import used EMP-2026-101..210
OFFICE = fixup.OFFICE_NAME
OFFICE_CODE = fixup.OFFICE_CODE
CREATED_BY = "00000000-0000-0000-0000-000000000000"   # matches the main import
CP_CREATED_BY = "Employee Import Generator"
NS = uuid.uuid5(uuid.NAMESPACE_DNS, "abyan-hris.gso-employee-import.2026-10-21")
REQUIRED_LEVEL = 3

HEAD_SEAT = "112"
CRITICAL_SEATS = ["112", "120", "128", "134", "147"]
# Critical seat -> the seat whose holder is its designated Ready Now successor (D25).
SUCCESSOR_OF = {"120": "122", "128": "130"}
PROBATIONARY_SEATS = {"117": date(2026, 7, 13), "133": date(2026, 5, 18)}  # entry, non-critical

# Required competencies per critical seat. 120 and 128 are covered seats: their
# designated successor is tagged with exactly this set. 112, 134 and 147 are
# gaps (no GSO title shares their field word) and carry a 4th competency.
# 128's set avoids the Social Welfare AO V gap seat's set, since that seat's
# candidate pool includes every "Administrative" employee.
SEAT_COMPETENCIES = {
    "112": ["Knowledge of Local Governance", "Public Administration Principles",
            "Fiscal Management/Budgeting for LGU", "Project Management in a Public Setting"],
    "120": ["Fiscal Management/Budgeting for LGU", "Transparency and Accountability Practices",
            "Data and Records Management and Organization"],
    "128": ["Public Administration Principles", "Transparency and Accountability Practices",
            "Fiscal Management/Budgeting for LGU"],
    "134": ["Project Management in a Public Setting", "Disaster Risk Reduction and Management",
            "Technical Writing for Government Documents", "Ethical Conduct and Public Service Standards"],
    "147": ["Project Management in a Public Setting", "Disaster Risk Reduction and Management",
            "Ethical Conduct and Public Service Standards", "Public Communication Skills"],
}

# Faker's en_PH person provider returns US names, so the names come from here.
MALE_FIRST = [
    "Juan", "Jose", "Ramon", "Rodolfo", "Ernesto", "Rogelio", "Danilo", "Eduardo", "Arnel", "Reynaldo",
    "Rommel", "Jericho", "Marlon", "Noel", "Rolando", "Efren", "Joel", "Ariel", "Jomar", "Dexter",
    "Ronaldo", "Wilfredo", "Bienvenido", "Teodoro", "Carlito", "Nestor", "Alfredo", "Benjie", "Raffy", "Jayson",
]
FEMALE_FIRST = [
    "Maria", "Rosario", "Lourdes", "Teresita", "Marites", "Analyn", "Jocelyn", "Rowena", "Marilou", "Liza",
    "Cristina", "Maricel", "Rhodora", "Imelda", "Corazon", "Erlinda", "Jennylyn", "Rosalinda", "Charmaine", "Divina",
    "Marjorie", "Leah", "Precious", "Kristine", "Rachelle", "Josephine", "Evangeline", "Shiela", "Nenita", "Glenda",
]
SURNAMES = [
    "Dela Cruz", "Santos", "Reyes", "Villanueva", "Bautista", "Gonzales", "Aquino", "Mendoza", "Castillo", "Ramos",
    "Fernandez", "Torres", "Flores", "Navarro", "Salazar", "Espinosa", "Lacson", "Ledesma", "Jalandoni", "Javellana",
    "Gamboa", "Tolentino", "Pascual", "Manalo", "Cabrera", "Samson", "Trinidad", "Panganiban", "Villaruel", "Divinagracia",
    "Sumagaysay", "Gallardo", "Belleza", "Tupas", "Lopez", "Magbanua", "Sian", "Ganzon", "Montinola", "Araneta",
]
BARANGAYS = [
    ("Barangay Tabuc Suba", "Jaro"), ("Barangay Balabago", "Jaro"), ("Barangay San Rafael", "Mandurriao"),
    ("Barangay Bolilao", "Mandurriao"), ("Barangay Sooc", "Arevalo"), ("Barangay Calumpang", "Molo"),
    ("Barangay Lapuz Norte", "Lapuz"), ("Barangay Rizal Pala-Pala", "La Paz"), ("Barangay Ungka", "Jaro"),
    ("Barangay Tacas", "Jaro"), ("Barangay Baldoza", "La Paz"), ("Barangay Santa Filomena", "Arevalo"),
]
STREETS = ["Rizal St.", "Luna St.", "Mabini St.", "Bonifacio Drive", "Quezon St.", "General Luna St.", "Burgos St."]
PLACES_OF_BIRTH = ["Iloilo City", "Oton, Iloilo", "Pavia, Iloilo", "Leganes, Iloilo", "Roxas City", "Bacolod City",
                   "San Jose, Antique", "Kalibo, Aklan", "Santa Barbara, Iloilo", "Guimbal, Iloilo"]

# Concrete degree per family. Must share a field word with the family's
# education_field, which is what the succession education gate compares.
DEGREE = {
    "gso_head": "Master in Public Administration",
    "supply": "Bachelor of Science in Business Administration",
    "admin_officer": "Bachelor of Public Administration",
    "building_official": "Bachelor of Science in Civil Engineering",
    "transport": "Bachelor of Science in Management",
}
TRAINING_POOL = {
    "default": [
        ("Government Office Records Management and Filing", "Technical", "NAP"),
        ("Values Restoration Program for Public Servants", "Other", "CSC"),
        ("Basic Occupational Safety and Health (BOSH)", "Compliance", "DOLE"),
        ("Data Privacy Act Compliance for Government Offices", "Compliance", "NPC"),
        ("Customer Service Excellence in the Public Sector", "Other", "CSC"),
    ],
    "supply": [
        ("Government Property Management and Inventory", "Technical", "COA"),
        ("Procurement under RA 9184 and its Revised IRR", "Technical", "GPPB"),
        ("Disposal of Unserviceable Government Property", "Technical", "COA"),
        ("PhilGEPS Registration and Posting", "Technical", "DBM-PS"),
    ],
    "admin_officer": [
        ("Procurement under RA 9184 and its Revised IRR", "Technical", "GPPB"),
        ("Records Management for Local Government Units", "Technical", "NAP"),
        ("Human Resource Management in the Public Sector", "Leadership", "CSC"),
        ("Supervisory Development Course", "Leadership", "CSC"),
    ],
    "gso_head": [
        ("Leadership and Management Program for LGU Department Heads", "Leadership", "DILG-LGA"),
        ("Strategic Planning and Budgeting for Local Governments", "Leadership", "DBM"),
        ("Government Property Management and Inventory", "Technical", "COA"),
        ("Procurement under RA 9184 and its Revised IRR", "Technical", "GPPB"),
        ("Public Financial Management for LGUs", "Leadership", "DILG-LGA"),
    ],
    "building_official": [
        ("National Building Code (PD 1096) Implementation", "Technical", "DPWH"),
        ("Fire Code of the Philippines (RA 9514) Compliance", "Compliance", "BFP"),
        ("Facilities Maintenance Planning", "Technical", "DPWH"),
    ],
    "transport": [
        ("Government Fleet Management", "Technical", "DOTr"),
        ("Road Safety and Defensive Driving Supervision", "Compliance", "LTO"),
        ("Supervisory Development Course", "Leadership", "CSC"),
    ],
    "trade": [
        ("Basic Occupational Safety and Health (BOSH)", "Compliance", "DOLE"),
        ("Preventive Maintenance of Government Vehicles and Equipment", "Technical", "TESDA"),
        ("Emergency Response and Rescue Equipment Operation", "Technical", "OCD"),
        ("Plumbing Systems Maintenance", "Technical", "TESDA"),
    ],
}
TRADE_FAMILIES = {"driver", "plumber", "mechanic", "equipment_operator", "utility"}
EMERGENCY_RELATIONS = ["Spouse", "Parent", "Sibling", "Child"]

ELIG_TYPE_PROF = "Civil Service Eligibility (Professional)"
ELIG_TYPE_SUBPROF = "Civil Service Eligibility (Sub-Professional)"
ELIG_TYPE_BOARD = "Bar / Board Eligibility (RA 1080)"
ELIG_TYPE_OTHER = "Other Recognized Eligibility"
ELIG_TYPE_DRIVER = "Professional Driver's License"


def uid(*parts: object) -> str:
    return str(uuid.uuid5(NS, "|".join(map(str, parts))))


q, j = base.sql_str, base.sql_json


def required_hours(title: str, sg: int) -> int:
    m = re.search(r"\d+", base.training(title, sg))
    return int(m.group()) if m else 0


@dataclass
class Seat:
    item: str
    title: str
    division: str
    sg: int
    family: str
    eligibility_text: str  # the post's eligibility string


@dataclass
class Person:
    seat: Seat
    number: str
    sex: str
    first: str
    last: str
    years: float
    hired: date
    status: str
    birth: date
    degree: str
    elig_types: list[str]
    hours_target: int
    tag_set: list[str] = field(default_factory=list)  # competencies to cover in training tags
    trainings: list[dict] = field(default_factory=list)
    password: str = ""
    username: str = ""


def read_seats() -> list[Seat]:
    seats = []
    with (HERE.parent / "gso-postings-fixup" / "gso_sheet.csv").open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r["status"] != "FILLED":
                continue
            title, sg = r["title"].strip(), int(r["sg"])
            fam = base.family_of(title)
            fam_obj = base.FAMILIES[fam]
            elig = fam_obj.eligibility or (base.ELIG_SUBPROF if sg <= base.FIRST_LEVEL_MAX_SG else base.ELIG_PROF)
            seats.append(Seat(r["item"], title, r["division"].strip(), sg, fam, elig))
    if len(seats) != 20:
        sys.exit(f"Expected 20 filled GSO seats, found {len(seats)}")
    return seats


def elig_records(seat: Seat, is_head: bool) -> list[str]:
    e = seat.eligibility_text
    if "RA 1080" in e:
        out = [ELIG_TYPE_BOARD]
    elif "Second Level" in e or "(Professional)" in e:
        out = [ELIG_TYPE_PROF]
    elif "First Level" in e or "Subprofessional" in e:
        out = [ELIG_TYPE_SUBPROF]
    elif e.startswith("None required"):
        out = []
    else:  # MC 11 trade eligibility
        out = [ELIG_TYPE_OTHER]
    if seat.family in {"driver", "equipment_operator"}:
        out.append(ELIG_TYPE_DRIVER)
    if is_head:
        out.append(ELIG_TYPE_OTHER)  # Career Executive Service Eligibility
    return out


def elig_text(seat: Seat) -> str | None:
    e = seat.eligibility_text
    if e.startswith("None required"):
        return None
    if "Second Level" in e:
        return "Career Service Professional"
    if "First Level" in e:
        return "Career Service Subprofessional"
    return e


def degree_for(seat: Seat) -> str:
    if seat.family in DEGREE:
        return DEGREE[seat.family]
    return base.FAMILIES[seat.family].education_field


def split_hours(fake: Faker, total: int) -> list[int]:
    chunks, left = [], total
    while left > 0:
        size = min(left, fake.random_element([4, 8, 8, 16, 16, 24, 32, 40]))
        chunks.append(size)
        left -= size
    return chunks


def build_people(fake: Faker, seats: list[Seat]) -> list[Person]:
    by_item = {s.item: s for s in seats}
    target_of = {succ: crit for crit, succ in SUCCESSOR_OF.items()}
    used_names: set[tuple[str, str]] = set()
    people: list[Person] = []

    for n, seat in enumerate(seats):
        sex = fake.random_element(["Male", "Female"])
        while True:
            first = fake.random_element(MALE_FIRST if sex == "Male" else FEMALE_FIRST)
            last = fake.random_element(SURNAMES)
            if (first, last) not in used_names:
                used_names.add((first, last))
                break

        req_years = base.experience_years(seat.title, seat.sg)
        own_hours = required_hours(seat.title, seat.sg)
        is_head = seat.item == HEAD_SEAT
        target = by_item.get(target_of.get(seat.item, ""))

        if is_head:
            years, hours = fake.random_int(14, 20), fake.random_int(150, 190)
        elif target:  # designated successor: passes every gate of the target seat
            t_years = base.experience_years(target.title, target.sg)
            years = max(t_years, req_years) + fake.random_int(2, 5)
            hours = max(required_hours(target.title, target.sg), own_hours) + fake.random_int(16, 40)
        elif seat.item in CRITICAL_SEATS:
            years, hours = req_years + fake.random_int(3, 9), own_hours + fake.random_int(16, 48)
        elif seat.item in PROBATIONARY_SEATS:
            years, hours = 0, 0
        else:
            years = req_years + fake.random_int(0, 8) + fake.random_element([0, 0.5])
            hours = own_hours + fake.random_element([0, 4, 8, 16, 24, 32])

        if seat.item in PROBATIONARY_SEATS:
            hired, status = PROBATIONARY_SEATS[seat.item], "Probationary"
            years = (REF_DATE - hired).days / 365.25
        else:
            hired = REF_DATE - timedelta(days=round(years * 365.25)) - TENURE_BUFFER
            status = "Regular"
        if REF_DATE - hired < PROBATION and status == "Regular":
            hired = REF_DATE - PROBATION - TENURE_BUFFER  # keep Regulars past probation

        age_at_hire = fake.random_int(23, 31) if is_head or target else fake.random_int(21, 33)
        birth = hired - timedelta(days=round(age_at_hire * 365.25) + fake.random_int(0, 300))
        if (REF_DATE - birth).days / 365.25 > 63:
            birth = date(REF_DATE.year - 63, birth.month, birth.day)
        if (hired - birth).days / 365.25 < 21:
            sys.exit(f"Seat {seat.item}: hire before age 21")

        p = Person(
            seat=seat, number=f"EMP-2026-{FIRST_EMPLOYEE_NUMBER + n}", sex=sex, first=first, last=last,
            years=years, hired=hired, status=status, birth=birth, degree=degree_for(seat),
            elig_types=elig_records(seat, is_head), hours_target=hours,
        )
        if target:
            p.tag_set = SEAT_COMPETENCIES[target.item]
        people.append(p)
    return people


def build_trainings(fake: Faker, p: Person) -> None:
    if p.hours_target <= 0:
        return
    fam = p.seat.family
    pool = TRAINING_POOL.get(fam) or (TRAINING_POOL["trade"] if fam in TRADE_FAMILIES else TRAINING_POOL["default"])
    pool = pool + TRAINING_POOL["default"]
    chunks = split_hours(fake, p.hours_target)
    start = max(p.hired + timedelta(days=30), date(2015, 1, 1))
    end = REF_DATE - timedelta(days=7)
    span = max((end - start).days, 1)
    for i, hours in enumerate(chunks):
        title, ttype, agency = pool[i % len(pool)]
        d = start + timedelta(days=(span * (i + 1)) // (len(chunks) + 1))
        days = max(1, -(-hours // 8))
        p.trainings.append({
            "id": uid("training", p.number, i), "title": title, "type": ttype, "agency": agency,
            "from": d, "to": d + timedelta(days=days - 1), "hours": hours,
            "cert": f"CERT-2026-{fake.random_int(10000, 99999)}", "tags": [],
        })
    if p.tag_set:  # designated successor: cover every required competency of the target seat
        if len(p.trainings) < len(p.tag_set):
            sys.exit(f"{p.number}: not enough trainings to tag {len(p.tag_set)} competencies")
        for k, comp in enumerate(p.tag_set):
            p.trainings[k % len(p.trainings)]["tags"].append(comp)
    elif fake.boolean(chance_of_getting_true=50):  # everyone else: at most one distinct competency
        comp = fake.random_element(base.FAMILIES[fam].competency and [base.FAMILIES[fam].competency])
        p.trainings[0]["tags"].append(comp)


EDU_RANK = {"Master": 4, "Bachelor": 3}


def qualification_rank(p: Person) -> tuple:
    edu = 4 if p.degree.startswith("Master") else 3 if p.degree.startswith("Bachelor") else 1
    level = 2 if any(t in (ELIG_TYPE_PROF, ELIG_TYPE_BOARD) for t in p.elig_types) else 1 if p.elig_types else 0
    lgc_480 = edu >= 3 and level == 2 and p.years >= 5 and p.seat.family in {"gso_head", "admin_officer", "supply"}
    total_hours = sum(t["hours"] for t in p.trainings)
    return (lgc_480, level, len(p.elig_types), round(p.years, 2), total_hours, edu)


def password() -> str:
    pools = [string.ascii_uppercase, string.ascii_lowercase, string.digits, "!@#$%^&*"]
    chars = [secrets.choice(pool) for pool in pools] + [secrets.choice("".join(pools)) for _ in range(8)]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def phone(fake: Faker) -> str:
    return f"09{fake.random_int(10, 99)}-{fake.random_int(100, 999)}-{fake.random_int(1000, 9999)}"


def main() -> None:
    Faker.seed(FAKER_SEED)
    fake = Faker("en_PH")
    seats = read_seats()
    people = build_people(fake, seats)
    for p in people:
        build_trainings(fake, p)

    # GSO head = the most qualified GSO employee (D25). Fail on any tie.
    ranked = sorted(people, key=qualification_rank, reverse=True)
    if ranked[0].seat.item != HEAD_SEAT or qualification_rank(ranked[0]) == qualification_rank(ranked[1]):
        sys.exit("The 112 holder is not strictly the most qualified GSO employee")

    taken: set[str] = set()
    for p in people:
        base_name = re.sub(r"[^a-z0-9]", "", (p.first + p.last).lower())
        name, k = base_name, 2
        while name in taken:
            name, k = f"{base_name}{k}", k + 1
        taken.add(name)
        p.username, p.password = name, password()

    by_item = {p.seat.item: p for p in people}
    E = [
        "-- Generated by scripts/import-gso-employees/generate.py. Do not edit by hand. CONTAINS PASSWORDS: never commit.",
        "-- Run AFTER scripts/gso-postings-fixup/gso_postings_fixup.sql. Plan: docs/plans/2026-10-21-import-employees.md (D25).",
        f"-- {len(people)} employees; all-or-nothing.",
        "",
        "BEGIN;",
        "",
        "DO $$",
        "DECLARE n int;",
        "BEGIN",
        f"  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE code = {q(OFFICE_CODE)}) THEN",
        "    RAISE EXCEPTION 'Run the GSO postings fix-up first: office OCGSO is missing'; END IF;",
        f"  IF EXISTS (SELECT 1 FROM public.employees WHERE department = {q(OFFICE)} AND deleted_at IS NULL) THEN",
        "    RAISE EXCEPTION 'GSO already has employees; this already ran?'; END IF;",
        f"  IF EXISTS (SELECT 1 FROM public.employees WHERE employee_number = ANY (ARRAY[{', '.join(q(p.number) for p in people)}])) THEN",
        "    RAISE EXCEPTION 'An employee number in EMP-2026-211..230 is taken'; END IF;",
        f"  IF EXISTS (SELECT 1 FROM public.employee_portal_accounts WHERE lower(username) = ANY (ARRAY[{', '.join(q(p.username) for p in people)}])) THEN",
        "    RAISE EXCEPTION 'A generated portal username already exists'; END IF;",
        f"  IF NOT EXISTS (SELECT 1 FROM public.performance_cycles WHERE title = {q(IPCR_CYCLE_TITLE)}) THEN",
        "    RAISE EXCEPTION 'The 2025 Performance Cycle is missing'; END IF;",
        f"  IF EXISTS (SELECT 1 FROM public.critical_positions cp JOIN public.departments d ON d.id = cp.department_id WHERE d.code = {q(OFFICE_CODE)}) THEN",
        "    RAISE EXCEPTION 'GSO already has critical positions'; END IF;",
    ]
    for p in people:
        E += [
            "  SELECT count(*) INTO n FROM public.plantilla_slots ps JOIN public.job_postings jp ON jp.id = ps.job_posting_id",
            f"   WHERE jp.deleted_at IS NULL AND jp.department = {q(OFFICE)} AND jp.title = {q(p.seat.title)}",
            f"     AND ps.label = {q('Plantilla ' + p.seat.item)} AND ps.status = 'filled';",
            f"  IF n <> 1 THEN RAISE EXCEPTION 'Filled GSO seat {p.seat.item} not found'; END IF;",
        ]
    all_comps = sorted({c for v in SEAT_COMPETENCIES.values() for c in v} |
                       {t for p in people for tr in p.trainings for t in tr["tags"]})
    all_types = sorted({t for p in people for t in p.elig_types})
    E += [
        f"  SELECT count(*) INTO n FROM public.competencies WHERE name = ANY (ARRAY[{', '.join(map(q, all_comps))}]);",
        f"  IF n <> {len(all_comps)} THEN RAISE EXCEPTION 'A required competency is missing'; END IF;",
        f"  SELECT count(*) INTO n FROM public.eligibility_types WHERE name = ANY (ARRAY[{', '.join(map(q, all_types))}]);",
        f"  IF n <> {len(all_types)} THEN RAISE EXCEPTION 'A required eligibility type is missing'; END IF;",
        "END $$;",
        "",
        "-- Employees.",
    ]
    for p in people:
        brgy, district = fake.random_element(BARANGAYS)
        street = f"{fake.random_int(1, 999)} {fake.random_element(STREETS)}, {district}"
        ec_first = fake.random_element(MALE_FIRST + FEMALE_FIRST)
        ec_phone = phone(fake)
        p.phone = phone(fake)  # type: ignore[attr-defined]
        tin = f"{fake.random_int(100, 999)}-{fake.random_int(100, 999)}-{fake.random_int(100, 999)}-000"
        sss = f"{fake.random_int(10, 99)}-{fake.random_int(1000000, 9999999)}-{fake.random_int(0, 9)}"
        ph = f"{fake.random_int(10, 99)}-{fake.random_int(100000000, 999999999)}-{fake.random_int(0, 9)}"
        pagibig = f"{fake.random_int(1000, 9999)}-{fake.random_int(1000, 9999)}-{fake.random_int(1000, 9999)}"
        email = f"{re.sub(r'[^a-z]', '', p.first.lower())}.{re.sub(r'[^a-z]', '', p.last.lower())}@example.com"
        p.email = email  # type: ignore[attr-defined]
        E.append(
            "INSERT INTO public.employees (id, employee_number, first_name, last_name, email, phone,"
            " current_address_street, current_address_barangay, current_address_city, current_address_province, current_address_zipcode,"
            " permanent_address_street, permanent_address_barangay, permanent_address_city, permanent_address_province, permanent_address_zipcode,"
            " date_of_birth, place_of_birth, sex, civil_status, nationality, tin_number, sss_number, philhealth_number, pagibig_number,"
            " emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_address,"
            " department, position, employment_status, plantilla_num, date_hired, status, user_role, account_status, created_by,"
            " division, highest_educational_attainment, eligibility) VALUES ("
            + ", ".join([
                q(uid("employee", p.number)), q(p.number), q(p.first), q(p.last), q(email), q(p.phone),
                q(street), q(brgy), q("Iloilo City"), q("Iloilo"), q("5000"),
                q(street), q(brgy), q("Iloilo City"), q("Iloilo"), q("5000"),
                q(p.birth.isoformat()), q(fake.random_element(PLACES_OF_BIRTH)), q(p.sex),
                q(fake.random_element(["Single", "Married", "Married", "Married", "Widowed"])), q("Filipino"),
                q(tin), q(sss), q(ph), q(pagibig),
                q(f"{ec_first} {p.last}"), q(fake.random_element(EMERGENCY_RELATIONS)), q(ec_phone),
                q(f"{street}, {brgy}, Iloilo City, Iloilo"),
                q(OFFICE), q(p.seat.title), q(p.status), q(p.seat.item), q(p.hired.isoformat()),
                q("Active"), q("employee"), q("Active"), q(CREATED_BY),
                q(p.seat.division), q(p.degree), q(elig_text(p.seat)),
            ]) + ");"
        )

    E += ["", "-- Eligibility records."]
    for p in people:
        for k, t in enumerate(p.elig_types, start=1):
            exam = p.hired - timedelta(days=fake.random_int(120, 900))
            lic = None
            if t == ELIG_TYPE_BOARD:
                lic = str(fake.random_int(100000, 999999))
            elif t == ELIG_TYPE_DRIVER:
                lic = f"G{fake.random_int(10, 99)}-{fake.random_int(10, 99)}-{fake.random_int(100000, 999999)}"
            elif t == ELIG_TYPE_OTHER and p.seat.item == HEAD_SEAT:
                lic = "CESE"
            validity = "2028-12-31" if t in (ELIG_TYPE_BOARD, ELIG_TYPE_DRIVER) else None
            rating = round(80 + fake.random_int(0, 150) / 10, 1) if t in (ELIG_TYPE_PROF, ELIG_TYPE_SUBPROF, ELIG_TYPE_BOARD) else None
            E.append(
                "INSERT INTO public.employee_eligibility (id, employee_id, eligibility_type, rating, date_of_exam, place_of_examination, license_number, validity_date, sort_order) VALUES ("
                + ", ".join([q(uid("elig", p.number, k)), q(uid("employee", p.number)), q(t),
                             "NULL" if rating is None else str(rating), q(exam.isoformat()), q("Iloilo City"),
                             q(lic), q(validity), str(k)]) + ");"
            )

    E += ["", "-- Training records and competency tags."]
    for p in people:
        for t in p.trainings:
            E.append(
                "INSERT INTO public.employee_training (id, employee_id, training_title, training_type, conducted_by, sponsor, from_date, to_date, number_of_hours, certificate_number) VALUES ("
                + ", ".join([q(t["id"]), q(uid("employee", p.number)), q(t["title"]), q(t["type"]), q(t["agency"]), q(t["agency"]),
                             q(t["from"].isoformat()), q(t["to"].isoformat()), str(t["hours"]), q(t["cert"])]) + ");"
            )
            for comp in t["tags"]:
                E.append(
                    "INSERT INTO public.employee_training_competencies (employee_training_id, competency_id)"
                    f" SELECT {q(t['id'])}, c.id FROM public.competencies c WHERE c.name = {q(comp)};"
                )

    E += ["", "-- Portal logins."]
    for p in people:
        E.append(
            "INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name, email, mobile_number) VALUES ("
            + ", ".join([q("portal-" + p.number), q(p.username), q(p.password), q(p.number),
                         q(f"{p.first} {p.last}"), q(p.email), q(p.phone)]) + ");"  # type: ignore[attr-defined]
        )

    E += ["", "-- GSO critical positions (5) and their required competencies."]
    for item in CRITICAL_SEATS:
        seat = by_item[item].seat
        cp_id = uid("critical", item)
        req_elig = "Professional" if seat.sg > base.FIRST_LEVEL_MAX_SG else "Sub-Professional"
        E.append(
            "INSERT INTO public.critical_positions (id, department_id, title, incumbent_employee_id, criticality_reason, created_by,"
            " required_successors_count, min_years_experience, min_ipcr_rating, required_education, required_eligibility,"
            " required_certifications, required_training_hours, required_training_categories)"
            f" SELECT {q(cp_id)}, d.id, {q(seat.title)}, {q(uid('employee', by_item[item].number))},"
            f" {q(f'Critical {seat.title} post (Seat {item}) in {OFFICE_CODE}')}, {q(CP_CREATED_BY)}, 1,"
            f" {base.experience_years(seat.title, seat.sg)}, 'Very Satisfactory', {q(base.FAMILIES[seat.family].education_field)},"
            f" {q(req_elig)}, '[]'::jsonb, {required_hours(seat.title, seat.sg)}, '[]'::jsonb"
            f" FROM public.departments d WHERE d.code = {q(OFFICE_CODE)};"
        )
        for comp in SEAT_COMPETENCIES[item]:
            E.append(
                "INSERT INTO public.critical_position_competency_requirements (critical_position_id, competency_id, required_level)"
                f" SELECT {q(cp_id)}, c.id, {REQUIRED_LEVEL} FROM public.competencies c WHERE c.name = {q(comp)};"
            )

    E += ["", "-- 2025 IPCR for Regular employees hired before 2025 (draft first: approved targets lock their MFOs)."]
    ipcr_people = [p for p in people if p.status == "Regular" and p.hired < IPCR_CUTOFF]
    strong = {HEAD_SEAT, *SUCCESSOR_OF.values()}
    for p in ipcr_people:
        ts = uid("target_setting", p.number)
        emp = uid("employee", p.number)
        E.append(
            "INSERT INTO public.target_settings (id, employee_id, cycle_id, status, submitted_at, created_at)"
            f" SELECT {q(ts)}, {q(emp)}, pc.id, 'draft', '2025-01-20T01:30:00+00:00', '2025-01-15T01:00:00+00:00'"
            f" FROM public.performance_cycles pc WHERE pc.title = {q(IPCR_CYCLE_TITLE)};"
        )
        duty = fake.random_element(base.FAMILIES[p.seat.family].duties)
        mfos = [
            ("core", duty.rstrip("."), "100% of assigned divisional targets and core deliverables completed within statutory CSC timelines and standards."),
            ("strategic", "Continuous Quality Improvement and Service Innovation", "Implemented 100% of scheduled operational reforms and service enhancement initiatives."),
            ("support", "General Administrative, Documentation, and Operational Support", "Maintained 100% compliance with office administrative reports, attendance, and record-keeping requirements."),
        ]
        for k, (ftype, title, indicator) in enumerate(mfos, start=1):
            mfo, si = uid("mfo", p.number, k), uid("si", p.number, k)
            lo = 4 if p.seat.item in strong else 3
            qq, ee, tt = (fake.random_int(lo, 5) for _ in range(3))
            E += [
                f"INSERT INTO public.mfos (id, target_setting_id, function_type, title, sort_order) VALUES ({q(mfo)}, {q(ts)}, {q(ftype)}, {q(title)}, {k});",
                f"INSERT INTO public.success_indicators (id, mfo_id, description, sort_order) VALUES ({q(si)}, {q(mfo)}, {q(indicator)}, 1);",
                f"INSERT INTO public.success_indicator_ratings (success_indicator_id, quality, efficiency, timeliness, rated_by) VALUES ({q(si)}, {qq}, {ee}, {tt}, {q(emp)});",
            ]
        E.append(
            "UPDATE public.target_settings SET status = 'approved', reviewed_at = '2025-01-25T06:00:00+00:00', approved_at = '2025-01-25T06:00:00+00:00',"
            " phase2_status = 'completed', phase2_completed_at = '2025-12-29T08:30:00+00:00', phase2_approved_at = '2025-12-30T02:15:00+00:00',"
            f" updated_at = '2025-12-30T02:15:00+00:00' WHERE id = {q(ts)};"
        )

    n_elig = sum(len(p.elig_types) for p in people)
    n_trn = sum(len(p.trainings) for p in people)
    n_tags = sum(len(t["tags"]) for p in people for t in p.trainings)
    E += [
        "",
        "DO $$",
        "BEGIN",
        f"  IF (SELECT count(*) FROM public.employees WHERE department = {q(OFFICE)} AND deleted_at IS NULL) <> {len(people)}",
        f"     OR (SELECT count(*) FROM public.employee_eligibility ee JOIN public.employees e ON e.id = ee.employee_id WHERE e.department = {q(OFFICE)}) <> {n_elig}",
        f"     OR (SELECT count(*) FROM public.employee_training t JOIN public.employees e ON e.id = t.employee_id WHERE e.department = {q(OFFICE)}) <> {n_trn}",
        f"     OR (SELECT count(*) FROM public.employee_training_competencies tc JOIN public.employee_training t ON t.id = tc.employee_training_id JOIN public.employees e ON e.id = t.employee_id WHERE e.department = {q(OFFICE)}) <> {n_tags}",
        f"     OR (SELECT count(*) FROM public.employee_portal_accounts WHERE employee_id = ANY (ARRAY[{', '.join(q(p.number) for p in people)}])) <> {len(people)}",
        f"     OR (SELECT count(*) FROM public.critical_positions cp JOIN public.departments d ON d.id = cp.department_id WHERE d.code = {q(OFFICE_CODE)}) <> {len(CRITICAL_SEATS)}",
        f"     OR (SELECT count(*) FROM public.target_settings ts JOIN public.employees e ON e.id = ts.employee_id WHERE e.department = {q(OFFICE)} AND ts.status = 'approved' AND ts.phase2_status = 'completed') <> {len(ipcr_people)}",
        "  THEN RAISE EXCEPTION 'GSO employee import counts do not match; rolled back'; END IF;",
        "END $$;",
        "",
        "COMMIT;",
        "",
    ]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "import_gso_employees.sql").write_text("\n".join(E), encoding="utf-8", newline="\n")
    with (OUT_DIR / "credentials.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["employee_number", "name", "office", "position", "plantilla", "username", "password"])
        for p in people:
            w.writerow([p.number, f"{p.first} {p.last}", OFFICE, p.seat.title, p.seat.item, p.username, p.password])

    lines = ["# GSO employee import report", "",
             f"{len(people)} employees, {sum(p.status == 'Probationary' for p in people)} probationary, "
             f"{len(ipcr_people)} with a 2025 IPCR, {n_elig} eligibility records, {n_trn} trainings, {n_tags} competency tags.", "",
             "## Qualification ranking (head = first)", "",
             "| # | Seat | Position | Name | LGC 480 | Elig level | Elig count | Years | Training h | Education |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for i, p in enumerate(ranked, start=1):
        r = qualification_rank(p)
        lines.append(f"| {i} | {p.seat.item} | {p.seat.title} | {p.first} {p.last} | {'yes' if r[0] else 'no'} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {p.degree} |")
    lines += ["", "## Succession", ""]
    for item in CRITICAL_SEATS:
        seat = by_item[item].seat
        succ = SUCCESSOR_OF.get(item)
        if succ:
            s = by_item[succ]
            lines.append(f"- {item} {seat.title}: holder {by_item[item].first} {by_item[item].last}; Ready Now successor "
                         f"{s.first} {s.last} (seat {succ}, {s.years:.1f} y vs {base.experience_years(seat.title, seat.sg)}, "
                         f"{sum(t['hours'] for t in s.trainings)} h vs {required_hours(seat.title, seat.sg)}, tags {s.tag_set})")
        else:
            lines.append(f"- {item} {seat.title}: holder {by_item[item].first} {by_item[item].last}; gap (no title shares its field word)")
    (OUT_DIR / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\n".join(lines))


if __name__ == "__main__":
    main()
