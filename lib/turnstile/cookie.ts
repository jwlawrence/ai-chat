export interface TrustPayload {
  verifiedAt: number;
  expiresAt: number;
}

// --- Web Crypto helpers --------------------------------------------------

function base64urlEncodeStr(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecodeStr(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

function base64urlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(value: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return base64urlFromBuffer(sig);
}

function timingSafeStringEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Public API -----------------------------------------------------------

export async function signTrust(payload: TrustPayload, secret: string): Promise<string> {
  const encoded = base64urlEncodeStr(JSON.stringify(payload));
  return `${encoded}.${await hmac(encoded, secret)}`;
}

export async function verifyTrust(
  cookieValue: string,
  secret: string,
): Promise<TrustPayload | null> {
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 1) return null;
  const encoded = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = await hmac(encoded, secret);
  if (!timingSafeStringEq(sig, expected)) return null;
  try {
    const payload = JSON.parse(base64urlDecodeStr(encoded)) as TrustPayload;
    if (typeof payload.verifiedAt !== 'number' || typeof payload.expiresAt !== 'number') {
      return null;
    }
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
