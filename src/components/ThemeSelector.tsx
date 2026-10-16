import React, { useState, useEffect } from 'react';
import { ThemeMode, getStoredTheme, setStoredTheme, subscribeTheme, getResolvedTheme } from '../services/theme';
import { Moon, Sun, Laptop } from 'lucide-react';

interface ThemeSelectorProps {
  label?: string;
  description?: string;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  label = 'Apparence & Thème',
  description = 'Choisissez le mode d’affichage de Kinoo. Le mode Système s’adapte automatiquement aux réglages de votre appareil.',
}) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(getStoredTheme);
  const [resolved, setResolved] = useState<'dark' | 'light'>(() => getResolvedTheme(getStoredTheme()));

  useEffect(() => {
    return subscribeTheme((theme, res) => {
      setCurrentTheme(theme);
      setResolved(res);
    });
  }, []);

  const handleSelect = (mode: ThemeMode) => {
    setStoredTheme(mode);
    setCurrentTheme(mode);
  };

  const options: { mode: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }>; detail: string }[] = [
    {
      mode: 'dark',
      label: 'Sombre',
      icon: Moon,
      detail: 'Idéal pour le cinéma de nuit',
    },
    {
      mode: 'light',
      label: 'Clair',
      icon: Sun,
      detail: 'Clarté et contraste de jour',
    },
    {
      mode: 'system',
      label: 'Système',
      icon: Laptop,
      detail: `Suit votre OS (${resolved === 'dark' ? 'Sombre' : 'Clair'})`,
    },
  ];

  return (
    <div className="space-y-3">
      {label && (
        <div className="space-y-0.5">
          <label className="text-xs font-bold text-white block">{label}</label>
          {description && <p className="text-[11px] text-[#8E8B99]">{description}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isSelected = currentTheme === opt.mode;

          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => handleSelect(opt.mode)}
              className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5 ${
                isSelected
                  ? 'bg-gradient-to-br from-[#7C3AED]/20 to-[#EC4899]/15 border-[#EC4899] ring-2 ring-[#EC4899]/30 text-white shadow-lg'
                  : 'bg-[#141418] border-[#232328] hover:border-[#383844] text-[#B8B4C0] hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className={`p-2 rounded-xl ${isSelected ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md' : 'bg-[#1C1C22] text-gray-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-[#EC4899] shadow-sm shadow-[#EC4899]" />
                )}
              </div>

              <div>
                <span className="text-xs font-bold block text-white">{opt.label}</span>
                <span className="text-[10px] text-[#8E8B99] block mt-0.5">{opt.detail}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
