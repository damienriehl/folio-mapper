import { describe, it, expect, beforeEach } from 'vitest';
import { useMappingStore } from './mapping-store';
import type { MappingResponse } from '@folio-mapper/core';

const mockResponse: MappingResponse = {
  items: [
    {
      item_index: 0,
      item_text: 'Dog Bite Law',
      branch_groups: [
        {
          branch: 'Area of Law',
          branch_color: '#1A5276',
          candidates: [
            {
              label: 'Animal Law',
              iri: 'https://folio.openlegalstandard.org/Rtest1',
              iri_hash: 'Rtest1',
              definition: 'Law relating to animals',
              synonyms: [],
              branch: 'Area of Law',
              branch_color: '#1A5276',
              hierarchy_path: [{ label: 'Area of Law', iri_hash: 'RAoL' }, { label: 'Animal Law', iri_hash: 'Rtest1' }],
              score: 85,
            },
            {
              label: 'Personal Injury',
              iri: 'https://folio.openlegalstandard.org/Rtest2',
              iri_hash: 'Rtest2',
              definition: 'Personal injury law',
              synonyms: [],
              branch: 'Area of Law',
              branch_color: '#1A5276',
              hierarchy_path: [{ label: 'Area of Law', iri_hash: 'RAoL' }, { label: 'Personal Injury', iri_hash: 'Rtest2' }],
              score: 40,
            },
          ],
        },
      ],
      total_candidates: 2,
    },
    {
      item_index: 1,
      item_text: 'Contract Law',
      branch_groups: [
        {
          branch: 'Area of Law',
          branch_color: '#1A5276',
          candidates: [
            {
              label: 'Contract Law',
              iri: 'https://folio.openlegalstandard.org/Rtest3',
              iri_hash: 'Rtest3',
              definition: 'The law of contracts',
              synonyms: [],
              branch: 'Area of Law',
              branch_color: '#1A5276',
              hierarchy_path: [{ label: 'Area of Law', iri_hash: 'RAoL' }, { label: 'Contract Law', iri_hash: 'Rtest3' }],
              score: 100,
            },
          ],
        },
      ],
      total_candidates: 1,
    },
  ],
  total_items: 2,
  branches_available: [{ name: 'Area of Law', color: '#1A5276', concept_count: 500 }],
};

describe('mapping-store', () => {
  beforeEach(() => {
    useMappingStore.getState().resetMapping();
  });

  it('starts with correct defaults', () => {
    const state = useMappingStore.getState();
    expect(state.mappingResponse).toBeNull();
    expect(state.currentItemIndex).toBe(0);
    expect(state.totalItems).toBe(0);
    expect(state.threshold).toBe(45);
  });

  it('startMapping initializes state and auto-selects only high-confidence candidates', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    const state = useMappingStore.getState();

    expect(state.totalItems).toBe(2);
    expect(state.currentItemIndex).toBe(0);
    // Item 0: Animal Law (85) should be auto-selected, Personal Injury (40) should not
    expect(state.selections[0]).toContain('Rtest1');
    expect(state.selections[0]).not.toContain('Rtest2');
    // Item 1: Contract Law (100) should be auto-selected
    expect(state.selections[1]).toContain('Rtest3');
    // All items should be pending
    expect(state.nodeStatuses[0]).toBe('pending');
    expect(state.nodeStatuses[1]).toBe('pending');
    // Area of Law should be mandatory by default
    expect(state.branchStates['Area of Law']).toBe('mandatory');
  });

  it('nextItem marks current as completed and advances', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    useMappingStore.getState().nextItem();

    const state = useMappingStore.getState();
    expect(state.nodeStatuses[0]).toBe('completed');
    expect(state.currentItemIndex).toBe(1);
  });

  it('nextItem does not go past last item', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    useMappingStore.getState().nextItem();
    useMappingStore.getState().nextItem();

    expect(useMappingStore.getState().currentItemIndex).toBe(1);
  });

  it('prevItem goes back', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    useMappingStore.getState().nextItem();
    useMappingStore.getState().prevItem();

    expect(useMappingStore.getState().currentItemIndex).toBe(0);
  });

  it('prevItem does not go below 0', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    useMappingStore.getState().prevItem();

    expect(useMappingStore.getState().currentItemIndex).toBe(0);
  });

  it('skipItem marks as skipped and advances', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    useMappingStore.getState().skipItem();

    const state = useMappingStore.getState();
    expect(state.nodeStatuses[0]).toBe('skipped');
    expect(state.currentItemIndex).toBe(1);
  });

  it('goToItem navigates to specific item', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    useMappingStore.getState().goToItem(1);

    expect(useMappingStore.getState().currentItemIndex).toBe(1);
  });

  it('goToItem rejects out of range', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    useMappingStore.getState().goToItem(99);

    expect(useMappingStore.getState().currentItemIndex).toBe(0);
  });

  it('toggleCandidate adds and removes candidates', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);

    // Add Rtest2 (was not pre-selected)
    useMappingStore.getState().toggleCandidate(0, 'Rtest2');
    expect(useMappingStore.getState().selections[0]).toContain('Rtest2');

    // Remove Rtest1 (was pre-selected)
    useMappingStore.getState().toggleCandidate(0, 'Rtest1');
    expect(useMappingStore.getState().selections[0]).not.toContain('Rtest1');
  });

  it('acceptAllDefaults completes all items with above-threshold candidates', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    useMappingStore.getState().acceptAllDefaults();

    const state = useMappingStore.getState();
    expect(state.nodeStatuses[0]).toBe('completed');
    expect(state.nodeStatuses[1]).toBe('completed');
    expect(state.selections[0]).toContain('Rtest1');
    expect(state.selections[1]).toContain('Rtest3');
  });

  it('acceptAllDefaults skips already completed items', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);

    // Manually clear selections for item 0 and mark completed
    useMappingStore.getState().toggleCandidate(0, 'Rtest1'); // remove
    useMappingStore.getState().nextItem(); // marks 0 as completed

    useMappingStore.getState().acceptAllDefaults();

    const state = useMappingStore.getState();
    // Item 0 was already completed, should not be overwritten
    expect(state.selections[0]).not.toContain('Rtest1');
  });

  it('setThreshold updates threshold', () => {
    useMappingStore.getState().setThreshold(70);
    expect(useMappingStore.getState().threshold).toBe(70);
  });

  it('setBranchState cycles through states', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);

    // Set to mandatory
    useMappingStore.getState().setBranchState('Area of Law', 'mandatory');
    expect(useMappingStore.getState().branchStates['Area of Law']).toBe('mandatory');

    // Set to excluded
    useMappingStore.getState().setBranchState('Area of Law', 'excluded');
    expect(useMappingStore.getState().branchStates['Area of Law']).toBe('excluded');

    // Set back to normal
    useMappingStore.getState().setBranchState('Area of Law', 'normal');
    expect(useMappingStore.getState().branchStates['Area of Law']).toBe('normal');
  });

  it('selectCandidateForDetail sets selected IRI', () => {
    useMappingStore.getState().selectCandidateForDetail('Rtest1');
    expect(useMappingStore.getState().selectedCandidateIri).toBe('Rtest1');

    useMappingStore.getState().selectCandidateForDetail(null);
    expect(useMappingStore.getState().selectedCandidateIri).toBeNull();
  });

  it('resetMapping clears all state', () => {
    useMappingStore.getState().startMapping(mockResponse, 45);
    useMappingStore.getState().resetMapping();

    const state = useMappingStore.getState();
    expect(state.mappingResponse).toBeNull();
    expect(state.totalItems).toBe(0);
    expect(state.currentItemIndex).toBe(0);
  });
});
