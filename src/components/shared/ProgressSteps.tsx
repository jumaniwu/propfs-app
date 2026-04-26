import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { n: 1, label: 'Data Proyek' },
  { n: 2, label: 'Data Lahan' },
  { n: 3, label: 'Tipe Bangunan' },
  { n: 4, label: 'Biaya Pembangunan' },
  { n: 5, label: 'Harga Jual' },
  { n: 6, label: 'Simulasi Penjualan' },
  { n: 7, label: 'Potongan & Bagi Hasil' },
]

interface ProgressStepsProps {
  currentStep: number
  onStepClick?: (step: number) => void
}

export default function ProgressSteps({ currentStep, onStepClick }: ProgressStepsProps) {
  return (
    <div className="w-full">
      {/* Desktop: horizontal steps */}
      <div className="hidden md:flex items-center justify-between relative">
        {/* Progress line */}
        <div className="absolute left-0 right-0 top-4 h-0.5 bg-muted z-0" />
        <div
          className="absolute left-0 top-4 h-0.5 bg-gold z-0 transition-all duration-500"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />

        {STEPS.map((step) => {
          const done    = step.n < currentStep
          const current = step.n === currentStep

          return (
            <div
              key={step.n}
              className="flex flex-col items-center gap-2 z-10"
              onClick={() => done && onStepClick?.(step.n)}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-200',
                  done    && 'bg-gold border-gold text-navy cursor-pointer hover:scale-110',
                  current && 'bg-navy border-navy text-white scale-110',
                  !done && !current && 'bg-background border-muted text-muted-foreground'
                )}
              >
                {done ? <Check className="h-4 w-4" /> : step.n}
              </div>
              <span className={cn(
                'text-xs font-medium whitespace-nowrap',
                current ? 'text-navy dark:text-gold' : 'text-muted-foreground'
              )}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Mobile: compact step indicator */}
      <div className="md:hidden flex items-center gap-2">
        <div className="flex gap-1">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className={cn(
                'h-1.5 rounded-full transition-all',
                step.n < currentStep  && 'bg-gold w-4',
                step.n === currentStep && 'bg-navy dark:bg-gold w-6',
                step.n > currentStep  && 'bg-muted w-1.5',
              )}
            />
          ))}
        </div>
        <span className="text-sm font-medium text-muted-foreground ml-2">
          Step {currentStep} dari {STEPS.length}: <span className="text-foreground">{STEPS[currentStep - 1]?.label}</span>
        </span>
      </div>
    </div>
  )
}
