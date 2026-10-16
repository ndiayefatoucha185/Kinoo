with open('src/views/JoinRoomModal.tsx', 'r') as f:
    text = f.read()

# Ensure ApiClient is imported
if 'import { ApiClient }' not in text:
    text = text.replace("import { StorageService } from '../services/storage';", "import { StorageService } from '../services/storage';\nimport { ApiClient } from '../services/api';")

# Replace handleSearchRoom and handleConfirmJoin and initialCode effect
idx_eff_start = text.find("React.useEffect(() => {")
idx_modal_return = text.find("return (", idx_eff_start)

new_logic = """React.useEffect(() => {
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

  """

text = text[:idx_eff_start] + new_logic + text[idx_modal_return:]
with open('src/views/JoinRoomModal.tsx', 'w') as f:
    f.write(text)

print("JoinRoomModal.tsx successfully updated!")
