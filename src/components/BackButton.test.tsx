import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BackButton } from './BackButton';

describe('BackButton', () => {
  it('is a Small secondary button labelled Back that runs onBack', () => {
    const onBack = vi.fn();
    render(<BackButton onBack={onBack} />);

    const button = screen.getByRole('button', { name: 'Back' });
    expect(button).toHaveClass('btn', 'btn-secondary', 'btn-sm');
    expect(button).toHaveAttribute('type', 'button');

    fireEvent.click(button);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
