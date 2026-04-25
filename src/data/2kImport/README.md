# 2K Import Bundle

Generated from the local NBA 2K14 install and RED MC text metadata.

Use `python\extract_2k_importables.py` to regenerate.

Contents:
- `raw/`: copied source text files from RED MC
- `captions.ts`: parsed RED MC caption metadata
- `coachSchema.ts`: nba-commish-friendly coach/staff schema
- `coachesBinaryAnalysis.ts`: binary/header hints for `coaches.bin`
- `fxgBinaryAnalysis.ts`: descriptor/header hints for `Association6.FXG`
- `transactionSchema.ts`: grouped transaction schema for logs/templates
- `assetManifest.ts`: candidate 2K file manifest by category
- `textTemplateSources.ts`: local template/news/headline seed references
