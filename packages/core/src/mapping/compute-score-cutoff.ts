import type { BranchGroup } from '../folio/types';
import type { BranchState } from './types';

/**
 * Converts a "Top N" count into a numeric score cutoff.
 *
 * Collects scores from non-excluded, non-mandatory branches, sorts descending,
 * and returns the score at position min(topN, length) - 1.
 * Returns 0 if topN >= total candidates (show everything).
 * Ties at the Nth position are included (score >= cutoff).
 */
export function computeScoreCutoff(
  branchGroups: BranchGroup[],
  topN: number,
  branchStates: Record<string, BranchState>,
): number {
  const scores: number[] = [];

  for (const group of branchGroups) {
    const state = branchStates[group.branch];
    // Skip excluded and mandatory branches (mandatory bypasses cutoff separately)
    if (state === 'excluded' || state === 'mandatory') continue;
    for (const candidate of group.candidates) {
      scores.push(candidate.score);
    }
  }

  // topN >= 50 is the "All" sentinel — show everything; !topN guards NaN/undefined
  if (scores.length === 0 || !topN || topN >= 50 || topN >= scores.length) return 0;

  scores.sort((a, b) => b - a);
  return scores[Math.min(topN, scores.length) - 1];
}
