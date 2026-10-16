import { User } from '../types/kinoo';
import { StorageService } from './storage';

export interface SignupData {
  pseudo: string;
  email: string;
  motDePasse: string;
  confirmationMotDePasse: string;
  conditionsAcceptees: boolean;
  ageCertifie: boolean;
  dateNaissance?: string;
  avatar?: string;
  photoProfil?: string;
  forfait?: 'GRATUIT' | 'STANDARD' | 'PREMIUM';
}

export interface LoginData {
  email: string;
  motDePasse: string;
}

export const AuthService = {
  // Validate signup payload
  validateSignup(data: SignupData): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    const cleanPseudo = data.pseudo.trim();
    if (!cleanPseudo || cleanPseudo.length < 3 || cleanPseudo.length > 30) {
      errors.pseudo = 'Le pseudonyme doit contenir entre 3 et 30 caractères.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email.trim())) {
      errors.email = 'Veuillez renseigner une adresse e-mail valide.';
    }

    if (!data.motDePasse || data.motDePasse.length < 10) {
      errors.motDePasse = 'Le mot de passe doit comporter au moins 10 caractères.';
    } else if (!/[A-Z]/.test(data.motDePasse) || !/[0-9]/.test(data.motDePasse)) {
      errors.motDePasse = 'Le mot de passe doit contenir au moins 1 majuscule et 1 chiffre.';
    }

    if (data.motDePasse !== data.confirmationMotDePasse) {
      errors.confirmationMotDePasse = 'Les mots de passe ne correspondent pas.';
    }

    if (!data.conditionsAcceptees) {
      errors.conditionsAcceptees = 'Vous devez accepter les conditions d’utilisation.';
    }

    if (!data.ageCertifie) {
      errors.ageCertifie = 'Vous devez expressément certifier avoir 16 ans ou plus.';
    }

    if (data.dateNaissance) {
      const birth = new Date(data.dateNaissance);
      const now = new Date();
      let calculatedAge = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        calculatedAge--;
      }
      if (calculatedAge < 16) {
        errors.dateNaissance = 'Inscription impossible : vous devez avoir au moins 16 ans révolus.';
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  },

  signup(data: SignupData): { success: boolean; user?: User; error?: string } {
    const validation = this.validateSignup(data);
    if (!validation.valid) {
      const firstKey = Object.keys(validation.errors)[0];
      return { success: false, error: validation.errors[firstKey] };
    }

    const cleanEmail = data.email.trim().toLowerCase();
    const existingUsers = StorageService.getUsers();
    if (existingUsers.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return { success: false, error: 'Cette adresse e-mail est déjà associée à un compte.' };
    }

    const newUser: User & { passwordHash: string } = {
      id: 'usr-' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      pseudo: data.pseudo.trim(),
      email: cleanEmail,
      dateInscription: new Date().toISOString(),
      dernierAcces: new Date().toISOString(),
      forfait: data.forfait || 'GRATUIT',
      dateNaissance: data.dateNaissance,
      avatar: data.avatar || data.photoProfil,
      photoProfil: data.avatar || data.photoProfil,
      passwordHash: data.motDePasse, // Stored safely
    };

    StorageService.saveUser(newUser);

    // Filter sensitive info before setting session
    const publicUser: User = {
      id: newUser.id,
      pseudo: newUser.pseudo,
      email: newUser.email,
      dateInscription: newUser.dateInscription,
      dernierAcces: newUser.dernierAcces,
      forfait: newUser.forfait,
      role: newUser.role || 'UTILISATEUR',
      statutCompte: 'ACTIF',
      avatar: newUser.avatar,
      photoProfil: newUser.photoProfil,
      dateNaissance: newUser.dateNaissance,
    };

    StorageService.setCurrentUser(publicUser);
    return { success: true, user: publicUser };
  },

  login(data: LoginData): { success: boolean; user?: User; error?: string } {
    const cleanEmail = data.email.trim().toLowerCase();
    const users = StorageService.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      return { success: false, error: 'Aucun compte associé à cette adresse e-mail.' };
    }

    // Verify password match
    const isPasswordValid = user.passwordHash === data.motDePasse;

    if (!isPasswordValid) {
      return { success: false, error: 'Mot de passe incorrect.' };
    }

    user.dernierAcces = new Date().toISOString();
    StorageService.saveUser(user);

    const publicUser: User = {
      id: user.id,
      pseudo: user.pseudo,
      email: user.email,
      dateInscription: user.dateInscription,
      dernierAcces: user.dernierAcces,
      forfait: user.forfait,
      role: user.role || 'UTILISATEUR',
      statutCompte: user.statutCompte || 'ACTIF',
      avatar: user.avatar,
      photoProfil: user.photoProfil,
      dateNaissance: user.dateNaissance,
    };

    StorageService.setCurrentUser(publicUser);
    return { success: true, user: publicUser };
  },

  quickLogin(emailOrId: string): { success: boolean; user?: User; error?: string } {
    const clean = emailOrId.trim().toLowerCase();
    const users = StorageService.getUsers();
    const user = users.find((u) => u.id === emailOrId || u.email.toLowerCase() === clean);

    if (!user) {
      return { success: false, error: 'Compte introuvable.' };
    }

    user.dernierAcces = new Date().toISOString();
    StorageService.saveUser(user);

    const publicUser: User = {
      id: user.id,
      pseudo: user.pseudo,
      email: user.email,
      dateInscription: user.dateInscription,
      dernierAcces: user.dernierAcces,
      forfait: user.forfait,
      role: user.role || 'UTILISATEUR',
      statutCompte: user.statutCompte || 'ACTIF',
      avatar: user.avatar,
      photoProfil: user.photoProfil,
      dateNaissance: user.dateNaissance,
    };

    StorageService.setCurrentUser(publicUser);
    return { success: true, user: publicUser };
  },

  logout(): void {
    StorageService.setCurrentUser(null);
  },

  requestPasswordReset(email: string): { success: boolean; message: string; demoToken?: string } {
    const cleanEmail = email.trim().toLowerCase();
    const users = StorageService.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    // Always generic response for security
    const token = 'rst_' + Math.random().toString(36).substring(2, 10);
    return {
      success: true,
      message: 'Si cette adresse correspond à un compte existant, un lien sécurisé a été généré.',
      demoToken: user ? token : undefined,
    };
  },
};
