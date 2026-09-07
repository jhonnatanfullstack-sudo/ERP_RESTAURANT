import { Outlet } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { Navbar } from '../components/Navbar';

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Navbar />
        <main className="animate-fade-in flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
