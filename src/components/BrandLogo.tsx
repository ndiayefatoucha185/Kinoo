import React, { useId } from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showWordmark?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showWordmark = true,
  className = '',
}) => {
  const reactId = useId();
  const safeId = reactId.replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `kinooGrad_${safeId}`;
  const fillGradId = `kinooFillGrad_${safeId}`;

  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    hero: 'w-20 h-20',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
    hero: 'text-4xl',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 sm:gap-3 select-none ${className}`}>
      {/* Official Concept A — K + Play SVG Symbol */}
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label="Logo officiel Kinoo"
        className={`${iconSizes[size]} shrink-0 transition-transform duration-300 hover:scale-105 drop-shadow-[0_2px_8px_rgba(236,72,153,0.3)]`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
          <linearGradient id={fillGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#EC4899" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        {/* Play negative space inner core highlight */}
        <polygon
          points="84,72 144,100 84,128"
          fill={`url(#${fillGradId})`}
        />

        {/* K + Play Outer Geometry */}
        <g stroke={`url(#${gradId})`} strokeLinecap="round" strokeLinejoin="round">
          {/* Vertical stem of the K */}
          <line x1="56" y1="38" x2="56" y2="162" strokeWidth="24" />
          {/* Upper converging diagonal to Play apex */}
          <line x1="74" y1="54" x2="152" y2="100" strokeWidth="22" />
          {/* Lower converging diagonal to Play apex */}
          <line x1="74" y1="146" x2="152" y2="100" strokeWidth="22" />
        </g>
      </svg>

      {showWordmark && (
        <div className="flex flex-col leading-tight">
          <div className="flex items-center">
            <span className={`font-bold tracking-tight text-white font-['Poppins'] ${textSizes[size]}`}>
              KIN
            </span>
            {/* The signature twin connected O's */}
            <div className="relative inline-flex items-center">
              <span className={`font-bold tracking-tight text-white font-['Poppins'] ${textSizes[size]}`}>
                OO
              </span>
              <div className="absolute left-[2px] right-[2px] bottom-[3px] h-[3px] bg-gradient-to-r from-[#7C3AED] to-[#EC4899] rounded-full shadow-[0_1px_4px_rgba(236,72,153,0.5)]" />
            </div>
          </div>
          {size === 'hero' && (
            <span className="text-xs text-[#EC4899] font-medium tracking-wide">
              Même à distance, ensemble.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
