# Arena Map Compartmentalized Export

This folder was generated from the currently open compressed SVG.

## Start here

- `AI_INDEX.txt`: smallest agent-readable overview.
- `manifest/manifest.min.json`: compact machine-readable map index.
- `manifest/manifest.pretty.json`: readable map index with coordinates.
- `00-full-map/arena-map-organized.svg`: complete map with detected section groups annotated.
- Category folders contain a combined category SVG and individual cropped section SVGs.
- Each category is subdivided by physical direction: north, north-east, east, south-east, south, south-west, west, north-west, or center.

## Folder logic

- `01-lower-bowl`: sections 101–129.
- `02-upper-bowl`: sections 201–225.
- `03-courtside-ring`: C1–C32.
- `04-floor-sections`: large central numeric labels 2, 3, 4, 5, 8, 9, 10, 14, 15, 16, 17, 21, 22, and 23.
- `05-boxes-suites-tables`: B1, B2, BR1–BR3, MC1–MC3, VIP, COURTSIDE VIP, VALKYRIES, VISITOR, and SCORER.
- `06-seat-number-labels`: small numeric text detected as seat numbers, grouped by physical direction.
- `07-unclassified-labels`: remaining text for manual review.

## Detected totals

- Lower Bowl: 29
- Upper Bowl: 25
- Courtside Ring: 32
- Floor Sections: 13
- Boxes, Suites, and Tables: 10
- Seat Number Labels: 105
- Unclassified Labels: 0

## Section directions

- center: 2
- east: 12
- north: 18
- north-east: 7
- north-west: 8
- south: 19
- south-east: 14
- south-west: 14
- west: 15

## Duplicate visible section labels

- none

Duplicate labels are retained as separate files and receive positional suffixes.

## SVG fidelity rules

- Original paths, coordinates, numeric precision, transforms, IDs, classes, gradients, masks, clips, filters, styles, and referenced definitions are preserved.
- Each cropped section SVG includes its ancestor transform/style chain and shared `defs`/`style` content.
- The non-rendering source attributes `t`, `eid`, `obs`, and `sprite-identifier` are removed.
- Redundant descendant `xmlns` attributes, comments, formatting-only whitespace, scripts, and metadata are removed.
- The open source SVG is not modified; all changes are made in exported copies.

## Agent workflow

1. Read `AI_INDEX.txt`.
2. Read the relevant category `index.txt`.
3. Open only the needed cropped section SVG.
4. Use `manifest.min.json` when coordinates or automated lookup are needed.
