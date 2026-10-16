with open('server/routes.ts', 'r') as f:
    text = f.read()

# 1. Update GET /rooms/:idOrCode
idx_get_start = text.find("apiRouter.get('/rooms/:idOrCode'")
idx_get_end = text.find("// Créer un salon (Application stricte des quotas", idx_get_start)
if idx_get_start != -1 and idx_get_end != -1:
    new_get = """apiRouter.get('/rooms/:idOrCode', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const raw = (req.params.idOrCode || '').trim();
    if (!raw) {
      return res.status(400).json({ error: 'Code ou identifiant de salon requis.' });
    }
    const upper = raw.toUpperCase();
    const stripped = upper.replace(/^KN-/, '');

    const result = await db
      .select()
      .from(rooms)
      .where(
        or(
          eq(rooms.id, raw),
          eq(rooms.id, raw.toLowerCase()),
          eq(rooms.code, upper),
          eq(rooms.code, stripped),
          eq(rooms.code, `KN-${stripped}`)
        )
      )
      .limit(1);

    const room = result[0];
    if (!room || room.statut === 'TERMINEE') {
      console.warn(`[RoomAccess] 🚫 Refus: Salle introuvable ou séance clôturée (code: "${raw.substring(0, 10)}")`);
      return res.status(404).json({ error: "Cette salle n'existe pas ou la séance est terminée" });
    }

    if (room.estVerrouillee) {
      console.warn(`[RoomAccess] 🔒 Refus: Salle verrouillée par l'hôte (roomId: ${room.id})`);
      return res.status(423).json({ error: "Salle verrouillée par l'hôte", isLocked: true });
    }

    if (room.estPrivee && room.codeAcces) {
      const providedPass = (req.query.password as string) || (req.headers['x-room-password'] as string);
      const isHost = req.user && req.user.id === room.hoteId;
      if (!isHost && (!providedPass || providedPass !== room.codeAcces)) {
        console.warn(`[RoomAccess] 🔑 Refus: Mot de passe de salle requis (roomId: ${room.id})`);
        return res.status(403).json({
          error: "Mot de passe de salle requis",
          requiresPassword: true,
          roomSummary: {
            id: room.id,
            titre: room.titre,
            hotePseudo: room.hotePseudo,
            estPrivee: true,
          },
        });
      }
    }

    const parts = await db.select().from(participations).where(eq(participations.roomId, room.id));
    res.json({ room, participations: parts });
  } catch (error) {
    console.error('[API] Erreur récupération salon:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du salon.' });
  }
});

"""
    text = text[:idx_get_start] + new_get + text[idx_get_end:]
    print("GET /rooms/:idOrCode successfully replaced!")
else:
    print("Could not find GET /rooms/:idOrCode markers", idx_get_start, idx_get_end)

# 2. Update quota check in POST /rooms
idx_quota_start = text.find("// Vérification du quota mensuel de séances créées par l'hôte selon son forfait")
idx_quota_end = text.find("const { titre, estPrivee, codeAcces, sourceContenu } = req.body;", idx_quota_start)
if idx_quota_start != -1 and idx_quota_end != -1:
    new_quota = """// Vérification inaltérable du quota mensuel de séances créées par l'hôte selon son forfait
    if (Number.isFinite(planConfig.maxMonthlyRooms)) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const creationsThisMonth = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(monthlyRoomCreations)
        .where(
          and(
            eq(monthlyRoomCreations.userId, user.id),
            gte(monthlyRoomCreations.creeLe, startOfMonth)
          )
        );

      const currentCount = creationsThisMonth[0]?.count || 0;
      if (currentCount >= planConfig.maxMonthlyRooms) {
        return res.status(403).json({
          error: `Vous avez atteint votre quota mensuel de ${planConfig.maxMonthlyRooms} séances pour votre formule ${planConfig.name}. Passez à la formule Standard (25 séances/mois) ou Premium (illimité) pour continuer à créer des séances.`,
          code: 'QUOTA_EXCEEDED',
          quota: planConfig.maxMonthlyRooms,
          used: currentCount,
        });
      }
    }

    """
    text = text[:idx_quota_start] + new_quota + text[idx_quota_end:]
    print("Quota check in POST /rooms successfully updated to monthlyRoomCreations!")
else:
    print("Could not find quota markers", idx_quota_start, idx_quota_end)

# 3. Update POST /rooms/:id/join
idx_join_start = text.find("apiRouter.post('/rooms/:id/join'")
idx_join_check = text.find("const result = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);", idx_join_start)
idx_join_part_start = text.find("// Check participant count", idx_join_check)
if idx_join_start != -1 and idx_join_check != -1 and idx_join_part_start != -1:
    new_join_head = """apiRouter.post('/rooms/:id/join', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const raw = (req.params.id || '').trim();
    const upper = raw.toUpperCase();
    const stripped = upper.replace(/^KN-/, '');
    const { codeAcces, guestPseudo, guestId, ageCertifie } = req.body;

    // Protection des mineurs : les invités non connectés doivent obligatoirement certifier avoir 16 ans ou plus
    if (!req.user && ageCertifie !== true) {
      return res.status(403).json({
        error: "Certification d'âge requise : vous devez attester sur l'honneur avoir au moins 16 ans révolus pour accéder à la séance.",
      });
    }

    const result = await db
      .select()
      .from(rooms)
      .where(
        or(
          eq(rooms.id, raw),
          eq(rooms.id, raw.toLowerCase()),
          eq(rooms.code, upper),
          eq(rooms.code, stripped),
          eq(rooms.code, `KN-${stripped}`)
        )
      )
      .limit(1);

    const room = result[0];
    if (!room || room.statut === 'TERMINEE') {
      console.warn(`[RoomAccess] 🚫 Join refusé: Salle introuvable ou clôturée ("${raw.substring(0, 10)}")`);
      return res.status(404).json({ error: "Cette salle n'existe pas ou la séance est terminée" });
    }

    if (room.estVerrouillee) {
      console.warn(`[RoomAccess] 🔒 Join refusé: Salle verrouillée par l'hôte (${room.id})`);
      return res.status(423).json({ error: "Salle verrouillée par l'hôte" });
    }

    if (room.estPrivee && room.codeAcces && room.codeAcces !== (codeAcces || '').trim()) {
      console.warn(`[RoomAccess] 🔑 Join refusé: Mot de passe incorrect (${room.id})`);
      return res.status(403).json({ error: "Mot de passe de salle requis" });
    }

    """
    text = text[:idx_join_start] + new_join_head + text[idx_join_part_start:]
    print("POST /rooms/:id/join successfully updated!")
else:
    print("Could not find join markers", idx_join_start, idx_join_check, idx_join_part_start)

# 4. Add DELETE /rooms/:id
idx_after_join = text.find("// Messages d'un salon avec contrôle strict d'accès")
if idx_after_join != -1:
    delete_endpoint = """// Clôturer / Supprimer un salon par son hôte (sans supprimer l'empreinte de création mensuelle)
apiRouter.delete('/rooms/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const raw = (req.params.id || '').trim();
    const user = req.user!;
    const roomList = await db.select().from(rooms).where(eq(rooms.id, raw)).limit(1);
    if (!roomList.length) {
      return res.status(404).json({ error: 'Salon introuvable.' });
    }
    const r = roomList[0];
    if (r.hoteId !== user.id && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Action non autorisée : seul l’hôte peut clôturer la salle.' });
    }
    await db.update(rooms).set({ statut: 'TERMINEE' }).where(eq(rooms.id, raw));
    console.log(`[ROOM] Salle ${raw} clôturée par hôte ${user.id}`);
    res.json({ success: true, message: 'Séance clôturée avec succès.' });
  } catch (error) {
    console.error('[API] Erreur clôture salon:', error);
    res.status(500).json({ error: 'Erreur lors de la clôture du salon.' });
  }
});

"""
    text = text[:idx_after_join] + delete_endpoint + text[idx_after_join:]
    print("DELETE /rooms/:id endpoint added!")

with open('server/routes.ts', 'w') as f:
    f.write(text)
print("Finished writing server/routes.ts")
