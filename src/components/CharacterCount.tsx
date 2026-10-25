import React from 'react';

/** Share of the limit where the counter turns amber: the last 10%. */
const WARNING_ZONE = 0.9;

type CharacterCountProps = {
  value: string;
  max: number;
  /** Placement tweaks from the caller, e.g. a different top margin. */
  className?: string;
};

/**
 * Live `count/max` readout for a length-limited text field.
 *
 * Neutral until the last 10% of the limit, amber inside that band, red at the
 * cap. Only the reached-limit message is live to screen readers; announcing
 * every keystroke would make the form unusable with a screen reader.
 */
export const CharacterCount: React.FC<CharacterCountProps> = ({ value, max, className = '' }) => {
  const count = value.length;
  const atLimit = count >= max;
  const nearLimit = count >= Math.ceil(max * WARNING_ZONE);
  const tone = atLimit
    ? 'font-semibold text-rose-700'
    : nearLimit
      ? 'font-medium text-amber-700'
      : 'text-slate-500';

  return (
    <p className={`mt-1 text-right text-[10px] leading-none tabular-nums ${tone} ${className}`}>
      <span aria-hidden="true">{count}/{max}</span>
      <span className="sr-only">{count} of {max} characters used.</span>
      <span className="sr-only" aria-live="polite">{atLimit ? ' Character limit reached.' : ''}</span>
    </p>
  );
};
