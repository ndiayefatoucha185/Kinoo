import React, { useCallback, useEffect, useState } from 'react';
import { Heart, MessageCircle, Film, Target, User as UserIcon, Home, ArrowLeft, Loader2 } from 'lucide-react';
import '../styles/couple.css';
import { ApiClient } from '../services/api';
import type { CoupleState } from '../types/couple';
import type { User } from '../types/kinoo';
import { CoupleOnboarding } from '../components/couple/CoupleOnboarding';
import { CoupleWaiting } from '../components/couple/CoupleWaiting';
import { CoupleHome } from '../components/couple/CoupleHome';
import { CoupleMoments, type MomentsSub } from '../components/couple/CoupleMoments';
import { CoupleCinema } from '../components/couple/CoupleCinema';
import { CoupleProjects, type ProjectsSub } from '../components/couple/CoupleProjects';
import { CoupleProfile } from '../components/couple/CoupleProfile';
import { Sheet } from '../components/couple/kit';

interface Props {
  currentUser: User;
  onEnterRoom: (roomId: string) => void;
  /** Absent dans l'application Kinoo Couple (il n'y a rien où revenir) */
  onBack?: () => void;
}

type Tab = 'home' | 'moments' | 'cinema' | 'projects' | 'profile';

/** Interface dédiée du forfait Couple : barre du bas, Ciné au centre. */
export const CoupleSpaceView: React.FC<Props> = ({ currentUser, onEnterRoom, onBack }) => {
  const [state, setState] = useState<CoupleState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [momentsSub, setMomentsSub] = useState<MomentsSub | undefined>();
  const [projectsSub, setProjectsSub] = useState<ProjectsSub | undefined>();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [editStart, setEditStart] = useState(false);
  const [startValue, setStartValue] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    ApiClient.coupleState()
      .then((s) => { setState(s); setLoadError(null); })
      .catch((e) => setLoadError(e?.message || "Impossible de charger l'espace Couple."));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Tant que l'espace n'est pas actif, on suit l'arrivée du partenaire et le paiement
  const status = state?.couple?.status;
  useEffect(() => {
    if (!state?.couple || status === 'ACTIF') return;
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [state?.couple?.id, status, refresh]);

  // Remonter en haut à chaque changement d'onglet
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

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

  const saveStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startValue) return;
    setSheetError(null);
    try {
      setState(await ApiClient.coupleSetStartDate(startValue));
      setEditStart(false);
    } catch (err: any) {
      setSheetError(err?.message || 'Date non enregistrée.');
    }
  };

  const couple = state?.couple || null;
  const partnerName = couple?.partner?.pseudo || 'Votre partenaire';
  const active = Boolean(state && couple && couple.status === 'ACTIF');

  const go = (t: 'moments' | 'cinema' | 'projects', sub?: string) => {
    if (t === 'moments') setMomentsSub(sub as MomentsSub | undefined);
    if (t === 'projects') setProjectsSub(sub as ProjectsSub | undefined);
    setTab(t);
  };
  const pickTab = (t: Tab) => {
    if (t === 'moments') setMomentsSub(undefined);
    if (t === 'projects') setProjectsSub(undefined);
    setTab(t);
  };

  const tabBtn = (id: Tab, label: string, icon: React.ReactNode) => (
    <button key={id} className="kc-tab" aria-current={tab === id ? 'page' : undefined} onClick={() => pickTab(id)}>
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className={`kc kc-shell ${active && tab === 'cinema' ? 'kc-shell-cinema' : ''}`}>
      {onBack && (
        <div className="flex items-center gap-3 px-4 pt-3.5">
          <button onClick={onBack} className="kc-iconbtn" aria-label="Retour au tableau de bord"><ArrowLeft className="w-4 h-4" /></button>
          <span className="flex items-center gap-2 font-extrabold"><Heart className="w-5 h-5 kc-accent" fill="currentColor" /> Kinoo Couple</span>
        </div>
      )}

      {loadError && !state && <p className="kc-page text-center text-sm kc-accent">{loadError}</p>}
      {!state && !loadError && <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin kc-accent" /></div>}
      {state && !couple && <div className="kc-page"><CoupleOnboarding priceXof={state.priceXof} onDone={setState} /></div>}
      {state && couple && couple.status !== 'ACTIF' && (
        <div className="kc-page"><CoupleWaiting couple={couple} currentUser={currentUser} onState={setState} onLeave={() => setConfirmLeave(true)} /></div>
      )}

      {state && couple && active && (
        <>
          {tab === 'home' && <CoupleHome couple={couple} currentUser={currentUser} onState={setState} go={go} />}
          {tab === 'moments' && <CoupleMoments myId={currentUser.id} myName={currentUser.pseudo} partnerName={partnerName} partnerOnline={couple.partner?.online} initialSub={momentsSub} />}
          {tab === 'cinema' && <CoupleCinema myId={currentUser.id} partnerName={partnerName} onEnterRoom={onEnterRoom} />}
          {tab === 'projects' && <CoupleProjects myId={currentUser.id} partnerName={partnerName} initialSub={projectsSub} />}
          {tab === 'profile' && (
            <CoupleProfile
              couple={couple}
              currentUser={currentUser}
              priceXof={state.priceXof}
              onLeave={() => setConfirmLeave(true)}
              onEditStart={() => { setStartValue(couple.startDate || ''); setSheetError(null); setEditStart(true); }}
            />
          )}

          <nav className="kc-tabbar" aria-label="Espace couple">
            <div className="kc-tabbar-inner">
              {tabBtn('home', 'Accueil', <Home className="w-5 h-5" />)}
              {tabBtn('moments', 'Moments', <MessageCircle className="w-5 h-5" />)}
              <button className="kc-tab kc-tab-fab" aria-current={tab === 'cinema' ? 'page' : undefined} onClick={() => pickTab('cinema')} aria-label="Ciné à deux">
                <span className="kc-fab"><Film className="w-6 h-6" /></span>
                <span style={{ color: tab === 'cinema' ? 'var(--kc-accent)' : 'var(--kc-faint)' }}>Ciné</span>
              </button>
              {tabBtn('projects', 'Projets', <Target className="w-5 h-5" />)}
              {tabBtn('profile', 'Profil', <UserIcon className="w-5 h-5" />)}
            </div>
          </nav>
        </>
      )}

      {editStart && (
        <Sheet title="Début de votre histoire" onClose={() => setEditStart(false)}>
          <form onSubmit={saveStart} className="space-y-3">
            <input type="date" className="kc-input" value={startValue} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setStartValue(e.target.value)} required aria-label="Date de début" />
            {sheetError && <p className="text-xs kc-accent">{sheetError}</p>}
            <button className="kc-btn w-full" disabled={!startValue}>Enregistrer</button>
          </form>
        </Sheet>
      )}

      {confirmLeave && couple && (
        <Sheet title={couple.role === 'OWNER' ? 'Supprimer l’espace Couple ?' : 'Quitter l’espace Couple ?'} onClose={() => !leaving && setConfirmLeave(false)}>
          <p className="text-sm kc-muted">
            {couple.role === 'OWNER'
              ? 'Tous les messages, photos, souvenirs, parcours et la cagnotte seront supprimés définitivement, pour vous deux.'
              : `Vous perdrez l’accès à l’espace. ${partnerName} le conserve.`}
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmLeave(false)} disabled={leaving} className="kc-btn-ghost">Annuler</button>
            <button onClick={leave} disabled={leaving} className="kc-btn">{leaving && <Loader2 className="w-4 h-4 animate-spin" />} Confirmer</button>
          </div>
        </Sheet>
      )}
    </div>
  );
};
