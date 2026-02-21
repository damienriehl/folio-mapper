import type { BranchGroup } from '../folio/types';
import type { BranchState } from './types';

/**
 * Converts a "Top N" count into a numeric score cutoff for **non-mandatory**
 * branches only.
 *
 * Pools all candidate scores from non-mandatory, non-excluded branches into a
 * single list, sorts descending, and returns the Nth score. Mandatory branches
 * are excluded because they use independent per-branch slicing instead.
 *
 * Returns 0 if topN >= 50 (the "All" sentinel) or if non-mandatory branches
 * have fewer than topN candidates total.
 */
export function computeScoreCutoff(
  branchGroups: BranchGroup[],
  topN: number,
  branchStates: Record<string, BranchState>,
): number {
  // topN >= 50 is the "All" sentinel — show everything; !topN guards NaN/undefined
  if (!topN || topN >= 50) return 0;

  // Pool all scores from non-mandatory, non-excluded branches
  const scores: number[] = [];
  for (const group of branchGroups) {
    const state = branchStates[group.branch];
    if (state === 'excluded' || state === 'mandatory') continue;
    for (const c of group.candidates) {
      scores.push(c.score);
    }
  }

  // Fewer candidates than topN — no cutoff needed
  if (scores.length <= topN) return 0;

  // Sort descending, return the Nth score (0-indexed: topN - 1)
  scores.sort((a, b) => b - a);
  return scores[topN - 1];
}
