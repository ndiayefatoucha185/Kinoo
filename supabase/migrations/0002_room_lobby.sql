-- Salle d'attente : nombre de personnes attendues, démarrage automatique, heure de démarrage
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS participants_attendus integer;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS demarrage_auto boolean NOT NULL DEFAULT true;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS demarree_le timestamptz;
UPDATE rooms SET demarree_le = date_creation WHERE demarree_le IS NULL AND participants_attendus IS NULL;
