export type PaymentRail = 'solana' | 'nano';
export type PaymentAsset = 'USDC' | 'SOL' | 'XNO';
export type SolanaCluster = 'mainnet-beta' | 'devnet';
export type PaymentPricingTier =
  | 'tier_micro'
  | 'tier_starter'
  | 'tier_pro'
  | 'tier_premium'
  | 'tier_unlimited'
  | 'topup_500'
  | 'topup_1500'
  | 'topup_5000';

export interface MoltAlphaOptions {
  apiKey?: string;
  baseUrl?: string;
  gatewayUrl?: string;
  webBaseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  merchantWallet?: string;
  network?: PaymentRail;
  cluster?: SolanaCluster;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
}

export interface CreatePaymentRequestInput {
  target_tier?: PaymentPricingTier | string;
  tier?: PaymentPricingTier | string;
  asset?: PaymentAsset;
  currency?: PaymentAsset;
  rail?: PaymentRail;
  network?: PaymentRail;
  cluster?: SolanaCluster;
  amount?: string | bigint;
  expected_payer?: string;
  expectedPayer?: string;
  target_api_key?: string;
  targetApiKey?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
}

export interface SolanaInvoiceResponse {
  success: boolean;
  invoice_id: string;
  reference: string;
  target_tier: string;
  credits: number;
  asset: 'USDC' | 'SOL';
  amount_raw: number | string;
  amount_formatted: string;
  treasury_wallet: string;
  cluster: SolanaCluster;
  solana_pay_url: string;
  claim_secret: string;
  created_at: string;
  expires_at: string;
  instructions: string;
}

export interface NanoInvoiceResponse {
  success: boolean;
  invoice_id: string;
  rail: 'nano';
  tier: string;
  credits: number;
  asset: 'XNO';
  amount_raw: string;
  amount_xno: string;
  recipient: string;
  merchant_address: string;
  claim_secret: string;
  instructions: string;
  expires_at: string;
  verify_endpoint: string;
}

export type PaymentInvoiceResponse = SolanaInvoiceResponse | NanoInvoiceResponse;

export interface InvoiceStatusResponse {
  success: boolean;
  invoice_id: string;
  reference: string;
  status: 'pending' | 'fulfilled' | 'expired';
  rail: PaymentRail;
  tier: string;
  credits: number;
  asset: PaymentAsset;
  amount_raw: number | string;
  recipient: string;
  cluster: string;
  tx_signature: string | null;
  created_at: string;
  expires_at: string;
  fulfilled_at: string | null;
}

export interface VerifySolanaPaymentInput {
  transaction_signature?: string;
  tx_signature?: string;
  signature?: string;
  invoice_id?: string;
  invoiceId?: string;
  claim_secret?: string;
  claimSecret?: string;
  expected_payer?: string;
  expectedPayer?: string;
  expected_reference?: string;
  expectedReference?: string;
}

export interface VerifySolanaPaymentResponse {
  success: boolean;
  status?: 'newly_minted' | 'topped_up' | 'already_redeemed';
  message: string;
  api_key?: string | null;
  key_prefix: string;
  credits: number;
  tier: string;
  invoice_id?: string;
}

export interface VerifyNanoPaymentInput {
  block_hash?: string;
  blockHash?: string;
  tx_hash?: string;
  hash?: string;
  invoice_id: string;
  claim_secret: string;
}

export interface VerifyNanoPaymentResponse {
  success: boolean;
  api_key?: string | null;
  credits: number;
  tier: string;
  rail: 'nano';
  block_hash: string;
  state_witness_id: string | null;
  message?: string;
}

export interface ReconcilePaymentInput {
  transaction_signature: string;
  invoice_id?: string;
  expected_payer?: string;
  claim_secret?: string;
  auto_refund_unmatched?: boolean;
}

export interface ReconcilePaymentResponse {
  success: boolean;
  reconciliation_status: 'REDEEMED' | 'QUARANTINED_UNMATCHED' | 'RECONCILED_AND_FULFILLED';
  tx_signature: string;
  invoice_id?: string | null;
  unmatched_id?: string;
  status?: string;
  reason?: string;
  key_prefix?: string;
  tier?: string;
  credits?: number;
  state_witness_id?: string | null;
  witness_signature?: string | null;
}

export interface TransactionStatusResponse {
  success: boolean;
  status: 'pending_or_unredeemed' | 'redeemed';
  tx_signature: string;
  asset?: PaymentAsset;
  tier?: string;
  credits_granted?: number;
  remaining_credits?: number;
  key_prefix?: string;
  is_active?: boolean;
  redeemed_at?: string;
  message?: string;
}

export interface ClaimCredentialResponse {
  success: boolean;
  status: 'recovered';
  api_key: string;
  key_prefix: string;
  tier: string;
  credits: number;
  invoice_id: string;
  message: string;
}

export interface WalletValidationResult {
  valid: boolean;
  rail: string;
  address: string;
  code:
    | 'OK'
    | 'EMPTY_WALLET_ADDRESS'
    | 'INVALID_NANO_ADDRESS'
    | 'UNSUPPORTED_RAIL'
    | 'MINT_ADDRESS_NOT_WALLET'
    | 'INVALID_SOLANA_BASE58';
  reason: string | null;
}

export interface SolanaPayUrlInput {
  recipient?: string;
  treasuryWallet?: string;
  amount?: string | bigint | number;
  asset?: 'USDC' | 'SOL';
  currency?: 'USDC' | 'SOL';
  reference?: string;
  label?: string;
  message?: string;
  memo?: string;
  splToken?: string;
  usdcMint?: string;
}

export interface WebhookVerificationOptions {
  toleranceSeconds?: number;
  nowSeconds?: number;
}

export interface WebhookVerificationResult {
  valid: boolean;
  code:
    | 'OK'
    | 'WEBHOOK_SECRET_MISSING'
    | 'WEBHOOK_SIGNATURE_MISSING'
    | 'WEBHOOK_SIGNATURE_MALFORMED'
    | 'WEBHOOK_TIMESTAMP_EXPIRED'
    | 'WEBHOOK_SIGNATURE_MISMATCH';
  reason: string | null;
  timestamp: number | null;
}

export declare const CANONICAL_SOLANA_TREASURY = 'BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx';
export declare const CANONICAL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export declare const CANONICAL_NANO_TREASURY = 'nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu';

export declare function decimalToRawUnits(amountInput: string | bigint | number, assetOrDecimals?: PaymentAsset | number): bigint;
export declare function rawUnitsToDecimal(rawInput: bigint | string | number, assetOrDecimals?: PaymentAsset | number): string;
export declare function validateMerchantWallet(address: string, rail?: PaymentRail | string): WalletValidationResult;
export declare function buildSolanaPayUrl(params?: SolanaPayUrlInput): string;
export declare function signWebhookPayload(payload: string | Buffer | Record<string, unknown>, secret: string, timestampSeconds?: number): string;
export declare function verifyWebhookSignature(
  payload: string | Buffer | Record<string, unknown>,
  signatureHeader: string,
  secret: string,
  options?: WebhookVerificationOptions
): WebhookVerificationResult;
export declare function verifyInboundWebhookSecret(providedSecret: string, expectedSecret: string): boolean;

export declare class PaymentsClient {
  options: MoltAlphaOptions;
  constructor(options?: MoltAlphaOptions);
  parsePaymentConfigJson(rawText: string): Record<string, unknown>;
  toRawUnits(amountInput: string | bigint | number, asset?: PaymentAsset | number): bigint;
  fromRawUnits(rawInput: bigint | string | number, asset?: PaymentAsset | number): string;
  validateMerchantWallet(address: string, rail?: PaymentRail | string): WalletValidationResult;
  buildSolanaPayUrl(params?: SolanaPayUrlInput): string;
  signWebhookPayload(payload: string | Buffer | Record<string, unknown>, secret: string, timestampSeconds?: number): string;
  verifyWebhookSignature(
    payload: string | Buffer | Record<string, unknown>,
    signatureHeader: string,
    secret: string,
    options?: WebhookVerificationOptions
  ): WebhookVerificationResult;
  getConfig(overrideOptions?: MoltAlphaOptions): Promise<Record<string, unknown>>;
  create(payload?: CreatePaymentRequestInput, overrideOptions?: MoltAlphaOptions): Promise<PaymentInvoiceResponse>;
  createInvoice(payload?: CreatePaymentRequestInput, overrideOptions?: MoltAlphaOptions): Promise<PaymentInvoiceResponse>;
  getStatus(invoiceId: string, overrideOptions?: MoltAlphaOptions): Promise<InvoiceStatusResponse>;
  getInvoice(invoiceId: string, overrideOptions?: MoltAlphaOptions): Promise<InvoiceStatusResponse>;
  getTransactionStatus(signature: string, overrideOptions?: MoltAlphaOptions): Promise<TransactionStatusResponse>;
  claimCredential(invoiceId: string, claimSecret: string, overrideOptions?: MoltAlphaOptions): Promise<ClaimCredentialResponse>;
  verifySolana(payload: VerifySolanaPaymentInput, overrideOptions?: MoltAlphaOptions): Promise<VerifySolanaPaymentResponse>;
  verifySolanaPayment(payload: VerifySolanaPaymentInput, overrideOptions?: MoltAlphaOptions): Promise<VerifySolanaPaymentResponse>;
  verifyNano(payload: VerifyNanoPaymentInput, overrideOptions?: MoltAlphaOptions): Promise<VerifyNanoPaymentResponse>;
  verifyNanoPayment(payload: VerifyNanoPaymentInput, overrideOptions?: MoltAlphaOptions): Promise<VerifyNanoPaymentResponse>;
  reconcile(payload: ReconcilePaymentInput, overrideOptions?: MoltAlphaOptions): Promise<ReconcilePaymentResponse>;
  reconcilePayment(payload: ReconcilePaymentInput, overrideOptions?: MoltAlphaOptions): Promise<ReconcilePaymentResponse>;
}

export declare class MoltAlpha {
  options: MoltAlphaOptions;
  payments: PaymentsClient;
  witness: Record<string, unknown>;
  market: Record<string, unknown>;
  sentinel: Record<string, unknown>;
  constructor(options?: MoltAlphaOptions);
}

export declare const MoltAlphaClient: typeof MoltAlpha;
export default MoltAlpha;
