---
"zpi-sdk": minor
---

Codegen types are now enforced: `run()`/`stream()` infer `projectKey`/`endpoint` literals and narrow `params` via `ScraperMap` (new `ScraperParams` helper exported). Codegen output fixed: `export {}` makes the generated file a module augmentation instead of shadowing the package types, hyphenated slugs/field names are quoted, and `*/` in descriptions is escaped.
