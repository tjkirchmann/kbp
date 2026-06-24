import type { PoolQuestion } from '@/services/useSubmission'

interface Props {
  questions: PoolQuestion[]
  // answer values keyed by question id; stored as strings ('true'/'false' for boolean)
  answers: Record<number, string>
  onChange: (questionId: number, value: string) => void
}

export default function QuestionFields({ questions, answers, onChange }: Props) {
  if (questions.length === 0) return null

  return (
    <div className="max-w-xs w-full space-y-4">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">For the record</h3>
        <p className="text-xs text-muted-foreground">A few questions before you pick.</p>
      </div>
      {questions.map((q) => {
        const value = answers[q.id] ?? ''
        return (
          <div key={q.id} className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {q.prompt}
              {q.required && <span className="text-destructive"> *</span>}
            </label>
            {q.question_type === 'text' && (
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(q.id, e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[rgba(13,15,19,0.6)] border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
              />
            )}
            {q.question_type === 'number' && (
              <input
                type="number"
                value={value}
                onChange={(e) => onChange(q.id, e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[rgba(13,15,19,0.6)] border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            )}
            {q.question_type === 'boolean' && (
              <div className="flex gap-2">
                {[
                  { label: 'Yes', val: 'true' },
                  { label: 'No', val: 'false' },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => onChange(q.id, opt.val)}
                    className={`flex-1 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                      value === opt.val
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'bg-[rgba(13,15,19,0.4)] border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
