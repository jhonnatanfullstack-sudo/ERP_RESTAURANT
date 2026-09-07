import { Outlet } from 'react-router';
import { ChefHat } from 'lucide-react';

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600">
            <ChefHat className="h-5 w-5 text-white" strokeWidth={2.25} />
          </div>
          <span className="text-lg font-bold tracking-tight text-zinc-900">Restaurant ERP</span>
        </div>
      </header>
      <main className="animate-fade-in mx-auto max-w-4xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
