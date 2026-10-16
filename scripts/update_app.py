with open('src/App.tsx', 'r') as f:
    text = f.read()

idx_inv = text.find("if (inviteParam || roomParam) {")
idx_inv_end = text.find("    }\n  }, []);", idx_inv)

new_inv_block = """if (inviteParam || roomParam) {
      const codeOrToken = (inviteParam || roomParam || '').trim();
      if (codeOrToken) {
        ApiClient.getRoom(codeOrToken)
          .then((res) => {
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
              StorageService.saveRoom(mappedRoom);
              if (currentUser) {
                setActiveRoomId(mappedRoom.id);
                setCurrentView('watchparty');
                addToast(`Salle détectée : ${mappedRoom.nom}`, 'success');
              } else {
                setJoinRoomInitialCode(mappedRoom.codePublic);
                setIsJoinRoomOpen(true);
                addToast(`Salle trouvée : ${mappedRoom.nom}. Validation requise pour entrer.`, 'info');
              }
            } else {
              setJoinRoomInitialCode(codeOrToken);
              setIsJoinRoomOpen(true);
            }
          })
          .catch(() => {
            const found = StorageService.getRoomByCodeOrToken(codeOrToken);
            if (found) {
              if (currentUser) {
                setActiveRoomId(found.room.id);
                setCurrentView('watchparty');
                addToast(`Salle détectée : ${found.room.nom}`, 'success');
              } else {
                setJoinRoomInitialCode(codeOrToken);
                setIsJoinRoomOpen(true);
                addToast(`Salle trouvée : ${found.room.nom}. Validation requise pour entrer.`, 'info');
              }
            } else {
              setJoinRoomInitialCode(codeOrToken);
              setIsJoinRoomOpen(true);
            }
          });
      }
    }"""

text = text[:idx_inv] + new_inv_block + text[idx_inv_end:]
with open('src/App.tsx', 'w') as f:
    f.write(text)

print("App.tsx successfully updated!")
