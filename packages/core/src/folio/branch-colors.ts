/**
 * Client-side branch color map matching the PRD specification.
 * Keys are FOLIOTypes enum names from folio-python.
 */
export const BRANCH_COLORS: Record<string, { name: string; color: string }> = {
  ACTOR_PLAYER: { name: 'Actor / Player', color: '#1e6fa0' },
  AREA_OF_LAW: { name: 'Area of Law', color: '#1a5276' },
  ASSET_TYPE: { name: 'Asset Type', color: '#6b5600' },
  COMMUNICATION_MODALITY: { name: 'Communication Modality', color: '#7b4d93' },
  CURRENCY: { name: 'Currency', color: '#7a5a00' },
  DATA_FORMAT: { name: 'Data Format', color: '#4a5568' },
  DOCUMENT_ARTIFACT: { name: 'Document / Artifact', color: '#9c4a10' },
  ENGAGEMENT_TERMS: { name: 'Engagement Attributes', color: '#10613a' },
  EVENT: { name: 'Event', color: '#b91c1c' },
  FINANCIAL_CONCEPTS: { name: 'Financial Concepts and Metrics', color: '#6e4b00' },
  FOLIO_TYPE: { name: 'FOLIO Type', color: '#6b5c00' },
  FORUMS_VENUES: { name: 'Forums and Venues', color: '#7b2d8e' },
  GOVERNMENTAL_BODY: { name: 'Governmental Body', color: '#1a6091' },
  INDUSTRY: { name: 'Industry and Market', color: '#065550' },
  LANGUAGE: { name: 'Language', color: '#7a3b10' },
  LEGAL_AUTHORITIES: { name: 'Legal Authorities', color: '#8b1a1a' },
  LEGAL_ENTITY: { name: 'Legal Entity', color: '#085e40' },
  LEGAL_USE_CASES: { name: 'Legal Use Cases', color: '#4a3570' },
  LOCATION: { name: 'Location', color: '#105560' },
  MATTER_NARRATIVE: { name: 'Matter Narrative', color: '#6d3580' },
  MATTER_NARRATIVE_FORMAT: { name: 'Matter Narrative Format', color: '#1a6894' },
  OBJECTIVES: { name: 'Objectives', color: '#b03020' },
  SERVICE: { name: 'Service', color: '#065e4e' },
  STANDARDS_COMPATIBILITY: { name: 'Standards Compatibility', color: '#4a5a6a' },
  STATUS: { name: 'Status', color: '#864a08' },
  SYSTEM_IDENTIFIERS: { name: 'System Identifiers', color: '#3d4d5a' },
};

/** Confidence score color thresholds from PRD */
export function getConfidenceColor(score: number): string {
  if (score >= 90) return '#15803d'; // green-700 - excellent
  if (score >= 75) return '#16a34a'; // green-600 - strong
  if (score >= 60) return '#ea580c'; // orange-600 - moderate
  if (score >= 45) return '#a16207'; // yellow-700 - weak
  return '#6b7280'; // gray-500 - poor
}

export function getConfidenceLabel(score: number): string {
  if (score >= 90) return 'Excellent match';
  if (score >= 75) return 'Strong match';
  if (score >= 60) return 'Moderate match';
  if (score >= 45) return 'Weak match';
  return 'Poor match';
}
