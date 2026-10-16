import React from 'react';

interface KinooAiIconProps {
  className?: string;
  size?: number;
}

export const KinooAiIcon: React.FC<KinooAiIconProps> = ({ className = 'w-5 h-5', size = 20 }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`${className} shrink-0`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="kinooAiGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="60%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      {/* Kinoo K + Play Core Symbol */}
      <path
        d="M6 4.5V19.5"
        stroke="url(#kinooAiGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7.5 12L13.5 6.5"
        stroke="url(#kinooAiGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7.5 12L13.5 17.5"
        stroke="url(#kinooAiGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Subtle AI Sparkle accentuating intelligence */}
      <path
        d="M19 4L19.8 6.2L22 7L19.8 7.8L19 10L18.2 7.8L16 7L18.2 6.2L19 4Z"
        fill="#EC4899"
      />
      <path
        d="M18 16L18.5 17.5L20 18L18.5 18.5L18 20L17.5 18.5L16 18L17.5 17.5L18 16Z"
        fill="#7C3AED"
      />
    </svg>
  );
};
