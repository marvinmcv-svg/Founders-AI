# Comparison and alternatives pages

One JSON file per page, validated by `apps/www/src/lib/comparisons.ts` (`ComparisonSchema`).

- `_*.json` files are drafts and are never published.
- A file without `"reviewed": true`, a `reviewedBy`, an `asOf` date and at least one source **fails the build**.
- Every claim about another company must be supported by a listed source with its access date (plan 6.17, Rule 1).
- Status: BLOCKED-HUMAN (legal review of competitor claims). Start from `_template.json`.
