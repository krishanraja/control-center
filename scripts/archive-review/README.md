# Archive review — the one-off that feeds the learning loop

On 2026-08-25 the Content queue was found to be serving the thirty oldest of 74
pending cards, so 64 of them aged out between 10 July and 14 August without ever
reaching Krish. They are archived, not deleted. This is the round trip that turns
them into signal.

    build_workbook.py                 -> content-archive-decisions.xlsx  (64 rows, dropdowns per card type)
    <Krish fills in four columns and returns it>
    import_rulings.py <file> <out.sql> -> a SQL migration to review, then apply

## Why a script and not the API

`api/content-decisions/[id].ts` refuses anything that is not `pending` with a 409,
and every one of these rows is `archived`. The endpoint is right to refuse — that
guard is what stops a card being ruled on twice — so this path writes the same
effects directly instead of weakening it.

Each call maps onto what the live endpoints do, so the outcome is identical to
having ruled on the card at the time:

| Call in the sheet | Effect | Mirrors |
|---|---|---|
| Good brief | decision `done`, resolution `approved` | `api/briefs/[week].ts` approve |
| Not for me / Not a shift / Not worth keeping | decision `dismissed` + `feedback_queue` −1 carrying the reason code | `api/content-decisions/[id].ts` reject |
| Track this shift | `shifts.status='active'` | `api/shifts/[id].ts` accept |
| Same as another one | evidence and idea links move to the target, source shift deleted | `api/shifts/[id].ts` merge |
| Yes, retire it | `shifts.status='retired'` | `api/shifts/[id].ts` retire |
| No, still live | `shifts.status='active'` | `api/shifts/[id].ts` keep_watching |
| Keep for good | `content_ideas` gets `library_at`, `horizon='evergreen'`, no expiry | `api/content-decisions/[id].ts` graduation |
| Got it | decision `done`, no signal | acknowledge |
| Leave it / blank | untouched | — |

## The refusals are the point

A rejection is the only call that writes the −1 that Vera clusters by reason code
on Sundays. As of this review the system had received **zero** rejections since
July, so it had learned nothing. `import_rulings.py` refuses to generate SQL if a
rejection has no reason attached, because a reason-less −1 lands in the `other`
bucket and teaches nothing.

The generated SQL writes `meta.title` and `meta.text` onto each feedback row.
Embeddings are left to the existing Saturday backfill
(`/api/feedback/backfill-embeddings`) rather than computed here, so no API key is
needed to run this.

## Running it

    pip install openpyxl
    python3 scripts/archive-review/build_workbook.py          # regenerate the sheet
    python3 scripts/archive-review/import_rulings.py filled.xlsx rulings.sql

Read `rulings.sql` before applying it. It is wrapped in a transaction; every
statement was verified against the live schema on 2026-08-25 by running it and
rolling back. Save the applied file under `scripts/migrations/` so the change has
the same audit trail as every other data change in this repo.
