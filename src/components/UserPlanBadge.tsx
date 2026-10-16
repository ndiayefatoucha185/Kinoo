import React from 'react';
import { Star, ShieldCheck } from 'lucide-react';
import { UserPlan } from '../types/kinoo';

export interface UserPlanBadgeProps {
  plan?: UserPlan | string;
  size?: 'xs' | 'sm' | 'md';
  showTooltip?: boolean;
  className?: string;
}

/**
 * Nettoie le pseudonyme de tout suffixe entre parenthèses vestigial
 * ex: "Sophia (Standard)" -> "Sophia", "Alex (Gratuit)" -> "Alex"
 */
export function cleanUserPseudo(pseudo?: string): string {
  if (!pseudo) return '';
  return pseudo.replace(/\s*\((Gratuit|Standard|Premium|Club|Duo|Découverte)\)/gi, '').trim();
}

/**
 * Badge visuel discret indiquant le niveau d'abonnement d'un utilisateur à côté de son nom ou avatar
 * - Gratuit : Pas de badge (ou discret)
 * - Standard : Pastille distincte bleue #3B82F6 avec icône de validation
 * - Premium / Club : Pastille dégradé violet #7C3AED -> rose #EC4899 avec étoile
 */
export const UserPlanBadge: React.FC<UserPlanBadgeProps> = ({
  plan,
  size = 'sm',
  showTooltip = true,
  className = '',
}) => {
  if (!plan) return null;

  const normalizedPlan = (plan || '').toUpperCase();

  // 1. Formule GRATUITE : pas de badge encombrant pour garder l'interface épurée
  if (normalizedPlan === 'GRATUIT') {
    return null;
  }

  // Tailles proportionnelles
  const sizeConfig = {
    xs: {
      wrapper: 'w-3.5 h-3.5',
      icon: 'w-2 h-2',
    },
    sm: {
      wrapper: 'w-4 h-4',
      icon: 'w-2.5 h-2.5',
    },
    md: {
      wrapper: 'w-5 h-5',
      icon: 'w-3 h-3',
    },
  }[size];

  // 2. Formule PREMIUM : Dégradé marque violet #7C3AED -> rose #EC4899 avec étoile
  if (normalizedPlan === 'PREMIUM') {
    return (
      <span
        title={showTooltip ? 'Membre Premium' : undefined}
        aria-label="Membre Premium"
        className={`inline-flex items-center justify-center shrink-0 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] text-white shadow-sm shadow-[#EC4899]/30 border border-white/25 transition-transform hover:scale-110 ${sizeConfig.wrapper} ${className}`}
      >
        <Star className={`${sizeConfig.icon} fill-current`} strokeWidth={0} />
      </span>
    );
  }

  // 3. Formule STANDARD : Bleu #3B82F6 avec icône distincte
  if (normalizedPlan === 'STANDARD') {
    return (
      <span
        title={showTooltip ? 'Membre Standard' : undefined}
        aria-label="Membre Standard"
        className={`inline-flex items-center justify-center shrink-0 rounded-full bg-[#3B82F6]/20 border border-[#3B82F6]/50 text-[#3B82F6] shadow-sm shadow-[#3B82F6]/10 transition-transform hover:scale-110 ${sizeConfig.wrapper} ${className}`}
      >
        <ShieldCheck className={`${sizeConfig.icon}`} strokeWidth={2.5} />
      </span>
    );
  }

  return null;
};
