import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlatConfirmation } from './FlatConfirmation';

describe('FlatConfirmation', () => {
  const items = [
    { text: 'Contract Law', index: 0, ancestry: [] },
    { text: 'Tort Law', index: 1, ancestry: [] },
    { text: 'Property Law', index: 2, ancestry: [] },
  ];

  it('renders all items', () => {
    render(<FlatConfirmation items={items} totalItems={3} />);
    expect(screen.getByText('Contract Law')).toBeInTheDocument();
    expect(screen.getByText('Tort Law')).toBeInTheDocument();
    expect(screen.getByText('Property Law')).toBeInTheDocument();
  });

  it('shows item count', () => {
    render(<FlatConfirmation items={items} totalItems={3} />);
    expect(screen.getByText('3 items detected')).toBeInTheDocument();
  });

  it('shows singular for 1 item', () => {
    render(<FlatConfirmation items={[items[0]]} totalItems={1} />);
    expect(screen.getByText('1 item detected')).toBeInTheDocument();
  });

  it('renders numbered items', () => {
    render(<FlatConfirmation items={items} totalItems={3} />);
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    expect(screen.getByText('3.')).toBeInTheDocument();
  });
});
