import { Outlet } from 'react-router-dom'
import Header from '@/components/Header'

export default function SubmissionShell() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 pb-12 px-4 max-w-4xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
