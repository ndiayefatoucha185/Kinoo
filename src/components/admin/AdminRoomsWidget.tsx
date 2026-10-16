import React, { useState } from 'react';
import { Room, Participation, RoomStatus } from '../../types/kinoo';
import { UserPlanBadge } from '../UserPlanBadge';
import { cleanUserPseudo } from '../../services/storage';
import {
  Radio,
  Search,
  Filter,
  Users,
  Film,
  Lock,
  Unlock,
  AlertTriangle,
  StopCircle,
  Clock,
  Eye,
  X,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface AdminRoomsWidgetProps {
  rooms: Room[];
  participations: Participation[];
  onForceCloseRoom: (roomId: string, reason: string) => void;
  prefillSearch?: string;
}

export const AdminRoomsWidget: React.FC<AdminRoomsWidgetProps> = ({
  rooms = [],
  participations = [],
  onForceCloseRoom,
  prefillSearch = '',
}) => {
  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const safeParticipations = Array.isArray(participations) ? participations : [];

  const [searchTerm, setSearchTerm] = useState(prefillSearch);
  const [statusFilter, setStatusFilter] = useState<'ALL' | RoomStatus>('ALL');
  const [selectedRoomToInspect, setSelectedRoomToInspect] = useState<Room | null>(null);
  const [roomToClose, setRoomToClose] = useState<Room | null>(null);
  const [closeReason, setCloseReason] = useState('Violation des règles de diffusion ou fin de séance administrative');

  const filteredRooms = safeRooms.filter((r) => {
    if (!r) return false;
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (r.nom || '').toLowerCase().includes(q) ||
      (r.codePublic || '').toLowerCase().includes(q) ||
      (r.hotePseudo || '').toLowerCase().includes(q) ||
      (r.sourceContenu?.titre || '').toLowerCase().includes(q);

    const matchesStatus = statusFilter === 'ALL' || r.statut === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getRoomParticipants = (roomId: string) => {
    return safeParticipations.filter((p) => p && p.salleId === roomId);
  };

  const handleConfirmClose = () => {
    if (!roomToClose) return;
    onForceCloseRoom(roomToClose.id, closeReason);
    setRoomToClose(null);
    if (selectedRoomToInspect?.id === roomToClose.id) {
      setSelectedRoomToInspect(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="p-4 rounded-3xl bg-[#111219] border border-[#1E202B] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrer par nom de salle, code, hôte..."
            className="w-full bg-[#161722] border border-[#242636] rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <span>Statut :</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-[#161722] border border-[#242636] text-xs text-white rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#EC4899]"
          >
            <option value="ALL">Toutes les séances ({safeRooms.length})</option>
            <option value="EN_COURS">En direct ({safeRooms.filter((r) => r && r.statut === 'EN_COURS').length})</option>
            <option value="TERMINEE">Clôturées ({safeRooms.filter((r) => r && r.statut === 'TERMINEE').length})</option>
          </select>
        </div>
      </div>

      {/* Rooms Table / Cards */}
      <div className="rounded-3xl bg-[#111219] border border-[#1E202B] overflow-hidden">
        <div className="p-4 border-b border-[#1C1E2A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h3 className="text-sm font-bold text-white">Salles & Séances synchronisées</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#1D1F2C] text-gray-300 font-mono">
              {filteredRooms.length}
            </span>
          </div>
          <span className="text-xs text-gray-500">
            Surveillance en temps réel des flux et permissions
          </span>
        </div>

        {filteredRooms.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-xs space-y-1">
            <p>Aucune salle ne correspond aux critères.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151622] text-gray-400 font-semibold uppercase tracking-wider text-[10px] border-b border-[#202230]">
                <tr>
                  <th className="px-4 py-3">Salle & Code</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Hôte</th>
                  <th className="px-4 py-3">Média / Source</th>
                  <th className="px-4 py-3">Participants</th>
                  <th className="px-4 py-3">Durée</th>
                  <th className="px-4 py-3">Verrou</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1B1D28]">
                {filteredRooms.map((room) => {
                  const isLive = room.statut === 'EN_COURS';
                  const roomParticipants = getRoomParticipants(room.id);
                  const participantCount = roomParticipants.length > 0 ? roomParticipants.length : 1;

                  return (
                    <tr key={room.id} className="hover:bg-[#161724] transition-colors">
                      {/* Name & Code */}
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <span className="font-bold text-white block truncate max-w-xs">
                            {room.nom}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#202230] text-amber-300">
                              {room.codePublic}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              Créée : {new Date(room.dateCreation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>En direct</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1F2130] text-gray-400">
                            Terminée
                          </span>
                        )}
                      </td>

                      {/* Host */}
                      <td className="px-4 py-3 text-white font-medium">
                        {cleanUserPseudo(room.hotePseudo)}
                      </td>

                      {/* Media Source */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 max-w-xs">
                          <Film className="w-3.5 h-3.5 text-[#EC4899] shrink-0" />
                          <span className="text-gray-300 truncate">
                            {room.sourceContenu?.titre || 'Flux personnalisé'}
                          </span>
                        </div>
                      </td>

                      {/* Participants */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-gray-300">
                          <Users className="w-3.5 h-3.5 text-purple-400" />
                          <span>
                            {participantCount} / {room.maxParticipants}
                          </span>
                        </div>
                      </td>

                      {/* Durée de la séance */}
                      <td className="px-4 py-3 text-gray-300">
                        {(() => {
                          const start = new Date(room.dateCreation).getTime();
                          const end = room.dateFinEffective ? new Date(room.dateFinEffective).getTime() : Date.now();
                          const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
                          const hours = Math.floor(diffMinutes / 60);
                          const mins = diffMinutes % 60;
                          const formatted = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
                          return (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <Clock className="w-3.5 h-3.5 text-gray-400" />
                              <span className={isLive ? 'text-emerald-400 font-medium' : 'text-gray-400'}>
                                {formatted} {isLive ? '(en direct)' : ''}
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Lock / Privacy */}
                      <td className="px-4 py-3">
                        {room.estPrivee ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                            <Lock className="w-3 h-3" /> Privée
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                            <Unlock className="w-3 h-3" /> Publique
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedRoomToInspect(room)}
                            title="Inspecter la salle"
                            className="p-1.5 rounded-lg bg-[#1B1D2B] hover:bg-[#25283B] text-gray-300 hover:text-white transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {isLive && (
                            <button
                              type="button"
                              onClick={() => setRoomToClose(room)}
                              title="Fermeture forcée administrative"
                              className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-semibold transition-colors flex items-center gap-1 border border-rose-500/30"
                            >
                              <StopCircle className="w-3 h-3" />
                              <span>Fermer</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* INSPECT ROOM MODAL */}
      {selectedRoomToInspect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-[#13141E] border border-[#232536] rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232536] pb-3">
              <div className="flex items-center gap-2.5">
                <Radio className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {selectedRoomToInspect.nom}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Code d’accès : <strong className="text-amber-300 font-mono">{selectedRoomToInspect.codePublic}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoomToInspect(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-1">
                <span className="text-gray-400 text-[10px]">Hôte de séance</span>
                <p className="font-bold text-white">{selectedRoomToInspect.hotePseudo}</p>
              </div>
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-1">
                <span className="text-gray-400 text-[10px]">Statut du flux</span>
                <p className={`font-bold ${selectedRoomToInspect.statut === 'EN_COURS' ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {selectedRoomToInspect.statut === 'EN_COURS' ? 'En direct synchronisé' : 'Session terminée'}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-1">
                <span className="text-gray-400 text-[10px]">Source vidéo</span>
                <p className="font-medium text-[#EC4899] truncate">
                  {selectedRoomToInspect.sourceContenu?.titre}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-1">
                <span className="text-gray-400 text-[10px]">Contrôle chat & réactions</span>
                <p className="font-medium text-white">
                  Chat : {selectedRoomToInspect.chatActif ? 'Actif' : 'Désactivé'} • Réactions : {selectedRoomToInspect.reactionsActives ? 'Actives' : 'Désactivées'}
                </p>
              </div>
            </div>

            {/* Participants in room */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-300 flex items-center justify-between">
                <span>Participants connectés</span>
                <span className="text-[10px] text-purple-400 font-mono">
                  {getRoomParticipants(selectedRoomToInspect.id).length || 1} présent(s)
                </span>
              </h4>
              <div className="p-3 rounded-2xl bg-[#181926] border border-[#25273A] space-y-2 max-h-40 overflow-y-auto text-xs">
                <div className="flex items-center justify-between text-gray-300">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-semibold text-white">{selectedRoomToInspect.hotePseudo}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                    Hôte
                  </span>
                </div>
                {getRoomParticipants(selectedRoomToInspect.id).map((p) => {
                  if (p.pseudo === selectedRoomToInspect.hotePseudo) return null;
                  return (
                    <div key={p.id} className="flex items-center justify-between text-gray-300">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="font-semibold">{cleanUserPseudo(p.pseudo)}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                        {p.role}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions in inspection modal */}
            <div className="flex items-center justify-between pt-2 border-t border-[#232536]">
              {selectedRoomToInspect.statut === 'EN_COURS' ? (
                <button
                  type="button"
                  onClick={() => {
                    setRoomToClose(selectedRoomToInspect);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition-colors"
                >
                  Interrompre la séance
                </button>
              ) : (
                <span className="text-xs text-gray-500">Séance déjà fermée</span>
              )}

              <button
                type="button"
                onClick={() => setSelectedRoomToInspect(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1F2132] text-white hover:bg-[#282B40]"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM FORCE CLOSE MODAL */}
      {roomToClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#13141E] border border-rose-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#232536] pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-white text-sm">Fermeture forcée de la salle</h3>
              </div>
              <button
                type="button"
                onClick={() => setRoomToClose(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-300">
              Vous vous apprêtez à interrompre définitivement la séance{' '}
              <strong className="text-white">« {roomToClose.nom} »</strong> (Code: {roomToClose.codePublic}).
              Tous les participants seront immédiatement déconnectés.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-400">
                Motif d’interruption (enregistré au journal d’audit) :
              </label>
              <textarea
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                rows={3}
                className="w-full bg-[#181A26] border border-[#2B2E40] rounded-xl p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRoomToClose(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1C1E2A] text-gray-300 hover:text-white"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
              >
                Fermer la salle maintenant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
