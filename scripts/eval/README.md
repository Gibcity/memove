# §10.6 ranking eval

Deterministic gate for the relocation scoring engine.

## Run

```
npm run eval                    # gate; exits 1 if below threshold
npm run eval --workspace=trek   # from project root
```

Env knobs:

- `EVAL_PASS_THRESHOLD` (default `1.0`) — fraction of cases that must pass.
- `EVAL_OVERLAP` (default `0.6`) — min Jaccard overlap on top-K IDs vs expected.

## Regenerate fixtures

After a scoring-engine or corpus change:

```
node scripts/eval/generate-fixtures.mjs
```

Re-runs the 15 profiles against `scoreLocations` and rewrites
`fixtures/ranking-cases.json`. The threshold scores are derived from the
new run, so the gate stays accurate without manual editing.

## Profiles

See `profiles.mjs`. Each is `{ weights, filters?, assertStates }`. The
generated fixture captures the actual top-5 IDs and scores, plus
`assertions.minTopScore` (= actual top-1) and `assertions.top5Contains`
(the asserted states — at least one must appear in the actual top-5).