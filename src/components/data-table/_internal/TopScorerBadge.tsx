import { Trophy } from 'lucide-react';

/** "Top scorer" label for a highlighted row, so the highlight never relies on colour alone. */
export function TopScorerBadge() {
  return (
    <span className="abyan-top-badge">
      <Trophy size={12} strokeWidth={2} aria-hidden="true" />
      Top scorer
    </span>
  );
}
