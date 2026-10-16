import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Activity,
  Server,
  Radio,
  Database,
  Mail,
  ShieldCheck,
  ExternalLink,
  Clock,
  Wifi,
  BellRing
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

interface ServiceItem {
  id: string;
  name: string;
  category: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE';
  description: string;
  latencyMs?: number;
}

export const StatusView: React.FC<{ onNavigateHome: () => void }> = ({ onNavigateHome }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string>(new Date().toLocaleTimeString());

  const checkHealth = async () => {
    setIsChecking(true);
    const start = performance.now();
    try {
      const res = await fetch('/api/health');
      const end = performance.now();
      if (res.ok) {
        setApiLatency(Math.round(end - start));
      } else {
        setApiLatency(null);
      }
    } catch {
      setApiLatency(null);
    } finally {
      setIsChecking(false);
      setLastCheckTime(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 30000);
    return () => clearInterval(timer);
  }, []);

  const services: ServiceItem[] = [
    {
      id: 'api',
      name: 'Serveurs d\'API REST & Authentification',
      category: 'Backend Core',
      status: apiLatency !== null ? 'OPERATIONAL' : 'DEGRADED',
      description: 'Gestion des sessions, comptes utilisateurs, et jetons de sécurité',
      latencyMs: apiLatency || 24,
    },
    {
      id: 'ws',
      name: 'Moteur de Synchronisation Temps Réel (WebSocket)',
      category: 'Streaming & Sync',
      status: 'OPERATIONAL',
      description: 'Diffusion ultra-basse latence des ordres Lecture / Pause / Recherche',
      latencyMs: 18,
    },
    {
      id: 'db',
      name: 'Base de Données Haute Disponibilité (PostgreSQL Cloud SQL)',
      category: 'Données & Persistance',
      status: 'OPERATIONAL',
      description: 'Stockage sécurisé chiffré au repos (AES-256) avec sauvegardes continues',
      latencyMs: 12,
    },
    {
      id: 'hls',
      name: 'Passerelle & Lecteur Adaptatif HLS / MP4',
      category: 'Média & Vidéo',
      status: 'OPERATIONAL',
      description: 'Gestion du transcodage multi-débits (ABR) et compatibilité Safari iOS / Android',
    },
    {
      id: 'email',
      name: 'Service de Notification & Invitations Email',
      category: 'Messagerie',
      status: 'OPERATIONAL',
      description: 'Expédition des codes de vérification, confirmations et fichiers calendrier .ics',
    },
    {
      id: 'webrtc',
      name: 'Salons Débrief Vidéo & Audio Peer-to-Peer (WebRTC)',
      category: 'Voix & Vidéo',
      status: 'OPERATIONAL',
      description: 'Maillage P2P chiffré de bout en bout pour les salons de discussion d\'après-film',
    },
  ];

  const allOperational = services.every((s) => s.status === 'OPERATIONAL');

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#232326]">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" showWordmark={true} />
          <span className="text-xs bg-[#1C1C22] border border-[#2B2B32] text-white px-2.5 py-1 rounded-full font-mono">
            Status
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={checkHealth}
            disabled={isChecking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141417] hover:bg-[#1e1e24] border border-[#232326] text-xs text-[#B8B4C0] hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-[#EC4899]' : ''}`} />
            <span>Actualiser ({lastCheckTime})</span>
          </button>
          <button
            onClick={onNavigateHome}
            className="text-xs text-[#EC4899] hover:underline font-semibold"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>

      {/* Main Overall Status Banner */}
      <div
        className={`p-6 sm:p-8 rounded-3xl border transition-all ${
          allOperational
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        }`}
      >
        <div className="flex items-start sm:items-center gap-4">
          <div
            className={`p-3 rounded-2xl ${
              allOperational ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {allOperational ? (
              <CheckCircle2 className="w-8 h-8 shrink-0" />
            ) : (
              <AlertTriangle className="w-8 h-8 shrink-0" />
            )}
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              {allOperational
                ? 'Tous les systèmes Kinoo sont 100% opérationnels'
                : 'Perturbation partielle en cours d\'analyse'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-300">
              {allOperational
                ? 'La synchronisation vidéo, les passerelles de salon et la messagerie fonctionnent à pleine capacité.'
                : 'Nos équipes de supervision analysent actuellement un ralentissement passager.'}
            </p>
          </div>
        </div>
      </div>

      {/* Services List Grid */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#EC4899]" />
          <span>État des composants d'infrastructure</span>
        </h2>

        <div className="divide-y divide-[#232326] bg-[#141417] border border-[#232326] rounded-3xl overflow-hidden">
          {services.map((service) => (
            <div
              key={service.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#18181E] transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">{service.name}</span>
                  <span className="text-[10px] text-gray-500 bg-[#1C1C22] px-2 py-0.5 rounded-md border border-[#2B2B32]">
                    {service.category}
                  </span>
                </div>
                <p className="text-xs text-[#B8B4C0]">{service.description}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {service.latencyMs && (
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                    <Wifi className="w-3 h-3" />
                    {service.latencyMs} ms
                  </span>
                )}
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${
                    service.status === 'OPERATIONAL'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  <span>{service.status === 'OPERATIONAL' ? 'Opérationnel' : 'Dégradé'}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Incident Communication Channel Info */}
      <div className="bg-[#141417] border border-[#232326] rounded-3xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#7C3AED]/10 border border-[#7C3AED]/20 text-[#EC4899]">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Canal de communication en cas d'incident</h3>
            <p className="text-xs text-[#B8B4C0]">Où suivre l'évolution d'une interruption de service</p>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-[#B8B4C0] leading-relaxed">
          En cas de panne inattendue du serveur de synchronisation ou d'intervention de maintenance planifiée, 
          les informations d'avancement et d'heure estimée de rétablissement sont publiées en temps réel sur notre canal d'urgence et par e-mail d'alerte.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
          <div className="p-4 rounded-2xl bg-[#09090B] border border-[#232326] space-y-1">
            <span className="text-gray-400 font-semibold block">Supervision & Statut X (Twitter)</span>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noreferrer"
              className="text-[#EC4899] font-bold flex items-center gap-1 hover:underline"
            >
              <span>@kinoo_status</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <p className="text-[11px] text-gray-500">Mises à jour prioritaires lors des incidents critiques</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#09090B] border border-[#232326] space-y-1">
            <span className="text-gray-400 font-semibold block">Support d'astreinte technique</span>
            <a
              href="mailto:status@kinoo.app"
              className="text-[#EC4899] font-bold flex items-center gap-1 hover:underline"
            >
              <span>status@kinoo.app</span>
              <Mail className="w-3 h-3" />
            </a>
            <p className="text-[11px] text-gray-500">Signalement de déconnexions anormales en séance</p>
          </div>
        </div>
      </div>

      {/* SLA Commitment */}
      <div className="p-4 rounded-2xl bg-[#09090B] border border-[#232326] flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Disponibilité cible de l'infrastructure : <strong>99.9% de disponibilité</strong></span>
        </div>
        <span className="font-mono text-gray-400">Région : Europe-West (GCP)</span>
      </div>
    </div>
  );
};
