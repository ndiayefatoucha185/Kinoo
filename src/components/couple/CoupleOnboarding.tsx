import React, { useState } from 'react';
import { Heart, Gift, Users, KeyRound, Loader2 } from 'lucide-react';
import { ApiClient } from '../../services/api';
import type { CoupleMode, CoupleState } from '../../types/couple';

interface Props {
  priceXof: number;
  onDone: (state: CoupleState) => void;
}

export const CoupleOnboarding: React.FC<Props> = ({ priceXof, onDone }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const half = Math.round(priceXof / 2);

  const create = async (mode: CoupleMode) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await ApiClient.coupleCreate(mode));
    } catch (e: any) {
      setError(e?.message || 'Impossible de créer votre espace.');
    } finally {
      setBusy(false);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await ApiClient.coupleJoin(code));
    } catch (err: any) {
      setError(err?.message || 'Code invalide.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-rose-500 to-pink-400 flex items-center justify-center shadow-lg shadow-rose-500/30">
          <Heart className="w-8 h-8 text-white" fill="currentColor" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Kinoo Couple</h2>
        <p className="text-rose-100/80 text-sm max-w-xl mx-auto">
          Un espace rien que pour vous deux : compteur de jours, discussion privée, question du jour, souvenirs, sorties… et des soirées ciné synchronisées. {priceXof.toLocaleString('fr-FR')} FCFA par mois pour le couple.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => create('GALANTERIE')}
          className="text-left p-5 rounded-3xl border border-rose-400/30 bg-white/5 hover:bg-white/10 hover:border-rose-400/60 transition-colors disabled:opacity-60"
        >
          <Gift className="w-7 h-7 text-rose-300 mb-3" />
          <p className="text-lg font-bold text-white">Galanterie</p>
          <p className="text-sm text-rose-100/80 mt-1">Vous offrez le forfait à votre moitié : un seul paiement de {priceXof.toLocaleString('fr-FR')} FCFA / mois, puis vous l'invitez avec un code.</p>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => create('PARTAGE_50_50')}
          className="text-left p-5 rounded-3xl border border-rose-400/30 bg-white/5 hover:bg-white/10 hover:border-rose-400/60 transition-colors disabled:opacity-60"
        >
          <Users className="w-7 h-7 text-rose-300 mb-3" />
          <p className="text-lg font-bold text-white">50 / 50</p>
          <p className="text-sm text-rose-100/80 mt-1">Chacun paie sa moitié : {half.toLocaleString('fr-FR')} FCFA par personne et par mois. L'espace s'active quand vous avez tous les deux payé.</p>
        </button>
      </div>

      <form onSubmit={join} className="p-5 rounded-3xl border border-white/10 bg-white/5 space-y-3">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-rose-300" /> Votre partenaire vous a envoyé un code ?</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Code d'invitation"
            maxLength={16}
            className="flex-1 px-4 py-2.5 rounded-xl bg-black/30 border border-white/15 text-white placeholder-white/40 text-sm tracking-widest focus:outline-none focus:border-rose-400"
          />
          <button disabled={busy || code.trim().length < 6} className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Rejoindre
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2.5">{error}</p>}
    </div>
  );
};
