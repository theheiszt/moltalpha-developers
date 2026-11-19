# Example 3 — React Payment Checkout Component (`MoltAlphaCheckout.tsx`)

A reusable, accessible React + TypeScript payment checkout component for non-custodial Solana (`USDC` / `SOL`) and Nano (`XNO`) settlements.

## Capabilities

- **Token & Rail Selection**: Accessible tablist (`role="tablist"`, `aria-selected`, non-color underline active indicator) for `USDC (Solana SPL)` and `SOL (Native)`.
- **Anti-Mint Wallet Guard**: Validates that the displayed merchant destination address is never the SPL USDC Mint contract (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
- **Solana Pay Deep Link**: Launches `solana:<recipient>?amount=...&spl-token=...&reference=...` directly in compatible Solana wallets.
- **Accessible Clipboard Feedback**: Uses `<button type="button">` with an external `role="status"` live region (`\u00A0` repeat-announcement handling) and never disables the copy button while showing feedback.
- **Server-Side Verification Only**: Never fulfills orders from browser wallet events alone; submits the transaction signature to your backend or `POST /v1/payments/verify-solana`.

## Installation & Usage

Copy `MoltAlphaCheckout.tsx` into your React 18+ / Vite / Next.js application and configure `env.template`:

```tsx
import { MoltAlphaCheckout } from './MoltAlphaCheckout';

export function CheckoutPage() {
  return (
    <MoltAlphaCheckout
      apiBaseUrl="https://api.moltalpha.dev"
      defaultTier="tier_starter"
      defaultCurrency="USDC"
      onVerified={(result) => {
        console.log('Verified settlement:', result.invoice_id, result.status);
      }}
    />
  );
}
```
