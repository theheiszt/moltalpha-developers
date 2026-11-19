import React, { useId, useRef, useState } from 'react';

export interface CreatedInvoice {
  invoice_id: string;
  reference: string;
  target_tier: string;
  credits: number;
  asset: 'USDC' | 'SOL';
  amount_raw: number | string;
  amount_formatted: string;
  treasury_wallet: string;
  cluster: 'mainnet-beta' | 'devnet';
  solana_pay_url: string;
  claim_secret: string;
  expires_at: string;
}

export interface VerifiedSettlementResult {
  success: boolean;
  status: string;
  invoice_id: string;
  tier: string;
  credits: number;
  key_prefix: string;
  message: string;
}

export interface MoltAlphaCheckoutProps {
  apiBaseUrl?: string;
  defaultTier?: 'tier_micro' | 'tier_starter' | 'tier_pro' | 'tier_premium';
  defaultCurrency?: 'USDC' | 'SOL';
  cluster?: 'mainnet-beta' | 'devnet';
  onVerified?: (result: VerifiedSettlementResult) => void;
}

const CANONICAL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const MoltAlphaCheckout: React.FC<MoltAlphaCheckoutProps> = ({
  apiBaseUrl = 'https://api.moltalpha.dev',
  defaultTier = 'tier_starter',
  defaultCurrency = 'USDC',
  cluster = 'mainnet-beta',
  onVerified,
}) => {
  const baseId = useId();
  const [currency, setCurrency] = useState<'USDC' | 'SOL'>(defaultCurrency);
  const [invoice, setInvoice] = useState<CreatedInvoice | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [txSignature, setTxSignature] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState<VerifiedSettlementResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyStatusText, setCopyStatusText] = useState('');
  const lastAnnouncedRef = useRef('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announceCopyStatus = (ok: boolean) => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    let msg = ok ? 'Copied' : 'Copy failed';
    if (msg === lastAnnouncedRef.current) {
      msg += '\u00A0';
    }
    lastAnnouncedRef.current = msg;
    setCopyStatusText(msg);
    copyTimerRef.current = setTimeout(() => {
      setCopyStatusText('');
    }, 2000);
  };

  const handleCopyAddress = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      announceCopyStatus(true);
    } catch {
      announceCopyStatus(false);
    }
  };

  const handleCreateInvoice = async () => {
    setIsCreating(true);
    setErrorMessage(null);
    setVerifiedResult(null);
    try {
      const root = apiBaseUrl.replace(/\/+$/, '');
      const res = await fetch(`${root}/v1/payments/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_tier: defaultTier,
          asset: currency,
          rail: 'solana',
          cluster,
        }),
      });
      const data = (await res.json()) as CreatedInvoice & { detail?: string };
      if (!res.ok) {
        throw new Error(data.detail || `Invoice creation failed (HTTP ${res.status})`);
      }
      if (data.treasury_wallet === CANONICAL_USDC_MINT) {
        throw new Error('Safety error: recipient wallet matches SPL USDC Mint contract.');
      }
      setInvoice(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to create payment request.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleVerifyTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice || !txSignature.trim()) return;
    setIsVerifying(true);
    setErrorMessage(null);
    try {
      const root = apiBaseUrl.replace(/\/+$/, '');
      const res = await fetch(`${root}/v1/payments/verify-solana`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          transaction_signature: txSignature.trim(),
          claim_secret: invoice.claim_secret,
        }),
      });
      const data = (await res.json()) as VerifiedSettlementResult & { detail?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.detail || data.message || `Verification failed (HTTP ${res.status})`);
      }
      setVerifiedResult(data);
      onVerified?.(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'On-chain verification failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <section
      aria-label="MoltAlpha Non-Custodial Solana Checkout"
      className="rounded-xl border border-cyan-500/30 bg-slate-950 p-5 text-slate-100 space-y-4"
    >
      <header className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-white text-balance">
            Solana Direct-to-Wallet Checkout
          </h3>
          <p className="text-xs text-slate-400 text-pretty">
            Non-custodial settlement verified server-side on Solana ({cluster}).
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Select payment currency"
          className="flex items-center gap-1 overflow-x-auto"
        >
          {(['USDC', 'SOL'] as const).map((token) => {
            const selected = currency === token;
            return (
              <button
                key={token}
                id={`${baseId}-tab-${token}`}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setCurrency(token);
                  setInvoice(null);
                  setVerifiedResult(null);
                }}
                className={`relative px-3 py-1.5 text-xs font-mono cursor-pointer ${
                  selected
                    ? 'text-cyan-300 after:content-[""] after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-cyan-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {token}
              </button>
            );
          })}
        </div>
      </header>

      <div
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${currency}`}
      >
        <div className="space-y-4">
          {!invoice ? (
            <button
              type="button"
              onClick={handleCreateInvoice}
              disabled={isCreating}
              className="w-full py-2.5 px-4 rounded-lg bg-cyan-500/20 border border-cyan-400 text-cyan-200 text-xs font-mono uppercase tracking-wider cursor-pointer"
            >
              {isCreating ? 'Creating Payment Request...' : `Create ${currency} Payment Request`}
            </button>
          ) : (
            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Invoice ID:</span>
                  <span className="text-cyan-300">{invoice.invoice_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount Due:</span>
                  <span className="text-emerald-300 font-bold">{invoice.amount_formatted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reference Key:</span>
                  <span className="text-slate-200 truncate max-w-[200px]">{invoice.reference}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="text-slate-400">Merchant Receiving Wallet:</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] text-cyan-200 break-all">
                    {invoice.treasury_wallet}
                  </code>
                  <span className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyAddress(invoice.treasury_wallet)}
                      aria-label="Copy merchant receiving wallet address"
                      className="min-w-[24px] min-h-[24px] px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
                    >
                      Copy
                    </button>
                    <span
                      role="status"
                      className={`text-[11px] text-emerald-400 transition-opacity ${
                        copyStatusText ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      {copyStatusText}
                    </span>
                  </span>
                </div>
              </div>

              <a
                href={invoice.solana_pay_url}
                className="block text-center py-2 px-3 rounded-lg bg-purple-500/20 border border-purple-400/50 text-purple-200 hover:bg-purple-500/30"
              >
                Open in Solana Pay Wallet
              </a>

              <form onSubmit={handleVerifyTransaction} className="space-y-2 pt-2">
                <label htmlFor={`${baseId}-tx-input`} className="block text-slate-300">
                  Submit Solana Transaction Signature for Server-Side Verification:
                </label>
                <input
                  id={`${baseId}-tx-input`}
                  type="text"
                  value={txSignature}
                  onChange={(e) => setTxSignature(e.target.value)}
                  placeholder="5UfDuX7WXY8Qp9LkM2nN4pQrStUvWxYz..."
                  required
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100"
                />
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-500/20 border border-emerald-400 text-emerald-200 uppercase tracking-wider cursor-pointer"
                >
                  {isVerifying ? 'Verifying On-Chain...' : 'Verify On-Chain Settlement'}
                </button>
              </form>
            </div>
          )}

          {errorMessage && (
            <div role="alert" className="p-2.5 rounded bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
              {errorMessage}
            </div>
          )}

          {verifiedResult && (
            <div role="status" className="p-3 rounded bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200 space-y-1">
              <div className="font-bold">Settlement Confirmed ({verifiedResult.status})</div>
              <div>
                Invoice {verifiedResult.invoice_id} fulfilled ({verifiedResult.credits} credits · {verifiedResult.tier}).
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default MoltAlphaCheckout;
