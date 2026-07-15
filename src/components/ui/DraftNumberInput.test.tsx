import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DraftNumberInput } from './DraftNumberInput';

describe('DraftNumberInput', () => {
  it('keeps multi-digit typing local and commits once on blur', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<DraftNumberInput aria-label="Goal" value={10} min={0} onCommit={onCommit} />);

    const input = screen.getByRole('spinbutton', { name: 'Goal' });
    await user.clear(input);
    await user.type(input, '25');

    expect(input).toHaveValue(25);
    expect(onCommit).not.toHaveBeenCalled();

    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(25);
  });
});
