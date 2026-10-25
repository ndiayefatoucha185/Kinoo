import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Middleware generator for Zod validation
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
      return res.status(400).json({
        error: 'Validation des données échouée',
        details: issues,
      });
    }
    req.body = result.data;
    next();
  };
}

// 1. Authentification
export const loginSchema = z.object({
  email: z.string().trim().email('Adresse e-mail invalide').max(255),
  password: z.string().min(1, 'Mot de passe requis').max(200),
});

export const registerSchema = z.object({
  pseudo: z.string().min(2, 'Le pseudo doit contenir au moins 2 caractères').max(50).trim(),
  email: z.string().email('Adresse e-mail invalide').max(255).trim(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(200),
  avatar: z.string().optional().nullable(),
  forfait: z.enum(['GRATUIT', 'STANDARD', 'PREMIUM']).optional().default('GRATUIT'),
  honeypot: z.string().optional(),
});

// 2. Salons
export const createRoomSchema = z.object({
  titre: z.string().min(2, 'Le titre doit contenir au moins 2 caractères').max(100).trim(),
  estPrivee: z.boolean().optional().default(false),
  codeAcces: z.string().max(32).optional().nullable(),
  sourceContenu: z.any().optional().nullable(),
});

// 3. Signalements
export const createReportSchema = z.object({
  auteurPseudo: z.string().max(60).optional(),
  cibleType: z.enum(['UTILISATEUR', 'MESSAGE', 'SALON', 'CONTENU']),
  cibleId: z.string().min(1, 'Identifiant cible requis').max(128).trim(),
  motif: z.string().min(3, 'Le motif doit contenir au moins 3 caractères').max(1000).trim(),
});

// 4. Tickets de support
export const createTicketSchema = z.object({
  userEmail: z.string().email('Adresse e-mail invalide').max(255).optional().nullable(),
  message: z.string().min(5, 'Le message doit contenir au moins 5 caractères').max(3000).trim(),
  sujet: z.string().max(200).optional(),
});

// 5. Invitations
export const inviteSchema = z.object({
  recipientEmail: z.string().email('Adresse e-mail du destinataire invalide').max(255).trim(),
  scheduledDate: z.string().max(100).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});
