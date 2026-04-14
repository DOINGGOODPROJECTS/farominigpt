export function groupBy<T, K extends string | number>(
  items: T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const group = map.get(groupKey);
    if (group) {
      group.push(item);
    } else {
      map.set(groupKey, [item]);
    }
  }
  return map;
}

export function indexBy<T, K extends string | number>(
  items: T[],
  key: (item: T) => K,
): Map<K, T> {
  const map = new Map<K, T>();
  for (const item of items) {
    map.set(key(item), item);
  }
  return map;
}
