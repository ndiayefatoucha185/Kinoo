import React, { useState } from 'react';
import { Room, User, Participation } from '../types/kinoo';
import { StorageService } from '../services/storage';
import { ApiClient } from '../services/api';
import { X, Compass, Film, Users, Lock, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onJoinRoomSuccess: (roomId: string) => void;
  onRequireAuth: () => void;
  initialCode?: string;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onJoinRoomSuccess,
  onRequireAuth,
  initialCode,
}) => {
  const [codeInput, setCodeInput] = useState(initialCode || '');
  const [guestPseudo, setGuestPseudo] = useState('');
  const [guestAgeCertifie, setGuestAgeCertifie] = useState(false);
  const [guestTermsAccepted, setGuestTermsAccepted] = useState(false);
  const [previewRoom, setPreviewRoom] = useState<Room | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    if (initialCode && isOpen) {
      const target = initialCode.trim();
      setCodeInput(target);
      // Requête immédiate auprès de la base de données PostgreSQL
      ApiClient.getRoom(target)
        .then((res) => {
          if (!isMounted) return;
          if (res && res.room) {
            const r = res.room;
            const mappedRoom: Room = {
              id: r.id,
              codePublic: (r as any).code || r.id,
              nom: (r as any).titre || (r as any).nom || 'Watch Party',
              statut: (r as any).statut || 'EN_COURS',
              hoteId: r.hoteId,
              hotePseudo: r.hotePseudo,
              sourceContenuId: r.sourceContenu?.id || 'src-default',
              sourceContenu: r.sourceContenu || {
                id: 'src-default',
                titre: 'Vidéo',
                typeSource: 'URL_WEB',
                fournisseur: 'Web',
              },
              estPrivee: r.estPrivee,
              estVerrouillee: r.estVerrouillee,
              chatActif: true,
              reactionsActives: true,
              maxParticipants: r.maxParticipants || 10,
              dateCreation: (r as any).dateCreation || new Date().toISOString(),
            };
            if (mappedRoom.statut !== 'TERMINEE' && !mappedRoom.estVerrouillee) {
              StorageService.saveRoom(mappedRoom);
              setPreviewRoom(mappedRoom);
            }
          }
        })
        .catch(() => {
          // Fallback local
          const localRes = StorageService.getRoomByCodeOrToken(target);
          if (localRes && localRes.room.statut !== 'TERMINEE' && !localRes.room.estVerrouillee) {
            setPreviewRoom(localRes.room);
          }
        });
    }
    return () => { isMounted = false; };
  }, [initialCode, isOpen]);

  if (!isOpen) return null;

  const handleSearchRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setPreviewRoom(null);

    const target = codeInput.trim();
    if (!target) return;

    // 1. Recherche prioritaire dans la base de données PostgreSQL serveur
    try {
      const res = await ApiClient.getRoom(target);
      if (res && res.room) {
        const r = res.room;
        const mappedRoom: Room = {
          id: r.id,
          codePublic: (r as any).code || r.id,
          nom: (r as any).titre || (r as any).nom || 'Watch Party',
          statut: (r as any).statut || 'EN_COURS',
          hoteId: r.hoteId,
          hotePseudo: r.hotePseudo,
          sourceContenuId: r.sourceContenu?.id || 'src-default',
          sourceContenu: r.sourceContenu || {
            id: 'src-default',
            titre: 'Vidéo',
            typeSource: 'URL_WEB',
            fournisseur: 'Web',
          },
          estPrivee: r.estPrivee,
          estVerrouillee: r.estVerrouillee,
          chatActif: true,
          reactionsActives: true,
          maxParticipants: r.maxParticipants || 10,
          dateCreation: (r as any).dateCreation || new Date().toISOString(),
        };

        if (mappedRoom.statut === 'TERMINEE') {
          setErrorMessage("Cette salle n'existe pas ou la séance est terminée");
          return;
        }

        if (mappedRoom.estVerrouillee) {
          setErrorMessage("Salle verrouillée par l'hôte");
          return;
        }

        const currentParts = res.participations || [];
        if (currentParts.length >= mappedRoom.maxParticipants) {
          setErrorMessage(`Cette salle est complète (limite de ${mappedRoom.maxParticipants} participants atteinte).`);
          return;
        }

        StorageService.saveRoom(mappedRoom);
        setPreviewRoom(mappedRoom);
        return;
      }
    } catch (err: any) {
      if (err.message && err.message.includes('verrouillée')) {
        setErrorMessage("Salle verrouillée par l'hôte");
        return;
      }
      if (err.message && err.message.includes('Mot de passe')) {
        setErrorMessage("Mot de passe de salle requis");
        return;
      }
    }

    // 2. Recherche locale (fallback de secours)
    const localRes = StorageService.getRoomByCodeOrToken(target);
    if (localRes) {
      if (localRes.room.statut === 'TERMINEE') {
        setErrorMessage("Cette salle n'existe pas ou la séance est terminée");
        return;
      }
      if (localRes.room.estVerrouillee) {
        setErrorMessage("Salle verrouillée par l'hôte");
        return;
      }
      setPreviewRoom(localRes.room);
      return;
    }

    setErrorMessage("Cette salle n'existe pas ou la séance est terminée");
  };

  const handleConfirmJoin = async () => {
    if (!previewRoom) return;

    if (!currentUser) {
      const cleanPseudo = guestPseudo.trim();
      if (!cleanPseudo) {
        setErrorMessage('Veuillez renseigner un prénom ou pseudonyme pour entrer.');
        return;
      }
      if (!guestAgeCertifie) {
        setErrorMessage('Vous devez expressément certifier sur l’honneur avoir au moins 16 ans révolus.');
        return;
      }
      if (!guestTermsAccepted) {
        setErrorMessage('Vous devez accepter le règlement de respect mutuel et les conditions de la séance.');
        return;
      }

      sessionStorage.setItem('kinoo_guest_age_certified', 'true');
      sessionStorage.setItem('kinoo_guest_pseudo', cleanPseudo);
      sessionStorage.setItem(`kinoo_guest_verified_${previewRoom.id}`, 'true');
    }

    const pseudoToUse = currentUser ? currentUser.pseudo : guestPseudo.trim() || 'Invité-' + Math.floor(100 + Math.random() * 900);
    const userIdToUse = currentUser ? currentUser.id : 'guest-' + Math.random().toString(36).substring(2, 9);

    if (!currentUser) {
      sessionStorage.setItem('kinoo_guest_id', userIdToUse);
    }

    // Enregistrement participation serveur
    try {
      await ApiClient.joinRoom(previewRoom.id, {
        guestPseudo: pseudoToUse,
        guestId: userIdToUse,
        ageCertifie: true,
      });
    } catch (err: any) {
      console.warn('[JoinRoomModal] Notice join serveur:', err.message);
    }

    const participation: Participation = {
      id: 'part-' + Math.random().toString(36).substring(2, 9),
      salleId: previewRoom.id,
      utilisateurId: userIdToUse,
      pseudo: pseudoToUse,
      role: previewRoom.hoteId === userIdToUse ? 'HOTE' : 'PARTICIPANT',
      dateRejoint: new Date().toISOString(),
      estActif: true,
      estBanni: false,
    };

    StorageService.saveParticipation(participation);
    onJoinRoomSuccess(previewRoom.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#141417] border border-[#232326] rounded-2xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-5 right-5 p-1.5 text-gray-400 hover:text-white rounded-lg">
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-2xl bg-[#232326] border border-[#383840] text-[#3B82F6] flex items-center justify-center mx-auto">
            <Compass className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Rejoindre une salle</h2>
          <p className="text-xs text-[#B8B4C0]">Saisissez le code reçu (ex: KN-7824) ou votre token d’invitation.</p>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2.5 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!previewRoom ? (
          <form onSubmit={handleSearchRoom} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-white block">Code de la salle ou Token</label>
              <input
                type="text"
                required
                placeholder="Ex: KN-7824"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                className="w-full bg-[#09090B] border border-[#232326] rounded-xl px-3.5 py-3 text-center text-sm font-mono tracking-widest text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899] uppercase"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#7C3AED]/20 transition-all"
            >
              Rechercher la salle
            </button>
          </form>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Room Preview Card */}
            <div className="bg-[#09090B] border border-[#232326] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#EC4899] bg-[#141417] px-2 py-0.5 rounded border border-[#232326]">
                  {previewRoom.codePublic}
                </span>
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Salle Ouverte
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-white">{previewRoom.nom}</h3>
                <p className="text-gray-400 mt-0.5">Hôte de séance : <strong className="text-white">{previewRoom.hotePseudo}</strong></p>
              </div>

              <div className="p-2.5 bg-[#141417] rounded-lg border border-[#232326] flex items-center gap-3">
                <img
                  src={previewRoom.sourceContenu?.posterUrl}
                  alt={previewRoom.sourceContenu?.titre}
                  className="w-12 h-12 object-cover rounded-md shrink-0"
                />
                <div className="space-y-0.5 overflow-hidden">
                  <span className="font-semibold text-white block truncate">{previewRoom.sourceContenu?.titre}</span>
                  <span className="text-[10px] text-[#EC4899] block font-mono">{previewRoom.sourceContenu?.dureeFormat}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-gray-400 text-[11px] pt-1">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Max {previewRoom.maxParticipants} spectateurs
                </span>
                <span>Synchronisation active</span>
              </div>
            </div>

            {/* Guest identity & age verification if not logged in */}
            {!currentUser && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <label className="font-semibold text-white block text-xs">
                    Votre prénom ou pseudonyme pour la séance <span className="text-[#EC4899]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Thomas"
                    value={guestPseudo}
                    onChange={(e) => setGuestPseudo(e.target.value)}
                    className="w-full bg-[#09090B] border border-[#232326] rounded-xl px-3.5 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                  />
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer select-none bg-[#09090B] p-2.5 rounded-xl border border-[#232326] hover:border-[#383840] transition-colors">
                  <input
                    type="checkbox"
                    required
                    checked={guestAgeCertifie}
                    onChange={(e) => setGuestAgeCertifie(e.target.checked)}
                    className="mt-0.5 rounded border-[#232326] text-[#EC4899] focus:ring-0 shrink-0"
                  />
                  <span className="text-[11px] text-gray-200 font-medium leading-snug">
                    Je certifie sur l’honneur avoir <strong>16 ans ou plus</strong> (seuil légal d'accès aux salons interactifs).
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none px-1">
                  <input
                    type="checkbox"
                    required
                    checked={guestTermsAccepted}
                    onChange={(e) => setGuestTermsAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-[#232326] text-[#EC4899] focus:ring-0 shrink-0"
                  />
                  <span className="text-[11px] text-[#B8B4C0] leading-snug">
                    J'accepte les conditions de respect mutuel et le règlement de séance de KINOO.
                  </span>
                </label>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPreviewRoom(null)}
                className="w-1/3 py-2.5 rounded-xl font-semibold text-xs text-[#B8B4C0] bg-[#232326] hover:text-white transition-colors"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleConfirmJoin}
                disabled={!currentUser && (!guestPseudo.trim() || !guestAgeCertifie || !guestTermsAccepted)}
                className={`w-2/3 py-2.5 rounded-xl font-bold text-xs text-white transition-all flex items-center justify-center gap-1.5 ${
                  !currentUser && (!guestPseudo.trim() || !guestAgeCertifie || !guestTermsAccepted)
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#7C3AED]/20'
                }`}
              >
                <span>Entrer dans la salle</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
