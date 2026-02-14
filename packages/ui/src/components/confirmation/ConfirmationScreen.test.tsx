import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmationScreen } from './ConfirmationScreen';
import type { ParseResult } from '@folio-mapper/core';

const flatResult: ParseResult = {
  format: 'flat',
  items: [
    { text: 'Contract Law', index: 0, ancestry: [] },
    { text: 'Tort Law', index: 1, ancestry: [] },
  ],
  hierarchy: null,
  total_items: 2,
  headers: null,
  source_filename: 'test.csv',
  raw_preview: null,
};

const hierarchicalResult: ParseResult = {
  format: 'hierarchical',
  items: [{ text: 'Securities', index: 0, ancestry: ['Litigation', 'Class Action'] }],
  hierarchy: [
    {
      label: 'Litigation',
      depth: 0,
      children: [
        {
          label: 'Class Action',
          depth: 1,
          children: [{ label: 'Securities', depth: 2, children: [] }],
        },
      ],
    },
  ],
  total_items: 1,
  headers: null,
  source_filename: 'hierarchical.csv',
  raw_preview: null,
};

describe('ConfirmationScreen', () => {
  it('renders flat result as numbered list', () => {
    render(
      <ConfirmationScreen
        result={flatResult}
        onEdit={() => {}}
        onContinue={() => {}}
        onTreatAsFlat={() => {}}
      />,
    );
    expect(screen.getByText('Contract Law')).toBeInTheDocument();
    expect(screen.getByText('Tort Law')).toBeInTheDocument();
    expect(screen.getByText('Source: test.csv')).toBeInTheDocument();
  });

  it('renders hierarchical result as tree', () => {
    render(
      <ConfirmationScreen
        result={hierarchicalResult}
        onEdit={() => {}}
        onContinue={() => {}}
        onTreatAsFlat={() => {}}
      />,
    );
    expect(screen.getByText('Litigation')).toBeInTheDocument();
    expect(screen.getByText('Class Action')).toBeInTheDocument();
    expect(screen.getByText('Securities')).toBeInTheDocument();
    expect(screen.getByText('Treat as flat list instead')).toBeInTheDocument();
  });

  it('calls onEdit when Edit button clicked', () => {
    const onEdit = vi.fn();
    render(
      <ConfirmationScreen
        result={flatResult}
        onEdit={onEdit}
        onContinue={() => {}}
        onTreatAsFlat={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('calls onContinue when Continue button clicked', () => {
    const onContinue = vi.fn();
    render(
      <ConfirmationScreen
        result={flatResult}
        onEdit={() => {}}
        onContinue={onContinue}
        onTreatAsFlat={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
