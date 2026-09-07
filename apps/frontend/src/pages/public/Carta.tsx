import { UtensilsCrossed } from 'lucide-react';

export function Carta() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-600">
        <UtensilsCrossed className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-zinc-900">Nuestra Carta</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">
        Estamos preparando nuestra carta digital. Muy pronto podrás ver todos nuestros productos y
        precios aquí.
      </p>
    </div>
  );
}
