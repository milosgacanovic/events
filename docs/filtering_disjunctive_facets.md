# Disjunctive Faceting Rules

Use this behavior for Events and Hosts filters.

## Rule

- A selected filter group must keep showing all options in that same group (with counts), not only selected options.
- Other filter groups must reflect current constrained result set.
- Selected options must stay visible even when count becomes `0`.

## Why

This avoids self-filter collapse and keeps filter exploration predictable.

## Example

If `Practice = Nia` is selected:

- Practice list still shows all practices and counts.
- Event format/language/country counts are recalculated for the Nia-constrained result set.
