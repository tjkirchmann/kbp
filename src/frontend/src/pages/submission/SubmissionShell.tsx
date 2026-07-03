import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import Header from '@/components/Header'
import { usePageTitle } from '@/lib/usePageTitle'

export default function SubmissionShell() {
  const { isSignedIn, isLoaded } = useAuth()
  usePageTitle('Enter a Pool')

  if (!isLoaded) return null
  if (!isSignedIn) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 pb-12 px-4 max-w-4xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
