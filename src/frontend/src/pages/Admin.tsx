import Header from '@/components/Header'

export default function Admin() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 pb-12 px-4 flex flex-col items-center gap-4 max-w-4xl mx-auto">
        <div className="glass-panel rounded-2xl p-8 w-full">
          {/* admin content goes here */}
        </div>
      </main>
    </div>
  )
}
