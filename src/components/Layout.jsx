import { useState } from 'react';
import Header from './Header';
import { SidebarSimple } from '@phosphor-icons/react';

export default function Layout({ 
  sidebar, children, activeTab, setActiveTab, hasContent, 
  onExportMd, onExportDocs, onExportMindmapJpg, onExportMindmapPdf 
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
    >
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasContent={hasContent}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        onExportMd={onExportMd}
        onExportDocs={onExportDocs}
        onExportMindmapJpg={onExportMindmapJpg}
        onExportMindmapPdf={onExportMindmapPdf}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — slides in/out with CSS transition */}
        <div
          className="flex-shrink-0 overflow-hidden transition-all duration-250 ease-in-out"
          style={{
            width: sidebarOpen ? '240px' : '0px',
            opacity: sidebarOpen ? 1 : 0,
            pointerEvents: sidebarOpen ? 'auto' : 'none',
          }}
        >
          {/* Inner wrapper keeps the sidebar's own width stable so it doesn't reflow */}
          <div className="w-60 h-full">
            {sidebar}
          </div>
        </div>

        {/* Canvas — dot grid */}
        <main className="flex-1 overflow-hidden canvas-bg relative">
          {children}
        </main>
      </div>
    </div>
  );
}
