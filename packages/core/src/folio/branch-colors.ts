/**
 * Client-side branch color map matching the PRD specification.
 * Keys are FOLIOTypes enum names from folio-python.
 */
export const BRANCH_COLORS: Record<string, { name: string; color: string }> = {
  ACTOR_PLAYER: { name: 'Actor / Player', color: '#2E86C1' },
  AREA_OF_LAW: { name: 'Area of Law', color: '#1A5276' },
  ASSET_TYPE: { name: 'Asset Type', color: '#D4AC0D' },
  COMMUNICATION_MODALITY: { name: 'Communication Modality', color: '#AF7AC5' },
  CURRENCY: { name: 'Currency', color: '#F39C12' },
  DATA_FORMAT: { name: 'Data Format', color: '#85929E' },
  DOCUMENT_ARTIFACT: { name: 'Document / Artifact', color: '#E67E22' },
  ENGAGEMENT_TERMS: { name: 'Engagement Attributes', color: '#2ECC71' },
  EVENT: { name: 'Event', color: '#E74C3C' },
  FOLIO_TYPE: { name: 'FOLIO Type', color: '#F1C40F' },
  FORUMS_VENUES: { name: 'Forums and Venues', color: '#8E44AD' },
  GOVERNMENTAL_BODY: { name: 'Governmental Body', color: '#3498DB' },
  INDUSTRY: { name: 'Industry and Market', color: '#1ABC9C' },
  LANGUAGE: { name: 'Language', color: '#D35400' },
  LEGAL_AUTHORITIES: { name: 'Legal Authorities', color: '#C0392B' },
  LEGAL_ENTITY: { name: 'Legal Entity', color: '#27AE60' },
  LOCATION: { name: 'Location', color: '#16A085' },
  MATTER_NARRATIVE: { name: 'Matter Narrative', color: '#7D3C98' },
  MATTER_NARRATIVE_FORMAT: { name: 'Matter Narrative Format', color: '#2980B9' },
  OBJECTIVES: { name: 'Objectives', color: '#CB4335' },
  SERVICE: { name: 'Service', color: '#138D75' },
  STANDARDS_COMPATIBILITY: { name: 'Standards Compatibility', color: '#5D6D7E' },
  STATUS: { name: 'Status', color: '#CA6F1E' },
  SYSTEM_IDENTIFIERS: { name: 'System Identifiers', color: '#7F8C8D' },
};

/** Confidence score color thresholds from PRD */
export function getConfidenceColor(score: number): string {
  if (score >= 90) return '#228B22'; // dark green - excellent
  if (score >= 75) return '#90EE90'; // light green - strong
  if (score >= 60) return '#FFD700'; // yellow - moderate
  if (score >= 45) return '#FF8C00'; // orange - weak
  return '#D3D3D3'; // light gray - poor
}

export function getConfidenceLabel(score: number): string {
  if (score >= 90) return 'Excellent match';
  if (score >= 75) return 'Strong match';
  if (score >= 60) return 'Moderate match';
  if (score >= 45) return 'Weak match';
  return 'Poor match';
}
