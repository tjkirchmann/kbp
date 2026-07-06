import { useState, useCallback, useRef } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SeasonStepperProps {
  label: string
  value?: number
  onChange: (value: string) => void
}

/**
Season/year stepper with custom up/down arrow buttons.

- Arrow buttons increment/decrement by 1
- Buttons highlight on press (active state)
- Keyboard ↑↓ arrows work while input is focused
- Empty state → starts from current year on first increment
- Styled to match FilterInput + ClearableSelect
 */
export default function SeasonStepper({ label, value, onChange }: SeasonStepperProps) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentYear = new Date().getFullYear()

  const emit = useCallback(
    (v: number) => {
      onChange(String(v))
    },
    [onChange],
  )

  const stepUp = useCallback(() => {
    if (value == null) {
      emit(currentYear)
    } else {
      emit(value + 1)
    }
  }, [value, emit, currentYear])

  const stepDown = useCallback(() => {
    if (value == null) {
      emit(currentYear)
    } else {
      emit(value - 1)
    }
  }, [value, emit, currentYear])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        stepUp()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        stepDown()
      }
    },
    [stepUp, stepDown],
  )

  // Focus ring via container border when input is focused
  const ring = focused ? 'border-primary/40 ring-1 ring-primary/40' : 'border-border/20'

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <div
        className={cn(
          'flex items-center rounded-lg border bg-white/[0.03] transition-colors',
          ring,
        )}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '')
            if (raw === '') {
              onChange('')
            } else {
              onChange(raw)
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="YYYY"
          className="w-16 bg-transparent px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
        <div className="flex flex-col border-l border-border/20">
          <button
            type="button"
            tabIndex={-1}
            onClick={stepUp}
            className={cn(
              'flex h-[13px] items-center justify-center px-1 rounded-tr-lg',
              'text-muted-foreground hover:text-foreground hover:bg-white/5',
              'active:text-primary active:bg-primary/15',
              'transition-colors',
            )}
            aria-label="Increment season"
          >
            <ChevronUp className="size-3" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={stepDown}
            className={cn(
              'flex h-[13px] items-center justify-center px-1 rounded-br-lg',
              'text-muted-foreground hover:text-foreground hover:bg-white/5',
              'active:text-primary active:bg-primary/15',
              'transition-colors',
            )}
            aria-label="Decrement season"
          >
            <ChevronDown className="size-3" />
          </button>
        </div>
      </div>
    </label>
  )
}
