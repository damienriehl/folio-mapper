import type { SuggestionEntry } from './types';

export interface SubmissionMetadata {
  mapper_version: string;
  folio_version: string;
  total_nodes: number;
  no_match_count: number;
  provider: string | null;
  model: string | null;
}

export function generateIssueTitle(entries: SuggestionEntry[]): string {
  const date = new Date().toISOString().slice(0, 10);
  return `[Concept Requests] Batch of ${entries.length} from FOLIO Mapper session ${date}`;
}

export function generateIssueBody(
  entries: SuggestionEntry[],
  metadata: SubmissionMetadata,
): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push('## Summary');
  lines.push(`${entries.length} concept request${entries.length === 1 ? '' : 's'} from FOLIO Mapper.`);
  lines.push(`Submitted: ${now}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Requested Concepts');
  lines.push('');

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    lines.push(`### ${i + 1}. ${entry.suggested_label}`);
    lines.push(`- **Suggested \`rdfs:label\`:** ${entry.suggested_label}`);
    lines.push(`- **Suggested \`skos:definition\`:** ${entry.suggested_definition || '_(not provided)_'}`);

    const synonyms = entry.suggested_synonyms.filter(Boolean);
    lines.push(`- **Suggested \`skos:altLabel\` (synonyms):** ${synonyms.length > 0 ? synonyms.join(', ') : '_(none)_'}`);

    lines.push(`- **Suggested \`skos:example\`:** ${entry.suggested_example || '_(not provided)_'}`);
    lines.push(`- **Suggested parent class:** ${entry.suggested_parent_class || '_(not specified)_'}`);
    lines.push(`- **Suggested branch:** ${entry.suggested_branch || '_(not specified)_'}`);
    lines.push('- **Suggested IRI pattern:** (ALEA to assign)');

    if (entry.nearest_candidates.length > 0) {
      lines.push('- **Nearest existing FOLIO concepts:**');
      for (const c of entry.nearest_candidates) {
        lines.push(`  - \`${c.iri_hash}\` (${c.label}, score: ${c.score}%)`);
      }
    } else {
      lines.push('- **Nearest existing FOLIO concepts:** _(none found)_');
    }

    if (entry.user_note) {
      lines.push(`- **Use case:** ${entry.user_note}`);
    }

    lines.push(`- **Original input term:** "${entry.original_input}"`);

    if (entry.full_input_context && entry.full_input_context !== entry.original_input) {
      lines.push(`- **Full input context:** "${entry.full_input_context}"`);
    }

    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Submission Metadata');
  lines.push(`- FOLIO Mapper version: ${metadata.mapper_version}`);
  lines.push(`- FOLIO ontology version: ${metadata.folio_version}`);
  lines.push(`- Total items in session: ${metadata.total_nodes}`);
  lines.push(`- Items without matches: ${metadata.no_match_count}`);
  lines.push(`- LLM provider used: ${metadata.provider ?? '_(none)_'}`);
  lines.push(`- LLM model used: ${metadata.model ?? '_(none)_'}`);

  return lines.join('\n');
}
