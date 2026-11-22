import { getPlanConfig } from '../src/config/plans.ts';

/**
 * Vérifie qu'une source vidéo est autorisée par la formule de l'hôte.
 * Renvoie un message d'erreur, ou null si tout est permis.
 */
export function sourceNotAllowedReason(forfait: string | undefined, source: Record<string, unknown> | null): string | null {
  if (!source) return null;
  const plan = getPlanConfig(forfait as any);
  const type = typeof source.typeSource === 'string' ? source.typeSource : '';
  if (type === 'CATALOGUE' && !plan.allowCatalogue) {
    return 'Le catalogue « Films & séries du moment » est réservé à la formule Premium.';
  }
  if (type === 'FICHIER_LOCAL' && !plan.allowLocalFiles) {
    return "L'import de fichiers vidéo est réservé aux formules Standard et Premium.";
  }
  return null;
}
