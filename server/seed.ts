import { db } from '../src/db/index.js';
import { users, rooms, participations, messages, reports, tickets, transactions, auditLogs } from '../src/db/schema.js';
import { eq, not, inArray } from 'drizzle-orm';
import { hashPassword } from './auth.js';

export const ADMIN_EMAIL = 'kinoo.service@gmail.com';

export async function seedInitialDatabase() {
  try {
    // 1. Ensure the unique real Super Admin account exists with properly hashed password
    const existingAdmin = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);

    if (existingAdmin.length === 0) {
      const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'My_AppKinoo@26';
      const hashedPassword = await hashPassword(initialPassword);
      await db.insert(users).values({
        id: 'usr-admin-kinoo',
        pseudo: 'Super Admin Kinoo',
        email: ADMIN_EMAIL,
        passwordHash: hashedPassword,
        forfait: 'PREMIUM',
        role: 'SUPER_ADMIN',
        statutCompte: 'ACTIF',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
      });
      console.log(`[SEED] Compte Super Admin initial créé pour ${ADMIN_EMAIL.replace(/(.{2})(.*)(@.*)/, '$1***$3')}`);
    } else {
      // Le compte existe déjà : NE JAMAIS ÉCRASER LE MOT DE PASSE existant
      await db
        .update(users)
        .set({
          role: 'SUPER_ADMIN',
          forfait: 'PREMIUM',
          statutCompte: 'ACTIF',
        })
        .where(eq(users.email, ADMIN_EMAIL));
      console.log(`[SEED] Compte Super Admin existant vérifié (mot de passe préservé intact).`);
    }
  } catch (error) {
    console.error('[SEED] Erreur initialisation PostgreSQL:', error);
  }
}

