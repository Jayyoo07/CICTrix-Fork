# import-gso-employees

Seats the 20 filled General Services Office plantillas with employees, following the conventions of the 2026-10-21 employee import (`scripts/import-employees`, already applied live). Decision D25 in `docs/plans/2026-10-21-import-employees.md`.

## Use

Run it **after** `scripts/gso-postings-fixup/gso_postings_fixup.sql`, which creates the GSO office.

```bash
python scripts/import-gso-employees/generate.py
```

It writes to `scratch/import-gso-employees/`, which is gitignored and contains passwords:
- `import_gso_employees.sql`: run once in the Supabase SQL editor. It runs as one transaction and stops before writing anything if GSO already has employees, if an employee number or username is taken, or if a filled seat is missing.
- `credentials.csv`: every login.
- `report.md`: the qualification ranking that picks the head, and the succession result.

## What it creates

- **20 employees**, one per filled seat (`EMP-2026-211`–`230`). Names are Filipino, from curated lists, because Faker's `en_PH` returns US names. Qualifications follow CSC rules for each seat. 2 are probationary (seats 117 and 133), and the rest are Regular.
- Eligibility records using the 8 `eligibility_types` names, training records whose hours meet each seat's requirement, and portal logins (`portal-<employee number>`, with a random password).
- A finalized 2025 IPCR for every Regular employee hired before 2025.
- **5 critical positions** (112, 120, 128, 134, 147) with required competencies. 120 and 128 have a Ready Now successor (the holders of 122 and 130). 112, 134 and 147 are gaps, because no other GSO title shares their field word.
- **Department head:** the holder of seat 112 is built to rank strictly first by qualifications, and the generator fails otherwise. They're appointed through System Administration; this script doesn't link heads.

## Not handled

Head appointment, and renaming the main import's US-named Faker employees.

## Dependencies

Python 3.10+, `faker`, and `scripts/gso-postings-fixup/generate.py` plus `scripts/import-sheet-postings/generate.py` (both imported for the job families and CSC rules).
