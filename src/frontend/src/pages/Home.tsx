export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <span className="font-semibold text-foreground tracking-tight">
            My App
          </span>
        </div>
      </header>
      <main className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
        <p className="text-sm text-muted-foreground">App is running</p>
      </main>
    </div>
  )
}
