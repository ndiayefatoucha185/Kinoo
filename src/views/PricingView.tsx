import React, { useState } from 'react';
import {
  Check,
  X as XIcon,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Smartphone,
  DollarSign,
  Star,
  Users,
  Film,
  Mic,
  MessageSquare,
  Bot,
  Tv,
  Radio,
  ArrowRight,
  Lock,
  UserCheck,
} from 'lucide-react';
import { User, UserPlan } from '../types/kinoo';
import { StorageService } from '../services/storage';
import { UserPlanBadge } from '../components/UserPlanBadge';
import { KINOO_PLANS } from '../config/plans';

interface PricingViewProps {
  currentUser?: User | null;
  onOpenCreateRoom: () => void;
  onOpenAuth?: (mode?: 'login' | 'signup') => void;
  onPlanChanged?: (newPlan: UserPlan) => void;
  onQuickLogin?: (email: string) => void;
}

export const PricingView: React.FC<PricingViewProps> = ({
  currentUser,
  onOpenCreateRoom,
  onOpenAuth,
  onPlanChanged,
  onQuickLogin,
}) => {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleSelectPlan = (plan: UserPlan) => {
    if (!currentUser) {
      if (onOpenAuth) {
        onOpenAuth('signup');
      } else {
        onOpenCreateRoom();
      }
      return;
    }

    if (currentUser.forfait === plan) {
      setActionFeedback(`Vous bénéficiez déjà de la formule ${plan.toLowerCase()}.`);
      setTimeout(() => setActionFeedback(null), 3000);
      return;
    }

    const updatedUser: User = {
      ...currentUser,
      forfait: plan,
    };
    StorageService.setCurrentUser(updatedUser);
    StorageService.updateUserProfile(currentUser.id, { forfait: plan });
    if (onPlanChanged) {
      onPlanChanged(plan);
    }
    setActionFeedback(`Félicitations ! Vous êtes passé à la formule Kinoo ${plan.toLowerCase()}.`);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleSwitchToTestAccount = (email: string) => {
    if (onQuickLogin) {
      onQuickLogin(email);
    } else {
      const users = StorageService.getUsers();
      const matched = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (matched) {
        StorageService.setCurrentUser(matched);
        window.location.reload();
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 space-y-12 font-['Poppins']">
      {/* Feedback Toast */}
      {actionFeedback && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-[#141417] border border-[#EC4899] text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in text-xs sm:text-sm">
          <Sparkles className="w-5 h-5 text-[#EC4899] shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. EN-TÊTE DE LA PAGE */}
      {/* ============================================================ */}
      <div className="text-center space-y-3 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#1C1C24] border border-[#2B2B38] text-[11px] font-semibold text-[#EC4899]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Tarifs & Abonnements KINOO</span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
          Choisissez votre formule
        </h1>

        <p className="text-base sm:text-lg font-medium text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] via-[#EC4899] to-[#3B82F6]">
          « Même à distance, ensemble. »
        </p>

        <p className="text-xs sm:text-sm text-[#B8B4C0] max-w-xl mx-auto leading-relaxed pt-1">
          Synchronisez vos émotions cinématographiques en temps réel avec vos proches, 
          quel que soit le nombre d’écrans ou la distance qui vous sépare.
        </p>

        {/* Facturation Toggle (Mensuel / Annuel) & Devise (XOF / EUR) */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <div className="bg-[#141417] p-1.5 rounded-2xl border border-[#232326] flex items-center gap-1">
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                billingCycle === 'MONTHLY'
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                  : 'text-[#B8B4C0] hover:text-white'
              }`}
            >
              Facturation mensuelle
            </button>
            <button
              onClick={() => setBillingCycle('ANNUAL')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                billingCycle === 'ANNUAL'
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white shadow-md'
                  : 'text-[#B8B4C0] hover:text-white'
              }`}
            >
              <span>Annuel</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                -20% offerts
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. LES 3 CARTES DE TARIFICATION (GRATUIT / STANDARD / PREMIUM) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch pt-2">
        
        {/* ------------------------------------------------------------ */}
        {/* FORMULE 1 — GRATUIT */}
        {/* ------------------------------------------------------------ */}
        <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative transition-all duration-300 hover:border-[#383842]">
          <div className="space-y-6">
            {/* Header Carte */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#B8B4C0] px-2.5 py-1 rounded-lg bg-[#1D1D23] border border-[#282830]">
                  Formule 1
                </span>
                {currentUser?.forfait === 'GRATUIT' && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Votre forfait actif
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-bold text-white">Gratuit</h3>
              <p className="text-xs text-[#B8B4C0] min-h-[32px] leading-relaxed">
                Idéal pour découvrir le visionnage synchronisé et lancer de petites séances entre proches.
              </p>
            </div>

            {/* Prix */}
            <div className="pt-2 border-t border-[#232326]/60">
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">0 FCFA</span>
                  <span className="text-xs text-[#8E8A99] font-medium">/ pour toujours</span>
                </div>
                <span className="text-xs text-[#8E8A99] mt-0.5">0 € / mois · Aucune carte bancaire requise</span>
              </div>
            </div>

            {/* Liste des fonctionnalités */}
            <div className="space-y-3 pt-2">
              <span className="text-[11px] font-bold text-[#8E8A99] uppercase tracking-wider block">
                Fonctionnalités incluses & limites :
              </span>
              <ul className="space-y-3 text-xs">
                {/* 3 films ou épisodes par mois */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>3 films ou épisodes</strong> de série par mois</span>
                </li>

                {/* Invitation jusqu'à 10 personnes via URL */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Invitation <strong>jusqu'à 10 personnes</strong></span>
                </li>

                {/* Uniquement lien URL */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Diffusion uniquement via <strong>lien URL</strong> (Web, flux directs)</span>
                </li>

                {/* Pas d'import vidéo */}
                <li className="flex items-start gap-2.5 text-[#8E8A99]">
                  <div className="w-5 h-5 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                    <XIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="line-through text-[#7A7684]">Import vidéo de fichiers locaux</span>
                </li>

                {/* Chat texte disponible */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>Chat texte</strong> disponible pendant la séance</span>
                </li>

                {/* Pas d'appel vocal */}
                <li className="flex items-start gap-2.5 text-[#8E8A99]">
                  <div className="w-5 h-5 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                    <XIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="line-through text-[#7A7684]">Appel vocal pendant la séance</span>
                </li>

                {/* Pas de débriefing après la séance */}
                <li className="flex items-start gap-2.5 text-[#8E8A99]">
                  <div className="w-5 h-5 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                    <XIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="line-through text-[#7A7684]">Débriefing d'après-séance (salon micro/caméra)</span>
                </li>

                {/* Contient des publicités */}
                <li className="flex items-start gap-2.5 text-[#EAB308]">
                  <div className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Radio className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>Contient des publicités</strong> discrètes</span>
                </li>

                {/* Pas d'accès communication réseau amis */}
                <li className="flex items-start gap-2.5 text-[#8E8A99]">
                  <div className="w-5 h-5 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                    <XIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="line-through text-[#7A7684]">Communication réseau d'amis & messagerie</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bouton d'action */}
          <div className="pt-8">
            <button
              onClick={() => handleSelectPlan('GRATUIT')}
              className="w-full py-3.5 rounded-2xl font-bold text-xs text-white bg-[#1F1F26] hover:bg-[#282832] border border-[#2E2E38] transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <span>{currentUser?.forfait === 'GRATUIT' ? 'Forfait actuel' : 'Commencer gratuitement — 0 FCFA'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* FORMULE 2 — STANDARD (MISE EN AVANT VISUELLE) */}
        {/* ------------------------------------------------------------ */}
        <div className="bg-[#141417] border-2 border-[#EC4899] rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative shadow-xl shadow-[#EC4899]/10 lg:-translate-y-2 transition-all duration-300">
          {/* Badge "Le plus populaire" */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-bold bg-gradient-to-r from-[#7C3AED] via-[#EC4899] to-[#3B82F6] text-white uppercase tracking-wider shadow-lg flex items-center gap-1.5 whitespace-nowrap">
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>Le plus populaire</span>
          </div>

          <div className="space-y-6 pt-2">
            {/* Header Carte */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#EC4899] px-2.5 py-1 rounded-lg bg-[#EC4899]/10 border border-[#EC4899]/30">
                  Formule 2
                </span>
                {currentUser?.forfait === 'STANDARD' && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Votre forfait actif
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                <span>Standard</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#7C3AED]/20 text-[#EC4899] border border-[#7C3AED]/30">
                  Idéal Cinéphiles
                </span>
              </h3>
              <p className="text-xs text-[#B8B4C0] min-h-[32px] leading-relaxed">
                Pour profiter pleinement de vos soirées cinéma avec chat vocal, import vidéo et sans publicité.
              </p>
            </div>

            {/* Prix */}
            <div className="pt-2 border-t border-[#232326]/60">
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                    {billingCycle === 'MONTHLY' ? '2 800 FCFA' : '2 240 FCFA'}
                  </span>
                  <span className="text-xs text-[#8E8A99] font-medium">/ mois</span>
                </div>
                <span className="text-xs text-pink-300/90 font-medium mt-0.5">
                  {billingCycle === 'MONTHLY' ? '≈ 4,27 €/mois' : '≈ 3,42 €/mois'}
                </span>
              </div>
              <p className="text-[11px] text-[#8E8A99] mt-1">
                {billingCycle === 'ANNUAL'
                  ? 'Facturé 26 880 FCFA par an (≈ 40,98 € · 2 mois offerts)'
                  : 'Sans engagement, résiliable à tout moment'}
              </p>
            </div>

            {/* Liste des fonctionnalités */}
            <div className="space-y-3 pt-2">
              <span className="text-[11px] font-bold text-[#EC4899] uppercase tracking-wider block">
                Tout ce qui est inclus :
              </span>
              <ul className="space-y-3 text-xs">
                {/* 25 films ou épisodes par mois */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#EC4899]/20 text-[#EC4899] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>25 films ou épisodes</strong> de série par mois</span>
                </li>

                {/* Invitation jusqu'à 50 personnes */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#EC4899]/20 text-[#EC4899] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Invitation <strong>jusqu'à 50 personnes</strong></span>
                </li>

                {/* Au choix par lien URL ou par import vidéo */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#EC4899]/20 text-[#EC4899] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Diffusion au choix par <strong>lien URL</strong> ou <strong>import vidéo</strong></span>
                </li>

                {/* Accès catalogue suggestions */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#EC4899]/20 text-[#EC4899] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Accès au catalogue <strong>« Films & séries du moment »</strong></span>
                </li>

                {/* Chat texte ET vocal disponibles */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#EC4899]/20 text-[#EC4899] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>Chat texte ET vocal</strong> disponibles pendant la séance</span>
                </li>

                {/* Débriefing disponible après la séance */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#EC4899]/20 text-[#EC4899] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>Débriefing d'après-séance</strong> disponible (micro & vidéo)</span>
                </li>

                {/* Sans publicité */}
                <li className="flex items-start gap-2.5 text-emerald-400 font-medium">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Expérience <strong>100% sans publicité</strong></span>
                </li>

                {/* Pas d'accès communication réseau amis */}
                <li className="flex items-start gap-2.5 text-[#8E8A99]">
                  <div className="w-5 h-5 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                    <XIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="line-through text-[#7A7684]">Communication réseau d'amis & messagerie</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bouton d'action */}
          <div className="pt-8">
            <button
              onClick={() => handleSelectPlan('STANDARD')}
              className="w-full py-3.5 rounded-2xl font-bold text-xs text-white bg-gradient-to-r from-[#7C3AED] via-[#EC4899] to-[#EC4899] hover:opacity-95 shadow-lg shadow-[#EC4899]/25 transition-all flex items-center justify-center gap-2"
            >
              <span>
                {currentUser?.forfait === 'STANDARD'
                  ? 'Forfait actuel'
                  : 'Choisir Standard — 2 800 FCFA'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* FORMULE 3 — PREMIUM */}
        {/* ------------------------------------------------------------ */}
        <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative transition-all duration-300 hover:border-[#3B82F6]/60">
          <div className="space-y-6">
            {/* Header Carte */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#3B82F6] px-2.5 py-1 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/30">
                  Formule 3
                </span>
                {currentUser?.forfait === 'PREMIUM' && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Votre forfait actif
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                <span>Premium</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Tout Illimité
                </span>
              </h3>
              <p className="text-xs text-[#B8B4C0] min-h-[32px] leading-relaxed">
                L’expérience ultime avec grand groupe, assistant IA, streaming tiers et réseau d’amis débloqué.
              </p>
            </div>

            {/* Prix */}
            <div className="pt-2 border-t border-[#232326]/60">
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                    {billingCycle === 'MONTHLY' ? '4 750 FCFA' : '3 800 FCFA'}
                  </span>
                  <span className="text-xs text-[#8E8A99] font-medium">/ mois</span>
                </div>
                <span className="text-xs text-blue-300/90 font-medium mt-0.5">
                  {billingCycle === 'MONTHLY' ? '≈ 7,24 €/mois' : '≈ 5,79 €/mois'}
                </span>
              </div>
              <p className="text-[11px] text-[#8E8A99] mt-1">
                {billingCycle === 'ANNUAL'
                  ? 'Facturé 45 600 FCFA par an (≈ 69,52 € · 2 mois offerts)'
                  : 'Sans engagement, résiliable à tout moment'}
              </p>
            </div>

            {/* Liste des fonctionnalités */}
            <div className="space-y-3 pt-2">
              <span className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider block">
                Tout ce qui est inclus :
              </span>
              <ul className="space-y-3 text-xs">
                {/* Visionnage illimité */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#3B82F6]/20 text-[#3B82F6] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>Visionnage illimité</strong> de films et séries</span>
                </li>

                {/* Toutes les fonctionnalités Standard incluses */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#3B82F6]/20 text-[#3B82F6] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>Toutes les fonctions Standard incluses</strong> (import vidéo, suggestions, chat + vocal, débriefing, sans pub)</span>
                </li>

                {/* Invitation jusqu'à 250 personnes */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#3B82F6]/20 text-[#3B82F6] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Invitation <strong>jusqu'à 250 personnes</strong> simultanément</span>
                </li>

                {/* Accès à un assistant IA personnel */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <span>Accès à un <strong>assistant IA personnel</strong> dédié</span>
                </li>

                {/* Connexion plateformes streaming externes */}
                <li className="flex items-start gap-2.5 text-[#FAFAFA]">
                  <div className="w-5 h-5 rounded-md bg-[#3B82F6]/20 text-[#3B82F6] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Connexion de <strong>plateformes de streaming externes</strong> comme source</span>
                </li>

                {/* Communication réseau d'amis débloqué */}
                <li className="flex items-start gap-2.5 text-emerald-400 font-medium">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>Réseau d'amis & messagerie</strong> entièrement débloqués</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bouton d'action */}
          <div className="pt-8">
            <button
              onClick={() => handleSelectPlan('PREMIUM')}
              className="w-full py-3.5 rounded-2xl font-bold text-xs text-white bg-gradient-to-r from-[#3B82F6] to-[#7C3AED] hover:opacity-95 shadow-md shadow-[#3B82F6]/20 transition-all flex items-center justify-center gap-2"
            >
              <span>
                {currentUser?.forfait === 'PREMIUM'
                  ? 'Forfait actuel'
                  : 'Choisir Premium — 4 750 FCFA'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* ============================================================ */}
      {/* 3. TABLEAU COMPARATIF RÉCAPITULATIF (LIGNE PAR LIGNE) */}
      {/* ============================================================ */}
      <div className="space-y-6 pt-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Tableau comparatif récapitulatif
          </h2>
          <p className="text-xs sm:text-sm text-[#B8B4C0]">
            Comparez en un coup d'œil l'ensemble des critères et fonctionnalités entre les 3 formules Kinoo.
          </p>
        </div>

        <div className="bg-[#141417] border border-[#232326] rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#232326] bg-[#17171C]">
                  <th className="py-4 px-5 text-xs font-bold text-[#FAFAFA] uppercase tracking-wider w-1/3">
                    Critères & Fonctionnalités
                  </th>
                  <th className="py-4 px-4 text-xs font-bold text-center text-white bg-[#141417]/70 w-1/5">
                    Gratuit
                  </th>
                  <th className="py-4 px-4 text-xs font-bold text-center text-[#EC4899] bg-[#EC4899]/5 border-x border-[#EC4899]/20 w-1/5">
                    <div className="inline-flex items-center gap-1">
                      <span>Standard</span>
                      <Star className="w-3 h-3 fill-current" />
                    </div>
                  </th>
                  <th className="py-4 px-4 text-xs font-bold text-center text-[#3B82F6] bg-[#3B82F6]/5 w-1/5">
                    Premium
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232326] text-xs">
                {/* 1. Tarif mensuel */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA] flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-[#7C3AED]" />
                    <span>Tarif mensuel</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="font-extrabold text-sm text-white">0 FCFA</div>
                    <div className="text-[11px] text-gray-400 font-normal">0 € / mois</div>
                  </td>
                  <td className="py-3.5 px-4 text-center bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <div className="font-extrabold text-sm text-[#EC4899]">2 800 FCFA</div>
                    <div className="text-[11px] text-pink-300/80 font-normal">≈ 4,27 € / mois</div>
                  </td>
                  <td className="py-3.5 px-4 text-center bg-[#3B82F6]/5">
                    <div className="font-extrabold text-sm text-[#3B82F6]">4 750 FCFA</div>
                    <div className="text-[11px] text-blue-300/80 font-normal">≈ 7,24 € / mois</div>
                  </td>
                </tr>

                {/* 2. Quota de visionnage */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA] flex items-center gap-2">
                    <Film className="w-4 h-4 text-[#EC4899]" />
                    <span>Quota mensuel de visionnage</span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-[#B8B4C0]">3 films / épisodes</td>
                  <td className="py-3.5 px-4 text-center font-semibold text-white bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    25 films / épisodes
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400 bg-[#3B82F6]/5">
                    Illimité
                  </td>
                </tr>

                {/* 3. Nombre maximum d'invités */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA] flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#3B82F6]" />
                    <span>Capacité d'invitation par séance</span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-[#B8B4C0]">Jusqu'à 10 personnes</td>
                  <td className="py-3.5 px-4 text-center font-semibold text-white bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    Jusqu'à 50 personnes
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400 bg-[#3B82F6]/5">
                    Jusqu'à 250 personnes
                  </td>
                </tr>

                {/* 4. Diffusion par lien URL */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA]">
                    Diffusion par lien URL (Web, YouTube, flux directs)
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#3B82F6]/5">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                </tr>

                {/* 5. Import vidéo de fichiers personnels */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA]">
                    Importation de fichiers vidéo (MP4, MKV, WebM)
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#3B82F6]/5">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                </tr>

                {/* 6. Catalogue de suggestions */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA]">
                    Catalogue « Films & séries du moment »
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#3B82F6]/5">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                </tr>

                {/* 7. Chat texte pendant la séance */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA] flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#B8B4C0]" />
                    <span>Chat texte interactif & réactions</span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#3B82F6]/5">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                </tr>

                {/* 8. Appel vocal pendant la séance */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA] flex items-center gap-2">
                    <Mic className="w-4 h-4 text-[#7C3AED]" />
                    <span>Appel vocal pendant la séance</span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#3B82F6]/5">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                </tr>

                {/* 9. Débriefing après séance */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA]">
                    Débriefing après la séance (micro & webcam)
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 bg-[#3B82F6]/5">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                </tr>

                {/* 10. Expérience publicitaire */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA]">
                    Publicité
                  </td>
                  <td className="py-3.5 px-4 text-center text-amber-400 font-medium">
                    Avec publicités
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    Sans publicité
                  </td>
                  <td className="py-3.5 px-4 text-center font-bold text-emerald-400 bg-[#3B82F6]/5">
                    Sans publicité
                  </td>
                </tr>

                {/* 11. Communication réseau d'amis */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA]">
                    Communication réseau d'amis & messagerie privée
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 font-bold bg-[#3B82F6]/5">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                </tr>

                {/* 12. Assistant IA personnel */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA] flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[#7C3AED]" />
                    <span>Assistant IA personnel pour l'utilisateur</span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 font-bold bg-[#3B82F6]/5">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                </tr>

                {/* 13. Plateformes de streaming externes */}
                <tr className="hover:bg-[#1A1A22] transition-colors">
                  <td className="py-3.5 px-5 font-semibold text-[#FAFAFA] flex items-center gap-2">
                    <Tv className="w-4 h-4 text-[#3B82F6]" />
                    <span>Connexion plateformes streaming externes</span>
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-red-400 bg-[#EC4899]/5 border-x border-[#EC4899]/20">
                    <XIcon className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3.5 px-4 text-center text-emerald-400 font-bold bg-[#3B82F6]/5">
                    <Check className="w-4 h-4 mx-auto" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. MODALITÉS & INFRASTRUCTURE */}
      {/* ============================================================ */}
      <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#232326] text-[#EC4899]">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Moyens de paiement acceptés pour la monétisation</h3>
            <p className="text-xs text-[#B8B4C0]">Paiement instantané et sécurisé avec conformité internationale.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="p-4 bg-[#09090B] border border-[#232326] rounded-2xl space-y-1 text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-[#EC4899]" />
              Cartes Bancaires
            </span>
            <p className="text-[#B8B4C0]">Visa, Mastercard, American Express avec cryptage 256-bit.</p>
          </div>

          <div className="p-4 bg-[#09090B] border border-[#232326] rounded-2xl space-y-1 text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-[#3B82F6]" />
              Wave Mobile
            </span>
            <p className="text-[#B8B4C0]">Paiement instantané 1% sans frais cachés en Afrique de l'Ouest.</p>
          </div>

          <div className="p-4 bg-[#09090B] border border-[#232326] rounded-2xl space-y-1 text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-orange-400" />
              Orange Money
            </span>
            <p className="text-[#B8B4C0]">Paiement sécurisé par portefeuille mobile opérateur.</p>
          </div>

          <div className="p-4 bg-[#09090B] border border-[#232326] rounded-2xl space-y-1 text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-blue-400" />
              PayPal
            </span>
            <p className="text-[#B8B4C0]">Protection des achats et règlement international en 1 clic.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
