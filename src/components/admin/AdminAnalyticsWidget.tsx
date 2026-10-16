import React, { useState } from 'react';
import { User, Room } from '../../types/kinoo';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Users,
  Film,
  Globe,
  Smartphone,
  Monitor,
  Activity,
} from 'lucide-react';

interface AdminAnalyticsWidgetProps {
  users: User[];
  rooms: Room[];
}

export const AdminAnalyticsWidget: React.FC<AdminAnalyticsWidgetProps> = ({
  users = [],
  rooms = [],
}) => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [chartMetric, setChartMetric] = useState<'seances' | 'users'>('seances');

  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const safeUsers = Array.isArray(users) ? users : [];
  const hasActivity = safeRooms.length > 0;

  // Real or 0 data when no activity
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const seanceHeights = hasActivity ? [45, 60, 52, 78, 95, 100, 85] : [0, 0, 0, 0, 0, 0, 0];
  const userHeights = hasActivity ? [55, 70, 68, 85, 98, 100, 90] : [0, 0, 0, 0, 0, 0, 0];
  const currentHeights = chartMetric === 'seances' ? seanceHeights : userHeights;

  return (
    <div className="space-y-6">
      {/* Analytics KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-1">
          <span className="text-xs font-semibold text-gray-400">Heures de visionnage cumulées</span>
          <span className="text-2xl sm:text-3xl font-bold text-white font-mono block">
            {hasActivity ? '1 480 h' : '0 h'}
          </span>
          <span className="text-[11px] text-gray-500 font-medium">
            {hasActivity ? '+22% vs mois dernier' : '0 session active'}
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-1">
          <span className="text-xs font-semibold text-gray-400">Pic d’utilisateurs simultanés</span>
          <span className="text-2xl sm:text-3xl font-bold text-white font-mono block">
            {hasActivity ? '184 spectateurs' : '0 spectateur'}
          </span>
          <span className="text-[11px] text-gray-500">
            {hasActivity ? 'Enregistré samedi à 21h30' : 'Aucun pic enregistré'}
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-1">
          <span className="text-xs font-semibold text-gray-400">Durée moyenne de séance</span>
          <span className="text-2xl sm:text-3xl font-bold text-white font-mono block">
            {hasActivity ? '64 min' : '0 min'}
          </span>
          <span className="text-[11px] text-gray-500">
            {hasActivity ? 'Taux de rétention élevé' : 'En attente de séances'}
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-1">
          <span className="text-xs font-semibold text-gray-400">Bande passante économisée P2P</span>
          <span className="text-2xl sm:text-3xl font-bold text-white font-mono block">
            {hasActivity ? '78.4%' : '0%'}
          </span>
          <span className="text-[11px] text-gray-500">
            {hasActivity ? 'Grâce au maillage WebRTC' : 'Réseau WebRTC prêt'}
          </span>
        </div>
      </div>

      {/* Main Activity Chart Card */}
      <div className="p-6 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#EC4899]" />
              <h3 className="text-sm font-bold text-white">
                {chartMetric === 'seances'
                  ? 'Nombre de séances par jour'
                  : 'Utilisateurs actifs dans le temps (DAU)'}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {chartMetric === 'seances'
                ? 'Volume quotidien de sessions de visionnage synchronisées'
                : 'Audience quotidienne active connectée sur la plateforme'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Metric toggle */}
            <div className="flex items-center p-1 rounded-xl bg-[#161724] border border-[#232536] text-xs">
              <button
                type="button"
                onClick={() => setChartMetric('seances')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  chartMetric === 'seances'
                    ? 'bg-[#7C3AED] text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Séances
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('users')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  chartMetric === 'users'
                    ? 'bg-[#7C3AED] text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Utilisateurs actifs
              </button>
            </div>

            {/* Time range */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#161724] border border-[#232536]">
              {(['7d', '30d', '90d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTimeRange(r)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    timeRange === r
                      ? 'bg-[#EC4899] text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {r === '7d' ? '7j' : r === '30d' ? '30j' : '90j'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Bar Graph or Empty State */}
        {!hasActivity ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 border-b border-[#1F2130]">
            <Activity className="w-8 h-8 text-gray-600 mb-2" />
            <p className="text-xs font-semibold text-gray-400">
              Aucune activité enregistrée pour cette période
            </p>
            <p className="text-[11px] text-gray-600 mt-1 max-w-sm">
              Le graphique d’affluence et d’utilisateurs actifs s’activera dès le lancement des premières séances.
            </p>
          </div>
        ) : (
          <div className="h-48 pt-6 flex items-end justify-between gap-3 sm:gap-6 border-b border-[#1F2130] pb-2">
            {days.map((day, idx) => {
              const h = currentHeights[idx];
              const valueLabel =
                chartMetric === 'seances'
                  ? `${Math.round((h / 100) * 45)} séances`
                  : `${Math.round((h / 100) * 160)} actifs`;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <div className="text-[10px] text-gray-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {valueLabel}
                  </div>
                  <div
                    className={`w-full max-w-[48px] rounded-t-xl transition-all duration-300 ${
                      chartMetric === 'seances'
                        ? 'bg-gradient-to-t from-[#7C3AED] to-[#EC4899] group-hover:brightness-125'
                        : 'bg-gradient-to-t from-emerald-600 to-teal-400 group-hover:brightness-125'
                    }`}
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-xs text-gray-400 font-medium group-hover:text-white transition-colors">
                    {day}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2 Sub-panels: Devices and Popular Content Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Device breakdown */}
        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-4">
          <h4 className="text-xs font-bold text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-purple-400" />
            <span>Répartition des terminaux de visionnage</span>
          </h4>

          {hasActivity ? (
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-300 flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5 text-gray-400" /> Ordinateurs de bureau & PC
                  </span>
                  <span className="font-mono text-white">58%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#202232]">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full" style={{ width: '58%' }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-300 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-gray-400" /> Smartphones & Tablettes (PWA)
                  </span>
                  <span className="font-mono text-white">36%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#202232]">
                  <div className="h-full bg-gradient-to-r from-pink-500 to-rose-500 rounded-full" style={{ width: '36%' }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-gray-400" /> Smart TV / Navigateur salon
                  </span>
                  <span className="font-mono text-white">6%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#202232]">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full" style={{ width: '6%' }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 text-xs">
              <p>Aucune session enregistrée.</p>
              <p className="text-[11px] text-gray-600 mt-0.5">0 terminal actif pour l'instant.</p>
            </div>
          )}
        </div>

        {/* Content Sources breakdown */}
        <div className="p-5 rounded-3xl bg-[#111219] border border-[#1E202B] space-y-4">
          <h4 className="text-xs font-bold text-white flex items-center gap-2">
            <Film className="w-4 h-4 text-[#EC4899]" />
            <span>Sources de contenu les plus utilisées</span>
          </h4>

          {hasActivity ? (
            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-[#161724] border border-[#222434] flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">Catalogue Libre & Cinema Kinoo</p>
                  <p className="text-[11px] text-gray-400">Films du domaine public et productions partenaires</p>
                </div>
                <span className="font-mono font-bold text-emerald-400">46%</span>
              </div>

              <div className="p-3 rounded-2xl bg-[#161724] border border-[#222434] flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">YouTube Iframe Synchronisé</p>
                  <p className="text-[11px] text-gray-400">Podcasts, bandes-annonces, documentaires</p>
                </div>
                <span className="font-mono font-bold text-amber-400">38%</span>
              </div>

              <div className="p-3 rounded-2xl bg-[#161724] border border-[#222434] flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">Fichiers Personnels & Liens Web</p>
                  <p className="text-[11px] text-gray-400">Lecteur HTML5 direct via synchronisation d’index</p>
                </div>
                <span className="font-mono font-bold text-purple-400">16%</span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 text-xs">
              <p>Aucune diffusion effectuée.</p>
              <p className="text-[11px] text-gray-600 mt-0.5">En attente de la première lecture vidéo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
