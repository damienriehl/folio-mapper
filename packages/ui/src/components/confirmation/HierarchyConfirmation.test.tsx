import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HierarchyConfirmation } from './HierarchyConfirmation';
import type { HierarchyNode } from '@folio-mapper/core';

const hierarchy: HierarchyNode[] = [
  {
    label: 'Litigation',
    depth: 0,
    children: [
      {
        label: 'Class Action',
        depth: 1,
        children: [
          { label: 'Securities', depth: 2, children: [] },
          { label: 'Consumer Protection', depth: 2, children: [] },
        ],
      },
    ],
  },
];

describe('HierarchyConfirmation', () => {
  it('renders tree nodes', () => {
    render(
      <HierarchyConfirmation hierarchy={hierarchy} totalItems={2} onTreatAsFlat={() => {}} />,
    );
    expect(screen.getByText('Litigation')).toBeInTheDocument();
    expect(screen.getByText('Class Action')).toBeInTheDocument();
    expect(screen.getByText('Securities')).toBeInTheDocument();
    expect(screen.getByText('Consumer Protection')).toBeInTheDocument();
  });

  it('shows leaf count', () => {
    render(
      <HierarchyConfirmation hierarchy={hierarchy} totalItems={2} onTreatAsFlat={() => {}} />,
    );
    expect(screen.getByText('2 leaf items detected (hierarchical)')).toBeInTheDocument();
  });

  it('can collapse/expand nodes', () => {
    render(
      <HierarchyConfirmation hierarchy={hierarchy} totalItems={2} onTreatAsFlat={() => {}} />,
    );

    // All nodes should be visible initially
    expect(screen.getByText('Securities')).toBeVisible();

    // Click collapse on "Litigation"
    const collapseButtons = screen.getAllByRole('button', { name: 'Collapse' });
    fireEvent.click(collapseButtons[0]);

    // Children should be hidden
    expect(screen.queryByText('Class Action')).not.toBeInTheDocument();
  });

  it('calls onTreatAsFlat', () => {
    const onTreatAsFlat = vi.fn();
    render(
      <HierarchyConfirmation
        hierarchy={hierarchy}
        totalItems={2}
        onTreatAsFlat={onTreatAsFlat}
      />,
    );
    fireEvent.click(screen.getByText('Treat as flat list instead'));
    expect(onTreatAsFlat).toHaveBeenCalledOnce();
  });
});
