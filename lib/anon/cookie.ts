import { nanoid } from 'nanoid';

export function makeAnonId(): string {
  return nanoid(21);
}

// --- Web Crypto helpers --------------------------------------------------

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

/** Constant-time string equality. Length-mismatch returns false immediately. */
function timingSafeStringEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Public API -----------------------------------------------------------

export async function signAnonId(id: string, secret: string): Promise<string> {
  return `${id}.${await hmac(id, secret)}`;
}

export async function verifyAnonCookie(
  cookieValue: string,
  secret: string,
): Promise<string | null> {
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 1) return null;
  const id = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = await hmac(id, secret);
  return timingSafeStringEq(sig, expected) ? id : null;
}
