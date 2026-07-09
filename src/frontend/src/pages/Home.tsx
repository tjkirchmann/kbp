import { usePageTitle } from '@/lib/usePageTitle'
import { useMe } from '@/services/useMe'
import Header from '@/components/Header'
import { Hero } from './home/Hero'
import { CommissionerLetter } from './home/CommissionerLetter'
import { StatBand } from './home/StatBand'
import { Archives } from './home/Archives'
import { Closer } from './home/Closer'

export default function Home() {
  useMe()
  usePageTitle()

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <CommissionerLetter />
        <StatBand />
        <Archives />
        <Closer />
      </main>
    </div>
  )
}
