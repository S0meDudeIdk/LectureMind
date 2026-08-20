import Header from './Header';

export default function Layout({ sidebar, children }) {
  return (
    <div className="flex flex-col h-screen bg-surface text-text overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {sidebar}
        <main className="flex-1 overflow-y-auto bg-surface relative p-6">
          <div className="max-w-5xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
