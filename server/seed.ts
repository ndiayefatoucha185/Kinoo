import { db } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  hashPassword,
  comparePassword,
  getAdminEmail,
  hasRealPassword,
  PASSWORD_MARKER_RESET_REQUIRED,
} from './auth.js';
import { validatePasswordStrength, newId } from './security.js';

/**
 * Mots de passe Super Admin qui ont figuré dans le dépôt public : ils sont considérés comme compromis.
 * Si un compte existant les utilise encore, il est neutralisé au démarrage.
 */
const COMPROMISED_ADMIN_PASSWORDS = ['My_AppKinoo@26'];

function isAcceptableAdminPassword(pw: string | undefined): pw is string {
  if (!pw) return false;
  if (COMPROMISED_ADMIN_PASSWORDS.includes(pw)) return false;
  if (pw.length < 12) return false;
  return validatePasswordStrength(pw) === null;
}

export async function seedInitialDatabase() {
  try {
    const adminEmail = getAdminEmail();
    if (!adminEmail) {
      console.warn(
        '[SEED] ADMIN_EMAIL non défini : aucun compte Super Admin n’est créé ni vérifié. ' +
          'Définissez ADMIN_EMAIL (et ADMIN_INITIAL_PASSWORD au premier démarrage).'
      );
      return;
    }

    const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;

    if (existingAdmin.length === 0) {
      // Aucun mot de passe par défaut : le démarrage ne crée pas de compte administrateur sans secret fourni par l'exploitant.
      if (!isAcceptableAdminPassword(initialPassword)) {
        console.error(
          '[SEED] Compte Super Admin NON créé : ADMIN_INITIAL_PASSWORD doit être défini (12 caractères minimum, ' +
            'une majuscule, un chiffre, différent de tout mot de passe publié).'
        );
        return;
      }
      const hashedPassword = await hashPassword(initialPassword);
      await db.insert(users).values({
        id: newId('usr-admin'),
        pseudo: 'Super Admin Kinoo',
        email: adminEmail,
        passwordHash: hashedPassword,
        forfait: 'PREMIUM',
        role: 'SUPER_ADMIN',
        statutCompte: 'ACTIF',
        emailVerifiedAt: new Date(),
        avatar: null,
      });
      console.log(`[SEED] Compte Super Admin initial créé pour ${adminEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3')}`);
      return;
    }

    const admin = existingAdmin[0];

    // Le compte existe déjà : le mot de passe n'est JAMAIS écrasé, sauf s'il s'agit d'un mot de passe publié (compromis).
    let compromised = false;
    if (hasRealPassword(admin.passwordHash)) {
      for (const leaked of COMPROMISED_ADMIN_PASSWORDS) {
        if (await comparePassword(leaked, admin.passwordHash)) {
          compromised = true;
          break;
        }
      }
    }

    if (compromised) {
      const replacement = isAcceptableAdminPassword(initialPassword) ? await hashPassword(initialPassword) : null;
      await db
        .update(users)
        .set({
          passwordHash: replacement ?? PASSWORD_MARKER_RESET_REQUIRED,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          activeSessionToken: null,
          activeSessionExpiresAt: null,
        })
        .where(eq(users.id, admin.id));
      console.error(
        replacement
          ? '[SECURITY] Le mot de passe Super Admin était un mot de passe publié : remplacé par ADMIN_INITIAL_PASSWORD, toutes les sessions révoquées.'
          : '[SECURITY] Le mot de passe Super Admin était un mot de passe publié : compte verrouillé et sessions révoquées. ' +
              'Utilisez « mot de passe oublié » (lien envoyé à l’adresse Super Admin) ou définissez ADMIN_INITIAL_PASSWORD puis redémarrez.'
      );
    }

    await db
      .update(users)
      .set({ role: 'SUPER_ADMIN', forfait: 'PREMIUM', statutCompte: 'ACTIF' })
      .where(eq(users.id, admin.id));
    console.log('[SEED] Compte Super Admin existant vérifié.');
  } catch (error) {
    console.error('[SEED] Erreur initialisation PostgreSQL:', error);
  }
}
