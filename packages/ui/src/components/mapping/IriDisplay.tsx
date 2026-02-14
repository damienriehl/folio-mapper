import { useState } from 'react';

interface IriDisplayProps {
  iri: string;
  iriHash: string;
}

export function IriDisplay({ iri, iriHash }: IriDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(iri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      {expanded ? (
        <>
          <span className="break-all font-mono">{iri}</span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            title="Collapse"
          >
            &#9662;
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            title="Copy IRI"
          >
            {copied ? 'copied' : 'copy'}
          </button>
        </>
      ) : (
        <>
          <span className="font-mono" title={iri}>
            {iriHash}
          </span>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-gray-400 hover:text-gray-600"
            title="Expand IRI"
          >
            &#9656;
          </button>
        </>
      )}
    </span>
  );
}
