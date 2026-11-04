---
type: patch
areas:
  - checkout
---

## Intent

Show the committed stock reservation while seller orders are prepared, and enable payment only after preparation succeeds.

## Invariants

- Queued requests do not count as confirmed stock.
- The reservation job belongs to the current session and must match the active order before payment.
- Backend validation and the reservation deadline remain authoritative.

## Integration guidance

Deploy the stock-hold migration and API with the admission and general Worker roles. The existing combined Worker role remains available for development. The review step reserves once and passes that owned job to payment preparation.

Checkout job identifiers and the `marketplaceCheckoutJob` argument use `String`, since BullMQ job UUIDs are not Vendure entity IDs. Deploy these query variable types with the API; the backend still accepts the string representations of older numeric job identifiers.

## Verification

Run checkout Shop API integration, reservation load and recovery checks; run storefront translation, upgrade, types and production build checks.
