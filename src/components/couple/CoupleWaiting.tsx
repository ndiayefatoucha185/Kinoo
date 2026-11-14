import React, { useState } from 'react';
import { Copy, Check, Loader2, Hourglass, CreditCard, ShieldCheck, LogOut } from 'lucide-react';
import { ApiClient } from '../../services/api';
import type { CoupleInfo, CoupleState } from '../../types/couple';
import type { User } from '../../types/kinoo';

interface Props {
  couple: CoupleInfo;
  currentUser: User;
  onState: (state: CoupleState) => void;
  onLeave: () => void;
}

export const CoupleWaiting: React.FC<Props> = ({ couple, currentUser, onState, onLeave }) => {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';

  const invite = `Rejoins-moi sur Kinoo Couple. Crée un compte ou connecte-toi, ouvre « Espace Couple » et entre ce code : ${couple.inviteCode}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg('Copie impossible : recopiez le code à la main.');
    }
  };

  const pay = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await ApiClient.couplePay();
    } catch (e: any) {
      setMsg(e?.message || 'Paiement indisponible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      onState(await ApiClient.coupleActivate());
    } catch (e: any) {
      setMsg(e?.message || 'Activation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const modeLabel = couple.mode === 'GALANTERIE' ? 'Galanterie' : '50 / 50';

  return (
    <div className="max-w-xl mx-auto space-y-5 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
        <Hourglass className="w-7 h-7 text-rose-300" />
      </div>

      {couple.status === 'EN_ATTENTE_PARTENAIRE' && (
        <>
          <h2 className="text-xl font-bold text-white">Invitez votre moitié</h2>
          <p className="text-sm text-rose-100/80">Mode choisi : <b>{modeLabel}</b>. Envoyez ce code à votre partenaire : il l'entre dans « Espace Couple » après avoir créé son compte Kinoo.</p>
          <div className="p-5 rounded-3xl bg-black/30 border border-rose-400/30">
            <p className="text-xs uppercase tracking-widest text-rose-200/70">Code d'invitation</p>
            <p className="text-3xl sm:text-4xl font-black tracking-[0.3em] text-white mt-1 select-all">{couple.inviteCode}</p>
          </div>
          <button onClick={copy} className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold inline-flex items-center gap-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Message copié' : 'Copier le message d’invitation'}
          </button>
        </>
      )}

      {couple.status === 'EN_ATTENTE_PAIEMENT' && (
        <>
          <h2 className="text-xl font-bold text-white">Dernière étape : activer l'espace</h2>
          <p className="text-sm text-rose-100/80">
            {couple.partner ? <>Vous êtes avec <b>{couple.partner.pseudo}</b>. </> : null}
            Mode <b>{modeLabel}</b> :{' '}
            {couple.mode === 'GALANTERIE'
              ? couple.role === 'OWNER'
                ? 'vous réglez le forfait pour vous deux.'
                : `${couple.partner?.pseudo || 'votre partenaire'} règle le forfait pour vous deux.`
              : 'chacun règle sa moitié.'}
          </p>
          {couple.amountToPay > 0 ? (
            <button onClick={pay} disabled={busy} className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Payer {couple.amountToPay.toLocaleString('fr-FR')} FCFA
            </button>
          ) : (
            <p className="text-sm text-rose-200">En attente du règlement de {couple.partner?.pseudo || 'votre partenaire'}…</p>
          )}
          {isSuperAdmin && (
            <div>
              <button onClick={activate} disabled={busy} className="px-4 py-2 rounded-xl border border-amber-400/50 text-amber-300 text-xs font-bold inline-flex items-center gap-2 hover:bg-amber-400/10">
                <ShieldCheck className="w-4 h-4" /> Activer sans paiement (Super Admin)
              </button>
            </div>
          )}
        </>
      )}

      {couple.status === 'EXPIRE' && (
        <>
          <h2 className="text-xl font-bold text-white">Votre forfait Couple a expiré</h2>
          <p className="text-sm text-rose-100/80">Renouvelez-le pour retrouver votre espace : vos messages et souvenirs sont conservés.</p>
          <button onClick={pay} disabled={busy} className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white text-sm font-bold">Renouveler</button>
          {isSuperAdmin && <button onClick={activate} className="block mx-auto text-xs text-amber-300 underline">Réactiver (Super Admin)</button>}
        </>
      )}

      {msg && <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">{msg}</p>}

      <button onClick={onLeave} className="text-xs text-white/50 hover:text-rose-300 inline-flex items-center gap-1.5">
        <LogOut className="w-3.5 h-3.5" /> {couple.role === 'OWNER' ? 'Supprimer cet espace' : 'Quitter cet espace'}
      </button>
    </div>
  );
};
