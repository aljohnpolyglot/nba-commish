const PLAYER_ID_VALUE_KEYS = new Set([
  'captainid',
  'endorsedplayers',
  'injuredid',
  'internalid',
  'mvpid',
  'replacementid',
  'retiredplayers',
  'winnerid',
]);

const isPlayerIdValueKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return PLAYER_ID_VALUE_KEYS.has(normalized)
    || normalized.endsWith('playerid')
    || normalized.endsWith('playerids')
    || normalized.endsWith('prospectid')
    || normalized.endsWith('prospectids');
};

function resolvePlayerIdAlias(value: string, aliases: Readonly<Record<string, string>>): string {
  let resolved = value;
  const seen = new Set<string>();
  while (aliases[resolved] && !seen.has(resolved)) {
    seen.add(resolved);
    resolved = aliases[resolved];
  }
  return resolved;
}

export function rewritePlayerIdAliases<T>(
  value: T,
  aliases: Readonly<Record<string, string>>,
): T {
  if (Object.keys(aliases).length === 0) return value;
  const memo = new WeakMap<object, unknown>();

  const visit = (current: unknown, keyHint = ''): unknown => {
    if (typeof current === 'string') {
      return isPlayerIdValueKey(keyHint) ? resolvePlayerIdAlias(current, aliases) : current;
    }
    if (current === null || typeof current !== 'object') return current;
    const cached = memo.get(current);
    if (cached !== undefined) return cached;

    if (Array.isArray(current)) {
      const output: unknown[] = [];
      memo.set(current, output);
      let changed = false;
      current.forEach(item => {
        const next = visit(item, keyHint);
        if (!(isPlayerIdValueKey(keyHint) && typeof next === 'string' && output.includes(next))) output.push(next);
        changed ||= next !== item;
      });
      changed ||= output.length !== current.length;
      if (!changed) {
        memo.set(current, current);
        return current;
      }
      return output;
    }

    const source = current as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    memo.set(current, output);
    let changed = false;
    for (const [key, entry] of Object.entries(source)) {
      const rewrittenKey = resolvePlayerIdAlias(key, aliases);
      const next = visit(entry, key);
      if (!(rewrittenKey !== key && Object.prototype.hasOwnProperty.call(output, rewrittenKey))) {
        output[rewrittenKey] = next;
      }
      changed ||= rewrittenKey !== key || next !== entry;
    }
    if (!changed) {
      memo.set(current, current);
      return current;
    }
    return output;
  };

  return visit(value) as T;
}
