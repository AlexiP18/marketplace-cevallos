---
type: patch
areas:
  - orders
  - checkout
  - account
---

## Intent

Display the server-authorized reservation deadline in checkout, order confirmation and account order details.

## Invariants

- The backend owns stock and expiry decisions; the countdown never extends a reservation.
- Use server timestamps and elapsed monotonic time instead of trusting the browser wall clock.
- Request reservation details using the current customer's session and disable response caching.

## Integration guidance

Deploy with the backend Order.marketplaceReservations extension. Preserve the existing order page customizations and localized OrderReservation messages.

## Verification

- Run the reservation clock tests, storefront checks and the backend reservation recovery integration.
