import { Outlet } from 'react-router';

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 px-6 py-4">
        <span className="text-lg font-semibold text-slate-900">Restaurant ERP</span>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
