import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastOptions {
  /** Optional action button (e.g. Undo). Bumps default duration to 6s. */
  action?: ToastAction
  /** Override auto-dismiss in ms. */
  duration?: number
}

interface Toast {
  id: string
  message: string
  variant: 'success' | 'error' | 'info'
  action?: ToastAction
}

interface ToastContextValue {
  toast: (message: string, variant?: 'success' | 'error' | 'info', opts?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

const VARIANT_STYLE: Record<string, { border: string; icon: typeof Info; iconColor: string }> = {
  success: { border: 'border-emerald-500/25', icon: CheckCircle2, iconColor: 'text-emerald-400' },
  error:   { border: 'border-rose-500/25',    icon: AlertCircle,  iconColor: 'text-rose-400' },
  info:    { border: 'border-white/[0.08]',   icon: Info,         iconColor: 'text-white/40' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current[id]
    if (timer) { clearTimeout(timer); delete timers.current[id] }
  }, [])

  const toast = useCallback(
    (message: string, variant: 'success' | 'error' | 'info' = 'info', opts: ToastOptions = {}) => {
      const id = Math.random().toString(36).slice(2)
      setToasts(prev => [...prev, { id, message, variant, action: opts.action }])
      // Actions get a longer window so they're actually clickable; 3s otherwise.
      const duration = opts.duration ?? (opts.action ? 6000 : 3000)
      timers.current[id] = setTimeout(() => dismiss(id), duration)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed right-4 min-[900px]:right-6 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] min-[900px]:bottom-6 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map(t => {
          const v = VARIANT_STYLE[t.variant] || VARIANT_STYLE.info
          const Icon = v.icon
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-lg border ${v.border} bg-base shadow-xl animate-[slideUp_0.2s_ease-out]`}
            >
              <Icon size={14} className={v.iconColor} />
              <span className="text-[12px] text-white/80">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                  className="ml-1.5 text-[12px] font-semibold text-violet-300 hover:text-violet-200 underline-offset-2 hover:underline"
                >
                  {t.action.label}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
