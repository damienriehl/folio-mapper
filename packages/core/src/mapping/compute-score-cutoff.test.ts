import { describe, it, expect } from 'vitest';
import { computeScoreCutoff } from './compute-score-cutoff';
import type { BranchGroup } from '../folio/types';
import type { BranchState } from './types';

function makeBranchGroup(branch: string, scores: number[]): BranchGroup {
  return {
    branch,
    branch_color: '#000',
    candidates: scores.map((score, i) => ({
      label: `c${i}`,
      iri: `https://example.org/c${i}`,
      iri_hash: `hash${i}`,
      definition: '',
      synonyms: [],
      branch,
      branch_color: '#000',
      hierarchy_path: [],
      score,
    })),
  };
}

describe('computeScoreCutoff', () => {
  it('returns 0 when topN >= total candidates', () => {
    const groups = [makeBranchGroup('A', [90, 80, 70])];
    const states: Record<string, BranchState> = { A: 'normal' };
    expect(computeScoreCutoff(groups, 5, states)).toBe(0);
    expect(computeScoreCutoff(groups, 3, states)).toBe(0);
  });

  it('returns highest score when topN=1', () => {
    const groups = [makeBranchGroup('A', [90, 80, 70])];
    const states: Record<string, BranchState> = { A: 'normal' };
    expect(computeScoreCutoff(groups, 1, states)).toBe(90);
  });

  it('handles ties — topN=3 with scores [90, 80, 70, 70, 60] returns 70', () => {
    const groups = [makeBranchGroup('A', [90, 80, 70, 70, 60])];
    const states: Record<string, BranchState> = { A: 'normal' };
    // topN=3 → cutoff at index 2 = 70, which includes the 4th candidate (also 70)
    expect(computeScoreCutoff(groups, 3, states)).toBe(70);
  });

  it('includes mandatory branches in score count', () => {
    const groups = [
      makeBranchGroup('Mandatory', [100, 95]),
      makeBranchGroup('Normal', [80, 60, 40]),
    ];
    const states: Record<string, BranchState> = { Mandatory: 'mandatory', Normal: 'normal' };
    // All scores: [100, 95, 80, 60, 40], topN=2 → cutoff at index 1 = 95
    expect(computeScoreCutoff(groups, 2, states)).toBe(95);
  });

  it('excludes excluded branches from score count', () => {
    const groups = [
      makeBranchGroup('Excluded', [100, 95]),
      makeBranchGroup('Normal', [80, 60, 40]),
    ];
    const states: Record<string, BranchState> = { Excluded: 'excluded', Normal: 'normal' };
    // Only Normal branch scores: [80, 60, 40], topN=1 → cutoff = 80
    expect(computeScoreCutoff(groups, 1, states)).toBe(80);
  });

  it('returns 0 when only excluded branches exist', () => {
    const groups = [
      makeBranchGroup('Excluded', [80]),
    ];
    const states: Record<string, BranchState> = { Excluded: 'excluded' };
    expect(computeScoreCutoff(groups, 3, states)).toBe(0);
  });

  it('returns 0 when branch groups are empty', () => {
    expect(computeScoreCutoff([], 5, {})).toBe(0);
  });

  it('topN=50 (All sentinel) returns 0 even with many candidates', () => {
    const scores = Array.from({ length: 100 }, (_, i) => 100 - i);
    const groups = [makeBranchGroup('A', scores)];
    const states: Record<string, BranchState> = { A: 'normal' };
    expect(computeScoreCutoff(groups, 50, states)).toBe(0);
  });

  it('works across multiple normal branches', () => {
    const groups = [
      makeBranchGroup('A', [90, 70]),
      makeBranchGroup('B', [85, 50]),
    ];
    const states: Record<string, BranchState> = { A: 'normal', B: 'normal' };
    // All scores: [90, 85, 70, 50], topN=2 → cutoff at index 1 = 85
    expect(computeScoreCutoff(groups, 2, states)).toBe(85);
  });
});
