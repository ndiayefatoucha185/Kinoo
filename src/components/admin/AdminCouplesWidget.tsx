import React, { useCallback, useEffect, useState } from 'react';
import { Heart, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { ApiClient } from '../../services/api';

interface CoupleRow {
  id: string;
  mode: 'GALANTERIE' | 'PARTAGE_50_50';
  status: 'EN_ATTENTE_PARTENAIRE' | 'EN_ATTENTE_PAIEMENT' | 'ACTIF' | 'EXPIRE';
  ownerPseudo: string;
  partnerPseudo: string | null;
  ownerPaid: boolean;
  partnerPaid: boolean;
  expiresAt: string | null;
  createdAt: string;
}
interface CoupleStats {
  total: number;
  actifs: number;
  enAttentePartenaire: number;
  enAttentePaiement: number;
  expires: number;
  mrrXof: number;
}

const STATUS: Record<CoupleRow['status'], { label: string; cls: string }> = {
  ACTIF: { label: 'Actif', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  EN_ATTENTE_PAIEMENT: { label: 'Paiement en attente', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  EN_ATTENTE_PARTENAIRE: { label: 'Partenaire attendu', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  EXPIRE: { label: 'Expiré', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

interface Props {
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/** Suivi du forfait Couple pour le Super Admin : chiffres, statuts, activation manuelle. Aucun contenu privé n'est exposé. */
export const AdminCouplesWidget: React.FC<Props> = ({ onToast }) => {
  const [data, setData] = useState<{ stats: CoupleStats; couples: CoupleRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    ApiClient.adminCouples()
      .then((d: any) => {
        setData(d);
        setError(null);
      })
      .catch((e: any) => setError(e?.message || 'Chargement impossible.'));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (c: CoupleRow, kind: 'activate' | 'deactivate') => {
    setBusyId(c.id);
    try {
      if (kind === 'activate') await ApiClient.adminCoupleActivate(c.id, 30);
      else await ApiClient.adminCoupleDeactivate(c.id);
      onToast?.(kind === 'activate' ? 'Forfait Couple activé pour 30 jours.' : 'Forfait Couple désactivé.', 'success');
      load();
    } catch (e: any) {
      onToast?.(e?.message || 'Action impossible.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const stats = data?.stats;
  const cards = [
    { label: 'Couples inscrits', value: stats?.total ?? '–' },
    { label: 'Forfaits actifs', value: stats?.actifs ?? '–' },
    { label: 'Paiement en attente', value: stats?.enAttentePaiement ?? '–' },
    { label: 'Partenaire attendu', value: stats?.enAttentePartenaire ?? '–' },
    { label: 'Revenu mensuel Couple', value: stats ? `${stats.mrrXof.toLocaleString('fr-FR')} FCFA` : '–' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Vue de gestion uniquement : les messages, photos et souvenirs des couples restent privés.</p>
        <button onClick={load} className="px-3 py-2 rounded-xl bg-[#111219] border border-[#1F202B] text-gray-300 text-xs inline-flex items-center gap-2 hover:text-white"><RefreshCw className="w-3.5 h-3.5" /> Actualiser</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-[#111219] border border-[#1F202B] p-4">
            <p className="text-[11px] text-gray-400">{c.label}</p>
            <p className="text-xl font-extrabold text-white mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!data && !error && <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}

      {data && (
        <div className="rounded-2xl bg-[#111219] border border-[#1F202B] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-[#1F202B]">
                <th className="px-4 py-3">Couple</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Paiements</th>
                <th className="px-4 py-3">Expire le</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.couples.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Aucun couple pour l'instant.</td></tr>
              )}
              {data.couples.map((c) => (
                <tr key={c.id} className="border-b border-[#1F202B] last:border-0">
                  <td className="px-4 py-3 text-white">
                    <span className="inline-flex items-center gap-2"><Heart className="w-3.5 h-3.5 text-rose-400" fill="currentColor" /> {c.ownerPseudo} &amp; {c.partnerPseudo || '…'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{c.mode === 'GALANTERIE' ? 'Galanterie' : '50 / 50'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span></td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{c.ownerPseudo}: {c.ownerPaid ? 'payé' : 'non'}{c.mode === 'PARTAGE_50_50' ? ` · ${c.partnerPseudo || 'partenaire'}: ${c.partnerPaid ? 'payé' : 'non'}` : ''}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('fr-FR') : '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {c.status === 'ACTIF' ? (
                      <button disabled={busyId === c.id} onClick={() => act(c, 'deactivate')} className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-500/10 disabled:opacity-50">Désactiver</button>
                    ) : (
                      <button disabled={busyId === c.id || c.status === 'EN_ATTENTE_PARTENAIRE'} onClick={() => act(c, 'activate')} title={c.status === 'EN_ATTENTE_PARTENAIRE' ? 'Le partenaire n’a pas encore rejoint' : ''} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 disabled:opacity-40">Activer 30 jours</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
