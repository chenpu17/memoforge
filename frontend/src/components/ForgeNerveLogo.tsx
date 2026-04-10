import React from 'react'

interface ForgeNerveLogoProps {
  size?: number
  withWordmark?: boolean
  wordmarkClassName?: string
  className?: string
}

export const ForgeNerveLogo: React.FC<ForgeNerveLogoProps> = ({
  size = 28,
  withWordmark = false,
  wordmarkClassName = '',
  className = '',
}) => {
  const brandPrimary = 'var(--brand-primary, #6366F1)'
  const brandPrimarySoftAlt = 'var(--brand-primary-soft-alt, #E0E7FF)'
  const brandPrimaryBorder = 'var(--brand-primary-border, #C7D2FE)'
  const brandPrimaryPanelBorder = 'var(--brand-primary-panel-border, #DBEAFE)'

  const icon = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="forgenerve-bg" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor={brandPrimary} />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="forgenerve-stroke" x1="16" y1="18" x2="49" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor={brandPrimarySoftAlt} />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#forgenerve-bg)" />
      <path d="M20 20H42" stroke="url(#forgenerve-stroke)" strokeWidth="4" strokeLinecap="round" />
      <path d="M20 32H36" stroke="url(#forgenerve-stroke)" strokeWidth="4" strokeLinecap="round" />
      <path d="M20 44H30" stroke="url(#forgenerve-stroke)" strokeWidth="4" strokeLinecap="round" />
      <path d="M42 20V44" stroke="url(#forgenerve-stroke)" strokeWidth="4" strokeLinecap="round" />
      <path d="M42 32H50" stroke="url(#forgenerve-stroke)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="32" r="4" fill={brandPrimaryBorder} />
      <circle cx="30" cy="44" r="4" fill={brandPrimaryPanelBorder} />
    </svg>
  )

  if (!withWordmark) {
    return icon
  }

  return (
    <div className="inline-flex items-center gap-3">
      {icon}
      <span className={wordmarkClassName || 'text-base font-semibold tracking-tight'}>ForgeNerve</span>
    </div>
  )
}
