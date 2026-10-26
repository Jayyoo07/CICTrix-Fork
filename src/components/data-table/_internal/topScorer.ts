export interface TopScorerOptions<T> {
  /** Stable row id. */
  idOf: (row: T) => string;
  /** The score the table ranks by. null/undefined = not scored yet. */
  scoreOf: (row: T) => number | null | undefined;
  /** The comparison group, e.g. the position. Omit when the whole table is one group. */
  groupOf?: (row: T) => string;
  /** Fewer rows than this in a group means there is nothing to compare. Default 2. */
  minGroupSize?: number;
}

/**
 * Ids of the highest scorer(s) in each comparison group. Ties are all included.
 * Nothing is returned for a group with no positive score or fewer than
 * `minGroupSize` rows. Pass the full data, not the visible page, so sorting,
 * filtering and pagination never change who is top.
 */
export function topScorerIds<T>(rows: readonly T[], options: TopScorerOptions<T>): Set<string> {
  const { idOf, scoreOf, groupOf = () => '', minGroupSize = 2 } = options;
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const top = new Set<string>();
  for (const members of groups.values()) {
    if (members.length < minGroupSize) continue;
    let best = 0;
    for (const row of members) {
      const score = scoreOf(row);
      if (typeof score === 'number' && Number.isFinite(score) && score > best) best = score;
    }
    if (best <= 0) continue;
    for (const row of members) {
      if (scoreOf(row) === best) top.add(idOf(row));
    }
  }
  return top;
}

/** Row class for the highlight; empty when the row is not a top scorer. */
export const topScorerRowClass = (isTop: boolean): string => (isTop ? 'is-top-scorer' : '');
