import { ArrowLeft } from 'lucide-react';
import { Button } from './Button';

interface BackButtonProps {
  /** The drill-down's own close function. useBackClosesView pops its history
   *  entry when the view closes, so this stays in step with browser Back. */
  onBack: () => void;
  /** Spacing for the wrapper, e.g. "mb-3". */
  className?: string;
}

/**
 * In-page Back for drill-downs (DESIGN_IDENTITY §8.2): a Small secondary pill
 * (§9.1) above the view's title. It renders its own `.abyan-ds` scope because
 * the §9.1 button styles and tokens only apply inside one, and several portals
 * render drill-downs outside it.
 */
export function BackButton({ onBack, className = '' }: BackButtonProps) {
  return (
    <div className={`abyan-ds ${className}`.trim()}>
      <Button type="button" variant="secondary" size="sm" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        Back
      </Button>
    </div>
  );
}
