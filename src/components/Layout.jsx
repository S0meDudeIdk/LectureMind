import { useState } from 'react';
import Header from './Header';
import { SidebarProvider } from '../context/SidebarContext';

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

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar — floats over the canvas so the mindmap canvas never resizes */}
        <aside
          className="absolute left-0 top-0 bottom-0 z-20 transition-transform duration-250 ease-in-out"
          style={{
            width: '240px',
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            pointerEvents: sidebarOpen ? 'auto' : 'none',
          }}
        >
          <div
            className="w-60 h-full"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            {sidebar}
          </div>
        </aside>

        {/* Canvas — dot grid, always full width */}
        <main
          className={`flex-1 overflow-hidden canvas-bg relative w-full h-full ${
            sidebarOpen ? 'sidebar-open' : ''
          }`}
        >
          <SidebarProvider value={{ sidebarOpen }}>{children}</SidebarProvider>
        </main>
      </div>
    </div>
  );
}
