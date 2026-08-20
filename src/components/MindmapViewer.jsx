import { useEffect, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

const transformer = new Transformer();

export default function MindmapViewer({ markdown }) {
  const svgRef = useRef(null);
  const markmapRef = useRef(null);
  
  useEffect(() => {
    if (!svgRef.current) return;
    
    if (!markmapRef.current) {
      markmapRef.current = Markmap.create(svgRef.current);
    }
    
    if (markdown) {
      const { root } = transformer.transform(markdown);
      markmapRef.current.setData(root);
      markmapRef.current.fit();
    }
  }, [markdown]);
  
  return (
    <div className="w-full h-full min-h-[500px] bg-surface rounded-xl overflow-hidden relative border border-border shadow-sm">
      <svg ref={svgRef} className="w-full h-full absolute inset-0" />
      {!markdown && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-alt/50">
          <p className="text-text-muted text-sm">No mindmap data</p>
        </div>
      )}
    </div>
  );
}
