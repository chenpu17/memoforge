import React from 'react'
import { Lock } from 'lucide-react'

export const ReadOnlyBanner: React.FC = () => {
  return (
    <div
      className="flex items-center justify-center gap-2 py-2 text-xs"
      style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
    >
      <Lock className="h-3.5 w-3.5" />
      <span>Web 访问仅限只读</span>
    </div>
  )
}
