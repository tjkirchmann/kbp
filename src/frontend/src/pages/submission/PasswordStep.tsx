import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useVerifyPassword } from '@/services/useSubmission'

interface Props {
  poolId: number
  onComplete: () => void
}

export default function PasswordStep({ poolId, onComplete }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const verify = useVerifyPassword(poolId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await verify.mutateAsync(password)
      onComplete()
    } catch {
      setError('Incorrect password. Please try again.')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
      <div className="text-center space-y-1">
        <h2 className="text-base font-semibold text-foreground">This pool is password protected</h2>
        <p className="text-sm text-muted-foreground">Enter the pool password to continue.</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Pool password"
          autoFocus
          className="w-full px-4 py-2.5 rounded-xl bg-[rgba(13,15,19,0.6)] border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={!password || verify.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-40"
        >
          {verify.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Continue'}
        </button>
      </form>
    </div>
  )
}
