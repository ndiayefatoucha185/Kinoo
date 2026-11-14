import React, { useCallback, useEffect, useState } from 'react';
import { Heart, MessageCircle, Film, Camera, Settings, ArrowLeft, Loader2, LogOut } from 'lucide-react';
import { ApiClient } from '../services/api';
import type { CoupleState } from '../types/couple';
import type { User } from '../types/kinoo';
import { CoupleOnboarding } from '../components/couple/CoupleOnboarding';
import { CoupleWaiting } from '../components/couple/CoupleWaiting';
import { CoupleHome } from '../components/couple/CoupleHome';
import { CoupleChat } from '../components/couple/CoupleChat';
import { CoupleCinema } from '../components/couple/CoupleCinema';
import { CoupleMemories } from '../components/couple/CoupleMemories';

interface Props {
  currentUser: User;
  onEnterRoom: (roomId: string) => void;
  onBack: () => void;
}

type Tab = 'home' | 'chat' | 'cinema' | 'souvenirs' | 'settings';

/** Interface dédiée du forfait Couple : volontairement distincte du tableau de bord habituel. */
export const CoupleSpaceView: React.FC<Props> = ({ currentUser, onEnterRoom, onBack }) => {
  const [state, setState] = useState<CoupleState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const refresh = useCallback(() => {
    ApiClient.coupleState()
      .then((s) => {
        setState(s);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e?.message || "Impossible de charger l'espace Couple."));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tant que l'espace n'est pas actif, on suit l'arrivée du partenaire et le paiement
  const status = state?.couple?.status;
  useEffect(() => {
    if (!state?.couple || status === 'ACTIF') return;
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [state?.couple?.id, status, refresh]);

  const leave = async () => {
    setLeaving(true);
    try {
      await ApiClient.coupleLeave();
      setConfirmLeave(false);
      setTab('home');
      refresh();
    } catch (e: any) {
      setLoadError(e?.message || 'Action impossible.');
    } finally {
      setLeaving(false);
    }
  };

  const couple = state?.couple || null;
  const partnerName = couple?.partner?.pseudo || 'votre partenaire';

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Accueil', icon: <Heart className="w-4 h-4" /> },
    { id: 'chat', label: 'Discussion', icon: <MessageCircle className="w-4 h-4" /> },
    { id: 'cinema', label: 'Ciné', icon: <Film className="w-4 h-4" /> },
    { id: 'souvenirs', label: 'Souvenirs', icon: <Camera className="w-4 h-4" /> },
    { id: 'settings', label: 'Réglages', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="rounded-3xl overflow-hidden border border-rose-500/20" style={{ background: 'linear-gradient(160deg,#1a0a14 0%,#180a22 100%)', color: '#fff' }}>
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-white/10">
        <button onClick={onBack} className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white" aria-label="Retour au tableau de bord"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-rose-400" fill="currentColor" />
          <span className="font-extrabold text-white">Kinoo Couple</span>
        </div>
        {couple?.partner && <span className="ml-auto text-xs text-rose-100/70 truncate">avec {couple.partner.pseudo}</span>}
      </div>

      <div className="p-4 sm:p-6">
        {loadError && !state && <p className="text-center text-sm text-rose-300">{loadError}</p>}
        {!state && !loadError && <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-rose-300" /></div>}

        {state && !couple && <CoupleOnboarding priceXof={state.priceXof} onDone={setState} />}

        {state && couple && couple.status !== 'ACTIF' && (
          <CoupleWaiting couple={couple} currentUser={currentUser} onState={setState} onLeave={() => setConfirmLeave(true)} />
        )}

        {state && couple && couple.status === 'ACTIF' && (
          <>
            <nav className="flex gap-1.5 overflow-x-auto pb-3 mb-4 -mx-1 px-1" aria-label="Espace couple">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors ${tab === t.id ? 'bg-rose-500 text-white' : 'bg-white/5 text-rose-100/80 hover:bg-white/10'}`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </nav>

            {tab === 'home' && <CoupleHome couple={couple} currentUser={currentUser} onState={setState} goTab={(t) => setTab(t)} />}
            {tab === 'chat' && <CoupleChat myId={currentUser.id} partnerName={partnerName} />}
            {tab === 'cinema' && <CoupleCinema myId={currentUser.id} partnerName={partnerName} onEnterRoom={onEnterRoom} />}
            {tab === 'souvenirs' && <CoupleMemories />}
            {tab === 'settings' && (
              <div className="max-w-xl space-y-4">
                <div className="rounded-3xl p-5 bg-white/5 border border-white/10 space-y-1.5 text-sm">
                  <p className="font-bold text-white">Votre forfait Couple</p>
                  <p className="text-rose-100/80">Mode : {couple.mode === 'GALANTERIE' ? 'Galanterie (un seul paiement)' : '50 / 50 (chacun sa moitié)'}</p>
                  <p className="text-rose-100/80">Prix : {state.priceXof.toLocaleString('fr-FR')} FCFA par mois pour le couple</p>
                  {couple.expiresAt && <p className="text-rose-100/80">Actif jusqu'au {new Date(couple.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
                  <p className="text-rose-100/60 text-xs pt-1">Vos messages et photos ne sont visibles que par vous deux.</p>
                </div>
                <button onClick={() => setConfirmLeave(true)} className="text-sm text-rose-300 hover:text-rose-200 inline-flex items-center gap-2">
                  <LogOut className="w-4 h-4" /> {couple.role === 'OWNER' ? 'Supprimer cet espace Couple' : 'Quitter cet espace Couple'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {confirmLeave && couple && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => !leaving && setConfirmLeave(false)}>
          <div className="w-full max-w-sm rounded-3xl p-6 space-y-4" style={{ background: '#1a0a14' }} onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold text-white">{couple.role === 'OWNER' ? 'Supprimer l’espace Couple ?' : 'Quitter l’espace Couple ?'}</p>
            <p className="text-sm text-rose-100/80">
              {couple.role === 'OWNER'
                ? 'Tous les messages, photos, souvenirs et sorties seront supprimés définitivement, pour vous deux.'
                : `Vous perdrez l’accès à l’espace. ${partnerName} le conserve.`}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmLeave(false)} disabled={leaving} className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm">Annuler</button>
              <button onClick={leave} disabled={leaving} className="px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-bold inline-flex items-center gap-2">
                {leaving && <Loader2 className="w-4 h-4 animate-spin" />} Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
