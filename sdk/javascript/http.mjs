/**
 * MoltALPHA Public JavaScript SDK — Shared HTTP & Precision JSON Transport
 * Zero external runtime dependencies (Node.js 20+ built-in fetch).
 */

export const DEFAULT_WWW_BASE_URL = 'https://www.moltalpha.dev';
export const DEFAULT_API_GATEWAY_URL = 'https://api.moltalpha.dev';
export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_RETRIES = 3;

export class MoltAlphaHttpError extends Error {
  constructor(message, { status = 0, code = 'HTTP_ERROR', details = null, url = '', retryAfter = null } = {}) {
    super(message);
    this.name = 'MoltAlphaHttpError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.url = url;
    this.retryAfter = retryAfter;
  }
}

/**
 * Quotes integer literals with >= 16 digits in raw JSON text before JSON.parse
 * so values exceeding Number.MAX_SAFE_INTEGER (2^53 - 1, such as 10^30 Nano raw units)
 * are preserved as exact decimal strings without IEEE-754 float rounding.
 */
export function quoteUnsafeJsonIntegers(rawText) {
  if (typeof rawText !== 'string') {
    throw new TypeError('Expected raw JSON string');
  }
  let inString = false;
  let escaped = false;
  let result = '';
  let i = 0;
  const n = rawText.length;

  while (i < n) {
    const ch = rawText[i];
    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      i += 1;
      continue;
    }

    if ((ch === '-' || (ch >= '0' && ch <= '9'))) {
      let j = i;
      if (rawText[j] === '-') j += 1;
      const digitStart = j;
      while (j < n && rawText[j] >= '0' && rawText[j] <= '9') {
        j += 1;
      }
      const digitCount = j - digitStart;
      const nextChar = j < n ? rawText[j] : '';
      const isFloatOrExp = nextChar === '.' || nextChar === 'e' || nextChar === 'E';
      if (digitCount >= 16 && !isFloatOrExp) {
        const numLiteral = rawText.slice(i, j);
        result += `"${numLiteral}"`;
        i = j;
        continue;
      }
      if (digitCount > 0) {
        while (j < n && /[0-9.eE+-]/.test(rawText[j])) {
          j += 1;
        }
        result += rawText.slice(i, j);
        i = j;
        continue;
      }
    }

    result += ch;
    i += 1;
  }

  return result;
}

export function parseJsonPreservingLargeInts(rawText) {
  return JSON.parse(quoteUnsafeJsonIntegers(rawText));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = undefined,
    apiKey = undefined,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 1,
    retryDelayMs = 100,
    preserveLargeIntegers = false,
    fetchImpl = options.fetch || globalThis.fetch,
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable; use Node.js 20+ or provide fetchImpl');
  }

  const boundedRetries = Math.max(0, Math.min(Number.isFinite(retries) ? Math.trunc(retries) : 1, MAX_RETRIES));
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.trunc(timeoutMs) : DEFAULT_TIMEOUT_MS;

  const reqHeaders = {
    Accept: 'application/json',
    ...headers,
  };
  if (apiKey) {
    reqHeaders['X-API-KEY'] = String(apiKey).trim();
  }
  if (body !== undefined && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  let lastError = null;

  for (let attempt = 0; attempt <= boundedRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`Request timeout after ${effectiveTimeoutMs}ms: ${url}`));
    }, effectiveTimeoutMs);

    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: reqHeaders,
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort =
        controller.signal.aborted ||
        err?.name === 'AbortError' ||
        err?.name === 'TimeoutError' ||
        /abort|timeout/i.test(String(err?.message || err));
      if (isAbort) {
        lastError = new MoltAlphaHttpError(`Request timed out or aborted after ${effectiveTimeoutMs}ms (${url})`, {
          status: 0,
          code: 'REQUEST_TIMEOUT',
          url,
        });
      } else {
        lastError = new MoltAlphaHttpError(`Network request failed for ${url}: ${err?.message || String(err)}`, {
          status: 0,
          code: 'NETWORK_ERROR',
          url,
        });
      }
      if (attempt < boundedRetries && !isAbort) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }

    const contentType = (response.headers?.get?.('content-type') || '').toLowerCase();
    const rawText = await response.text();
    const trimmed = rawText.trim();
    const looksLikeHtml =
      contentType.includes('text/html') ||
      /^<!doctype\s+html/i.test(trimmed) ||
      /^<html[\s>]/i.test(trimmed);

    if (!response.ok) {
      let parsedErr = null;
      if (!looksLikeHtml && trimmed.startsWith('{')) {
        try {
          parsedErr = JSON.parse(trimmed);
        } catch {
          parsedErr = null;
        }
      }
      const errCode =
        parsedErr?.code ||
        parsedErr?.error?.code ||
        (response.status === 401
          ? 'AUTHENTICATION_REQUIRED'
          : response.status === 402
            ? 'PAYMENT_REQUIRED'
            : response.status === 409
              ? 'PAYMENT_REPLAY_DETECTED'
              : response.status === 429
                ? 'RATE_LIMIT_EXCEEDED'
                : `HTTP_${response.status}`);
      const errMsg =
        parsedErr?.message ||
        parsedErr?.error?.message ||
        parsedErr?.detail ||
        `HTTP ${response.status} error from ${url}`;

      const httpErr = new MoltAlphaHttpError(
        `HTTP ${response.status} (${errCode}): ${typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg)}`,
        {
          status: response.status,
          code: errCode,
          details: parsedErr,
          url,
          retryAfter: response.headers?.get?.('retry-after') || null,
        }
      );

      if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < boundedRetries) {
        lastError = httpErr;
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw httpErr;
    }

    if (looksLikeHtml) {
      throw new MoltAlphaHttpError(
        `Unexpected text/html SPA fallback response instead of application/json from ${url}`,
        {
          status: response.status,
          code: 'INVALID_CONTENT_TYPE_HTML',
          url,
        }
      );
    }

    try {
      return preserveLargeIntegers ? parseJsonPreservingLargeInts(rawText) : JSON.parse(rawText);
    } catch (parseErr) {
      throw new MoltAlphaHttpError(
        `Failed to parse JSON response from ${url}: ${parseErr?.message || String(parseErr)}`,
        {
          status: response.status,
          code: 'INVALID_JSON_RESPONSE',
          url,
        }
      );
    }
  }

  throw lastError || new MoltAlphaHttpError(`Request failed for ${url}`, { url });
}
