/**
 * Static schedule layout shell for the Suspense fallback — matches the real
 * schedule page header + main content area so hydration doesn't snap layout.
 */
export function SchedulePageShell() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex-none h-16 border-b bg-card">
        <div className="h-full w-full max-w-[100rem] mx-auto px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-muted/40 shrink-0" />
            <div className="h-8 w-[8.5rem] md:h-9 rounded bg-muted/40" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-muted/40 shrink-0" />
            <div className="h-9 w-24 rounded-lg bg-muted/40" />
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-auto px-4 md:px-6 pt-4 md:pt-6 pb-16">
        <div className="min-h-full w-full max-w-[95rem] mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="h-8 w-40 rounded bg-muted/40" />
            <div className="h-9 w-28 rounded-lg bg-muted/40" />
          </div>
          <div className="h-[min(70vh,720px)] rounded-xl border border-border/40 bg-muted/20" />
        </div>
      </main>
    </div>
  )
}
