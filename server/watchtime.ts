import { sql } from 'drizzle-orm';
import { rooms } from '../src/db/schema.js';

/**
 * Expression SQL à placer dans un UPDATE de `rooms` : ajoute au total le temps réellement passé en lecture
 * depuis le dernier démarrage (uniquement si la salle était en lecture), borné à 12 h par période.
 * Postgres évalue toutes les valeurs d'un UPDATE sur l'ancienne ligne : on peut donc changer l'état dans la même requête.
 */
export const accrueWatchTime = () =>
  sql`${rooms.lectureTotaleSec} + CASE WHEN ${rooms.playbackState} = 'LECTURE' THEN LEAST(GREATEST(EXTRACT(EPOCH FROM (now() - ${rooms.lastPlaybackUpdate})), 0), 43200) ELSE 0 END`;
