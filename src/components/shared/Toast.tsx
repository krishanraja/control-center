import React, { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'

interface Toast {
  id: string
  message: string
  variant: 'success' | 'error' | 'info'
}

interface ToastContextValue {
  toast: (message: string, variant?: 'success' | 'error' | 'info') => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

const VARIANT_STYLE: Record<string, { border: string; icon: typeof Info; iconColor: string }> = {
  success: { border: 'border-emerald-500/25', icon: CheckCircle2, iconColor: 'text-emerald-400' },
  error:   { border: 'border-rose-500/25',    icon: AlertCircle,  iconColor: 'text-rose-400' },
  info:    { border: 'border-white/[0.08]',   icon: Info,         iconColor: 'text-white/40' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, variant: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const v = VARIANT_STYLE[t.variant] || VARIANT_STYLE.info
          const Icon = v.icon
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-lg border ${v.border} bg-[#1a1a1d] shadow-xl animate-[slideUp_0.2s_ease-out]`}
            >
              <Icon size={14} className={v.iconColor} />
              <span className="text-[12px] text-white/80">{t.message}</span>
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
