export function extractScanParameters(url: string): {
  cursor: number;
  listPage: number;
  pageSize: number;
} {
  const parsed = new URL(url);

  const cursorParam = parsed.searchParams.get('cursor');
  const listPageParam = parsed.searchParams.get('listPage');
  const pageSizeParam = parsed.searchParams.get('pageSize');

  const cursor = Number(cursorParam);
  const listPage = Number(listPageParam);
  const pageSize = Number(pageSizeParam);

  return {
    cursor,
    listPage,
    pageSize,
  };
}

export function replaceScanParameters(
  url: string,
  cursor: number,
  listPage: number,
  pageSize: number,
): string {
  const u = new URL(url);

  const required = ['cursor', 'pageSize', 'listPage'] as const;
  for (const key of required) {
    if (!u.searchParams.has(key)) {
      throw new Error(`Missing required query parameter: ${key}`);
    }
  }

  const originalParameters = u.search.length > 1 ? u.search.slice(1).split('&') : [];

  const updatedParameters = originalParameters.map((pair) => {
    if (!pair) return pair;

    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawVal = eq === -1 ? '' : pair.slice(eq + 1);

    const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));

    if (key === 'cursor') return `${rawKey}=${encodeURIComponent(String(cursor))}`;
    if (key === 'pageSize') return `${rawKey}=${encodeURIComponent(String(pageSize))}`;
    if (key === 'listPage') return `${rawKey}=${encodeURIComponent(String(listPage))}`;

    return eq === -1 ? rawKey : `${rawKey}=${rawVal}`;
  });

  u.search = updatedParameters.join('&');
  return u.toString();
}
