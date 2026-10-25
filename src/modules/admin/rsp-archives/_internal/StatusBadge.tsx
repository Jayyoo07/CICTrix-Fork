import { badgeVariant, typeLabel } from './model';

/** §9.8 soft badge for statuses; §10 brand-tint tag for categories. */
export const StatusBadge = ({ type }: { type: string }) => {
  const variant = badgeVariant(type);
  if (variant === 'tint') return <span className="badge badge-tint">{typeLabel(type)}</span>;
  return (
    <span className={`badge badge-${variant}`}>
      <span className="badge-dot" aria-hidden="true" />
      {typeLabel(type)}
    </span>
  );
};
