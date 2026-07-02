/**
 * Shared SWR fetcher. Throws on non-2xx responses so error bodies land in
 * SWR's `error` slot instead of being parsed as data.
 */
export async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request to ${url} failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}
