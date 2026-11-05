function configuredDataProxyBase(): string | null {
  const env = (import.meta as any).env ?? {};
  if (env.VITE_DISABLE_DATA_PROXY === 'true') return null;
  const configured = String(env.VITE_DATA_PROXY_URL ?? '').trim();
  return configured ? configured.replace(/\/+$/, '') : null;
}

function githubCdnCandidate(url: string): string | null {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.hostname !== 'raw.githubusercontent.com') return null;

  const parts = target.pathname.split('/').filter(Boolean);
  const [owner, repo] = parts;
  if (!owner || !repo || parts.length < 4) return null;

  let branch = parts[2];
  let fileParts = parts.slice(3);
  if (parts[2] === 'refs' && parts[3] === 'heads' && parts[4]) {
    branch = parts[4];
    fileParts = parts.slice(5);
  }
  if (!branch || fileParts.length === 0) return null;

  const filePath = fileParts
    .map(part => encodeURIComponent(decodeURIComponent(part)))
    .join('/');
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${filePath}`;
}

function localDevCandidate(url: string): string | null {
  if (typeof window === 'undefined') return null;
  const localHosts = new Set(['localhost', '127.0.0.1']);
  if (!localHosts.has(window.location.hostname)) return null;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.hostname === 'play.basketball-gm.com') {
    return `/__data_proxy/play${target.pathname}${target.search}`;
  }
  if (target.hostname === 'raw.githubusercontent.com') {
    return `/__data_proxy/raw${target.pathname}${target.search}`;
  }
  return null;
}

export function dataUrlCandidates(urls: readonly string[]): string[] {
  const proxyBase = configuredDataProxyBase();

  const candidates: string[] = [];
  for (const url of urls) {
    const cdn = githubCdnCandidate(url);
    if (cdn) candidates.push(cdn);
    const local = localDevCandidate(url);
    if (local) candidates.push(local);
    if (proxyBase) candidates.push(`${proxyBase}/?url=${encodeURIComponent(url)}`);
    candidates.push(url);
  }
  return candidates;
}
