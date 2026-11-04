---
type: patch
areas:
  - search
  - checkout
  - collections
---

## Intent

Add combined size, color, upper, sole and last filters backed by the catalog JSONB GIN projection. Reduce the checkout wait for an already completed reservation.

## Invariants

- All selected attributes must match the same active variant in the current channel.
- Preserve facets, collections, prices and stock validation; a queued job is not a confirmed reservation.

## Integration guidance

Deploy the catalog index migration and SearchInput.footwear extension with these filters. Existing search and collection URLs remain valid; attribute filters reset pagination. Deploy the optional marketplaceCheckoutJob(wait: Boolean) argument before the storefront; it waits at most one second and returns immediately upon completion.

## Verification

- Run catalog synchronization, channel isolation, GIN plan and latency integration checks.
- Run storefront type, translation, upgrade and build checks.
