import { Trophy, BookOpen, CalendarDays, Star, Users } from 'lucide-react'

function Header() {
  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-4">
      <div className="bg-card border border-border rounded-full shadow-md px-4 py-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        {/* Left nav */}
        <nav className="flex items-center gap-1 justify-end">
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap">
            <BookOpen className="size-4" />
            Record Book
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap">
            <CalendarDays className="size-4" />
            Schedule
          </button>
        </nav>

        {/* Center: logo mark + wordmark stacked */}
        <div className="flex flex-col items-center gap-1 py-1">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs tracking-wider">KBP</span>
          </div>
          <span className="text-sm font-semibold text-foreground tracking-tight leading-none whitespace-nowrap">
            Kirchmann Bowl Pool
          </span>
        </div>

        {/* Right nav */}
        <nav className="flex items-center gap-1 justify-start">
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap">
            <Trophy className="size-4" />
            Standings
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap">
            <Users className="size-4" />
            Account
          </button>
        </nav>
      </div>
    </header>
  )
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />

      {/* Main content container — sits below floating header */}
      <main className="pt-32 pb-8 px-4 flex flex-col items-center">
        <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-sm min-h-[calc(100vh-10rem)] p-8 flex flex-col items-center justify-center gap-3">
          <Star className="size-10 text-accent" />
          <p className="text-sm text-muted-foreground">Page content goes here</p>
        </div>
      </main>
    </div>
  )
}
