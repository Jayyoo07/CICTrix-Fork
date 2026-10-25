import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CharacterCount } from './CharacterCount';

const counterFor = (value: string, max: number) => {
  const { container } = render(<CharacterCount value={value} max={max} />);
  return container.querySelector('p') as HTMLParagraphElement;
};

describe('CharacterCount', () => {
  it('stays neutral before the final 10% of the limit', () => {
    const counter = counterFor('a'.repeat(89), 100);

    expect(counter).toHaveTextContent('89/100');
    expect(counter).toHaveClass('text-slate-500');
  });

  it('turns amber inside the final 10%', () => {
    const counter = counterFor('a'.repeat(90), 100);

    expect(counter).toHaveTextContent('90/100');
    expect(counter).toHaveClass('text-amber-700');
  });

  it('turns red and announces the cap when reached', () => {
    const counter = counterFor('a'.repeat(100), 100);

    expect(counter).toHaveTextContent('100/100');
    expect(counter).toHaveClass('text-rose-700');
    expect(counter).toHaveTextContent('Character limit reached.');
  });
});
