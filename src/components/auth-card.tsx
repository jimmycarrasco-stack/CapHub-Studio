export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-full place-items-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-brand-600 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
              <path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900">{title}</h1>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
