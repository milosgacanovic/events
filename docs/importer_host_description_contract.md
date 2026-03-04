# Importer Host Description Contract

Canonical host description storage is `descriptionHtml` (single rich field).

## Required importer behavior

1. Build one canonical host description.
2. Send as `descriptionHtml`.
3. Optionally send `descriptionJson` for transition compatibility.

## Normalization rule for legacy source fields

If source provides multiple fields (`bio`, `info`, `description`):

1. Keep unique non-empty sections.
2. Preserve order: Bio, Info, Description.
3. Remove exact duplicates.
4. Convert to HTML paragraphs/sections.

## Transition notes

- API still accepts legacy `descriptionJson`.
- Web/admin now use `descriptionHtml` as source of truth.
- Importer should move fully to `descriptionHtml` to avoid duplicate text.
