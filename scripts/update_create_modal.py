with open('src/views/CreateRoomModal.tsx', 'r') as f:
    text = f.read()

idx_sub = text.find('const handleSubmit =')
idx_sub_end = text.find('return (', idx_sub)

new_submit = """const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) return;

    if (sourceType === 'FICHIER_LOCAL' && isGratuit) {
      alert("L'importation de fichiers vidéo locaux est réservée aux formules Standard et Premium. En formule Gratuite, veuillez utiliser un lien URL ou YouTube.");
      return;
    }

    if (sourceType === 'URL_WEB' && !urlInput.trim()) {
      alert('Veuillez renseigner un lien URL ou une vidéo YouTube.');
      return;
    }

    setIsSubmitting(true);
    try {
      const contentSource = resolveContentSource();

      // Enregistrement officiel de la séance dans la base de données PostgreSQL
      const serverRoom = await ApiClient.createRoom({
        titre: nom.trim(),
        estPrivee: true,
        codeAcces: undefined,
        sourceContenu: contentSource,
      });

      const assignedCode = (serverRoom as any).code || `KN-${Math.floor(1000 + Math.random() * 9000)}`;

      const newRoom: Room = {
        id: serverRoom.id,
        codePublic: assignedCode,
        nom: (serverRoom as any).titre || nom.trim(),
        statut: (serverRoom as any).statut || 'EN_COURS',
        hoteId: currentUser.id,
        hotePseudo: currentUser.pseudo,
        sourceContenuId: contentSource.id,
        sourceContenu: contentSource,
        estPrivee: true,
        estVerrouillee,
        chatActif,
        reactionsActives,
        maxParticipants: (serverRoom as any).maxParticipants || maxAllowedParticipants,
        dateCreation: (serverRoom as any).dateCreation || new Date().toISOString(),
      };

      const newInvitation: Invitation = {
        id: 'inv-' + Math.random().toString(36).substring(2, 9),
        salleId: newRoom.id,
        tokenAleatoire: assignedCode,
        codeCourt: assignedCode,
        dateExpiration: new Date(Date.now() + 86400000 * 2).toISOString(),
        estRevocable: true,
        estRevoquee: false,
        nbUtilisations: 0,
      };

      const hostParticipation: Participation = {
        id: 'part-' + Math.random().toString(36).substring(2, 9),
        salleId: newRoom.id,
        utilisateurId: currentUser.id,
        pseudo: currentUser.pseudo,
        role: 'HOTE',
        dateRejoint: new Date().toISOString(),
        estActif: true,
        estBanni: false,
      };

      StorageService.saveRoom(newRoom);
      StorageService.saveInvitation(newInvitation);
      StorageService.saveParticipation(hostParticipation);

      setIsSubmitting(false);
      onRoomCreated(newRoom);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      alert(err.message || 'Erreur lors de la création de la séance sur le serveur.');
    }
  };

  """

text = text[:idx_sub] + new_submit + text[idx_sub_end:]
with open('src/views/CreateRoomModal.tsx', 'w') as f:
    f.write(text)

print("CreateRoomModal.tsx successfully updated!")
