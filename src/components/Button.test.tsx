import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button';

describe('Button loading', () => {
  it('keeps its label, marks itself busy, and blocks repeat clicks', () => {
    render(<Button loading>Save changes</Button>);

    const button = screen.getByRole('button', { name: /save changes/i });
    expect(button).toHaveTextContent('Save changes');
    expect(button).toHaveClass('is-loading');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });
});
