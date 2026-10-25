import React, { useState, useRef, useEffect } from 'react';
import { AuthService, SignupData, LoginData } from '../services/auth';
import { StorageService } from '../services/storage';
import { ApiClient } from '../services/api';
import { User } from '../types/kinoo';
import {
  X,
  Lock,
  Mail,
  User as UserIcon,
  ShieldCheck,
  AlertCircle,
  Calendar,
  Camera,
  Upload,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  Eye,
  EyeOff,
  Check,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Shield,
  Zap,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop',
];

const GoogleIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  subtitle?: React.ReactNode;
  required?: boolean;
}

const CustomCheckbox: React.FC<CustomCheckboxProps> = ({ checked, onChange, label, subtitle }) => {
  return (
    <div
      onClick={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
        checked
          ? 'bg-[#EC4899]/10 border-[#EC4899] shadow-sm shadow-[#EC4899]/15'
          : 'bg-[#09090B] border-[#2E2E38] hover:border-[#7C3AED]/50'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
          checked
            ? 'bg-[#EC4899] border-[#EC4899] text-white shadow-md shadow-[#EC4899]/30'
            : 'border-gray-400 bg-[#141417] hover:border-[#EC4899]'
        }`}
      >
        {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
      </div>
      <div className="flex-1 text-xs">
        <div className="font-semibold text-white leading-snug">{label}</div>
        {subtitle && <div className="text-[11px] text-[#B8B4C0] mt-0.5 leading-snug">{subtitle}</div>}
      </div>
    </div>
  );
};

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'signup' | 'forgot' | 'reset';
  resetToken?: string;
  onClose: () => void;
  onAuthSuccess: (user: User) => void;
  onOpenLegal: (page: 'cgu' | 'confidentialite') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  resetToken = '',
  onClose,
  onAuthSuccess,
  onOpenLegal,
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset' | 'google_onboarding'>(initialMode);
  const [signupStep, setSignupStep] = useState<'account' | 'plan'>('account');
  const [selectedForfait, setSelectedForfait] = useState<'GRATUIT' | 'STANDARD' | 'PREMIUM'>('GRATUIT');

  // Google Onboarding State for new users
  const [googleOnboardingData, setGoogleOnboardingData] = useState<{
    profile: { email: string; pseudo: string; avatar: string };
    onboardingToken: string;
  } | null>(null);
  const [onboardingPseudo, setOnboardingPseudo] = useState('');
  const [onboardingAvatar, setOnboardingAvatar] = useState('');
  const onboardingFileInputRef = useRef<HTMLInputElement | null>(null);

  // Form states
  const [pseudo, setPseudo] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [tokenInput, setTokenInput] = useState(resetToken);
  const [dateNaissance, setDateNaissance] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);
  const [conditionsAcceptees, setConditionsAcceptees] = useState(false);
  const [ageCertifie, setAgeCertifie] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Feedback states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSessionConflict, setIsSessionConflict] = useState(false);
  const [requiresCaptcha, setRequiresCaptcha] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileConfig, setTurnstileConfig] = useState<{ mode: 'turnstile' | 'internal'; siteKey: string | null } | null>(null);
  const [captchaChallenge, setCaptchaChallenge] = useState<{ challengeId: string; question: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [isSendingUnlock, setIsSendingUnlock] = useState(false);

  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (requiresCaptcha && turnstileConfig?.mode === 'turnstile' && turnstileConfig?.siteKey) {
      const renderWidget = () => {
        const el = document.getElementById('cf-turnstile-container');
        if (el && (window as any).turnstile) {
          el.innerHTML = '';
          try {
            (window as any).turnstile.render('#cf-turnstile-container', {
              sitekey: turnstileConfig.siteKey,
              theme: 'dark',
              callback: (token: string) => {
                setTurnstileToken(token);
              },
            });
          } catch {}
        }
      };
      if ((window as any).turnstile) {
        renderWidget();
      } else {
        const interval = setInterval(() => {
          if ((window as any).turnstile) {
            clearInterval(interval);
            renderWidget();
          }
        }, 150);
        return () => clearInterval(interval);
      }
    }
  }, [requiresCaptcha, turnstileConfig]);

  useEffect(() => {
    // Ne réinitialiser le mode et l'onboarding que lors d'une NOUVELLE ouverture de la modale
    if (isOpen && !prevIsOpenRef.current) {
      setMode(initialMode);
      setSignupStep('account');
      setGoogleOnboardingData(null);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
    prevIsOpenRef.current = isOpen;
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("L'image est trop volumineuse (maximum 5 Mo).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOnboardingImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("L'image est trop volumineuse (maximum 5 Mo).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOnboardingAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

    const fetchCaptcha = async () => {
    try {
      // Vérifier si Turnstile est configuré
      const cfgRes = await fetch('/api/auth/captcha-config');
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setTurnstileConfig(cfg);
        if (cfg.mode === 'turnstile' && cfg.siteKey) {
          // Chargement du script Cloudflare Turnstile
          if (!(window as any).turnstile) {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
          }
        }
      }

      const res = await fetch('/api/auth/captcha-challenge');
      if (res.ok) {
        const data = await res.json();
        setCaptchaChallenge(data);
        setCaptchaAnswer('');
      }
    } catch {}
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSessionConflict(false);
    setIsSubmitting(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await ApiClient.login(cleanEmail, motDePasse);
      StorageService.setCurrentUser(res.user);
      onAuthSuccess(res.user);
      onClose();
    } catch (apiErr: any) {
      const errMsg = apiErr?.message || '';
      if (apiErr?.requiresCaptcha || errMsg.includes('captcha') || errMsg.includes('sécurité requise')) {
        setRequiresCaptcha(true);
        fetchCaptcha();
      }

      const isConflict =
        apiErr?.code === 'SUPER_ADMIN_SESSION_ACTIVE' ||
        errMsg.includes('SUPER_ADMIN_SESSION_ACTIVE') ||
        errMsg.includes('autre appareil') ||
        errMsg.includes('déjà active');

      if (isConflict) {
        setErrorMessage("Une session Super Admin est déjà active sur un autre appareil. Déconnectez-vous d'abord pour vous connecter ici.");
        setIsSessionConflict(true);
      } else {
        setIsSessionConflict(false);
        const payload: LoginData = { email, motDePasse };
        const res = AuthService.login(payload);
        if (res.success && res.user) {
          onAuthSuccess(res.user);
          onClose();
        } else {
          setErrorMessage(errMsg || res.error || 'Échec de connexion.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedToPlanSelection = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const payload: SignupData = {
      pseudo,
      email,
      motDePasse,
      confirmationMotDePasse,
      conditionsAcceptees,
      ageCertifie,
      dateNaissance: dateNaissance || undefined,
      avatar: selectedAvatar,
      photoProfil: selectedAvatar,
    };

    const validation = AuthService.validateSignup(payload);
    if (!validation.valid) {
      const firstKey = Object.keys(validation.errors)[0];
      setErrorMessage(validation.errors[firstKey]);
      return;
    }

    setSignupStep('plan');
  };

  const handleFinalSignupSubmit = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    const payload: SignupData = {
      pseudo,
      email,
      motDePasse,
      confirmationMotDePasse,
      conditionsAcceptees,
      ageCertifie,
      dateNaissance: dateNaissance || undefined,
      avatar: selectedAvatar,
      photoProfil: selectedAvatar,
    };

    try {
      const res = await ApiClient.register(
        pseudo.trim(),
        email.trim().toLowerCase(),
        motDePasse,
        selectedAvatar,
        selectedForfait,
        honeypot || undefined,
        honeypot || undefined
      );
      StorageService.setCurrentUser(res.user);
      onAuthSuccess(res.user);
      onClose();
    } catch (apiErr: any) {
      const res = AuthService.signup(payload);
      if (res.success && res.user) {
        res.user.forfait = selectedForfait;
        StorageService.setCurrentUser(res.user);
        onAuthSuccess(res.user);
        onClose();
      } else {
        setErrorMessage(apiErr?.message || res.error || 'Erreur lors de la création du compte.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const urlRes = await ApiClient.getGoogleAuthUrl(redirectUri);

      if (!urlRes.configured || !urlRes.url) {
        setErrorMessage(
          urlRes.error ||
            'Configuration requise : GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET doivent être configurés dans vos variables d’environnement.'
        );
        return;
      }

      const expectedState = urlRes.state;
      if (expectedState) {
        try {
          sessionStorage.setItem('kinoo_oauth_expected_state', expectedState);
        } catch (e) {}
      }

      // Ouverture directe du fournisseur Google OAuth en popup isolée
      const width = 560;
      const height = 680;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        urlRes.url,
        'kinoo_oauth_google',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,status=no`
      );

      if (!popup) {
        setErrorMessage('Le bloqueur de fenêtres pop-up a empêché l’ouverture. Veuillez autoriser les fenêtres pop-up pour continuer.');
        return;
      }

      let isHandled = false;

      const cleanupListeners = () => {
        window.removeEventListener('message', messageListener);
        window.removeEventListener('storage', storageListener);
        if (broadcastChannel) {
          try {
            broadcastChannel.close();
          } catch (e) {}
        }
      };

      const processAuthResponse = async (data: { code?: string; state?: string; error?: string }) => {
        if (isHandled) return;
        isHandled = true;
        cleanupListeners();

        const { code, state, error } = data;

        if (error) {
          setErrorMessage(`Erreur de connexion Google: ${error}`);
          return;
        }

        // Vérification préalable anti-CSRF côté client (comparaison avec le state attendu en session/mémoire)
        let localExpected = expectedState;
        try {
          const stored = sessionStorage.getItem('kinoo_oauth_expected_state');
          if (stored) localExpected = stored;
          sessionStorage.removeItem('kinoo_oauth_expected_state');
        } catch (e) {}

        const finalState = state || localExpected;
        if (!finalState || (state && localExpected && state !== localExpected)) {
          console.warn('[OAUTH CLIENT] Incompatibilité du paramètre state CSRF:', { received: state, expected: localExpected });
          setErrorMessage('Erreur 403 : Échec de validation de sécurité CSRF (le jeton de session ne correspond pas à la requête locale).');
          return;
        }

        if (code) {
          setIsSubmitting(true);
          try {
            const res = await ApiClient.verifyGoogleOAuth(code, redirectUri, {
              state: finalState,
            });

            if (res.needsOnboarding && res.googleProfile && res.onboardingToken) {
              // NOUVEL UTILISATEUR : passage obligatoire par l'écran de finalisation
              setGoogleOnboardingData({
                profile: res.googleProfile,
                onboardingToken: res.onboardingToken,
              });
              setOnboardingPseudo(res.googleProfile.pseudo || '');
              setOnboardingAvatar(res.googleProfile.avatar || '');
              setAgeCertifie(false);
              setConditionsAcceptees(false);
              setSelectedForfait('GRATUIT');
              setMode('google_onboarding');
              setErrorMessage(null);
            } else if (res.user) {
              // UTILISATEUR EXISTANT : Connexion directe sans écran intermédiaire
              StorageService.setCurrentUser(res.user);
              onAuthSuccess(res.user);
              onClose();
            }
          } catch (err: any) {
            setErrorMessage(err?.message || 'Échec de l’authentification Google.');
          } finally {
            setIsSubmitting(false);
          }
        }
      };

      // 1. Écoute postMessage avec contrôle strict de l'origine exacte (sans wildcard)
      const messageListener = (event: MessageEvent) => {
        const origin = event.origin;
        const isTrusted =
          origin === window.location.origin ||
          origin === 'https://kinoo.app' ||
          origin === 'https://www.kinoo.app';

        if (!isTrusted) return;

        if (event.data?.type === 'KINOO_OAUTH_RESPONSE') {
          processAuthResponse(event.data);
        }
      };

      // 2. Écoute BroadcastChannel (même origine, fonctionne si window.opener est null)
      let broadcastChannel: BroadcastChannel | null = null;
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          broadcastChannel = new BroadcastChannel('kinoo_oauth_channel');
          broadcastChannel.onmessage = (event) => {
            if (event.data?.type === 'KINOO_OAUTH_RESPONSE') {
              processAuthResponse(event.data);
            }
          };
        }
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }

      // 3. Écoute localStorage (compatibilité universelle même origine)
      const storageListener = (event: StorageEvent) => {
        if (event.key === 'kinoo_oauth_event' && event.newValue) {
          try {
            const data = JSON.parse(event.newValue);
            if (data?.type === 'KINOO_OAUTH_RESPONSE') {
              processAuthResponse(data);
            }
          } catch (e) {}
        }
      };

      window.addEventListener('message', messageListener);
      window.addEventListener('storage', storageListener);

      // Timeout automatique après 5 minutes
      setTimeout(cleanupListeners, 5 * 60 * 1000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erreur lors de l’initialisation Google.');
    }
  };

  const handleFinalizeGoogleOnboarding = async () => {
    if (!googleOnboardingData) return;

    const cleanPseudo = onboardingPseudo.trim();
    if (!cleanPseudo || cleanPseudo.length < 3 || cleanPseudo.length > 30) {
      setErrorMessage('Le pseudonyme doit comporter entre 3 et 30 caractères.');
      return;
    }

    if (!ageCertifie) {
      setErrorMessage('Vous devez expressément certifier sur l’honneur avoir 16 ans ou plus pour créer votre compte.');
      return;
    }

    if (!conditionsAcceptees) {
      setErrorMessage('Vous devez accepter les conditions générales d’utilisation et la politique de confidentialité.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await ApiClient.completeGoogleOnboarding({
        onboardingToken: googleOnboardingData.onboardingToken,
        ageCertifie: true,
        forfait: selectedForfait,
        pseudo: cleanPseudo,
        avatar: onboardingAvatar || googleOnboardingData.profile.avatar,
      });
      StorageService.setCurrentUser(res.user);
      onAuthSuccess(res.user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erreur lors de la finalisation du compte Google.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestUnlock = async () => {
    if (!email) return;
    setIsSendingUnlock(true);
    setErrorMessage(null);
    try {
      const res = await ApiClient.request<{ message: string }>('/api/auth/super-admin/request-unlock', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setSuccessMessage(res.message || 'Lien de déblocage d’urgence envoyé par email (valable 15 min).');
      setIsSessionConflict(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erreur lors de la demande de déblocage.');
    } finally {
      setIsSendingUnlock(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await ApiClient.request<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setSuccessMessage(res.message || 'Lien de réinitialisation envoyé (valide 15 minutes).');
    } catch (err: any) {
      setErrorMessage(err?.message || "Erreur lors de l'envoi du lien de réinitialisation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!tokenInput.trim() || !newPassword) {
      setErrorMessage('Token et nouveau mot de passe requis.');
      return;
    }
    if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setErrorMessage('Le mot de passe doit comporter au moins 10 caractères, 1 majuscule et 1 chiffre.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await ApiClient.request<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: tokenInput.trim(), newPassword }),
      });
      setSuccessMessage(res.message || 'Mot de passe modifié avec succès !');
      setTimeout(() => setMode('login'), 2000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lien invalide ou délai de 15 minutes dépassé.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="bg-[#141417] border border-[#232326] rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative max-h-[92vh] flex flex-col my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors z-10 cursor-pointer"
          aria-label="Fermer la fenêtre"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Brand Header */}
        <div className="text-center space-y-2 shrink-0 pb-1">
          <div className="flex justify-center">
            <BrandLogo size="sm" showWordmark={true} />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {mode === 'login' && 'Connexion à votre espace Kinoo'}
            {mode === 'signup' && (signupStep === 'account' ? 'Créer votre compte Kinoo' : 'Choisissez votre forfait Kinoo')}
            {mode === 'google_onboarding' && 'Finaliser votre inscription Kinoo'}
            {mode === 'forgot' && 'Réinitialiser votre mot de passe'}
            {mode === 'reset' && 'Définir un nouveau mot de passe'}
          </h2>
          <p className="text-xs text-[#B8B4C0]">
            {mode === 'login' && 'Retrouvez vos séances et synchronisez vos moments ciné.'}
            {mode === 'signup' &&
              (signupStep === 'account'
                ? 'Étape 1 sur 2 : Vos identifiants de connexion'
                : 'Étape 2 sur 2 : Sélectionnez votre formule d’accès')}
            {mode === 'google_onboarding' && 'Personnalisez votre profil et choisissez votre formule avant premier accès.'}
            {mode === 'forgot' && 'Sécurité renforcée : lien temporaire à usage unique.'}
            {mode === 'reset' && 'Choisissez un mot de passe sécurisé (10 car. min, 1 majuscule, 1 chiffre).'}
          </p>
        </div>

        {/* Stepper progress for Signup */}
        {mode === 'signup' && (
          <div className="shrink-0 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className={signupStep === 'account' ? 'text-[#EC4899]' : 'text-gray-400'}>
                1. Identifiants
              </span>
              <span className={signupStep === 'plan' ? 'text-[#EC4899]' : 'text-gray-400'}>
                2. Choix du Forfait
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#232326] rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] transition-all duration-300 ${
                  signupStep === 'account' ? 'w-1/2' : 'w-full'
                }`}
              />
            </div>
          </div>
        )}

        {/* Alert Feedback */}
        {errorMessage && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl space-y-2.5 text-red-400 text-xs shrink-0">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>

            {isSessionConflict && (
              <div className="pt-2 border-t border-red-500/20 flex flex-col gap-2">
                <p className="text-[11px] text-gray-400">
                  Vous n'avez plus accès à votre autre appareil ou votre session est restée bloquée ?
                </p>
                <button
                  type="button"
                  onClick={handleRequestUnlock}
                  disabled={isSendingUnlock}
                  className="w-full py-2 px-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white font-medium text-xs border border-red-500/30 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isSendingUnlock ? 'Envoi en cours...' : 'Envoyer un lien de déblocage par email'}
                </button>
              </div>
            )}
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2.5 text-emerald-400 text-xs shrink-0">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto overscroll-contain pr-1 -mr-1 custom-scrollbar flex-1 min-h-0 space-y-4">
          {/* ========================================================================= */}
          {/* MODE CONNEXION (LOGIN) */}
          {/* ========================================================================= */}
          {mode === 'login' && (
            <div className="space-y-4">
              {/* Google Login Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-bold text-xs flex items-center justify-center gap-2.5 transition-all shadow-sm border border-gray-200 cursor-pointer"
              >
                <GoogleIcon />
                <span>Continuer avec Google</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-[#232326] w-full" />
                <span className="bg-[#141417] px-3 text-[11px] text-[#8E8B99] uppercase tracking-wider shrink-0 font-medium">
                  ou avec votre adresse e-mail
                </span>
                <div className="border-t border-[#232326] w-full" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-300">Adresse e-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="votre.email@exemple.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-medium text-gray-300">Mot de passe</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setErrorMessage(null);
                      }}
                      className="text-[11px] text-[#EC4899] hover:underline cursor-pointer"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••••••"
                      value={motDePasse}
                      onChange={(e) => setMotDePasse(e.target.value)}
                      className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-10 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-0.5 cursor-pointer"
                      title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {requiresCaptcha && (
                  turnstileConfig?.mode === 'turnstile' && turnstileConfig?.siteKey ? (
                    <div className="p-3.5 bg-[#141417] border border-purple-500/30 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                          🛡️ Contrôle de sécurité Cloudflare Turnstile
                        </span>
                      </div>
                      <div id="cf-turnstile-container" className="flex justify-center min-h-[65px]" />
                    </div>
                  ) : captchaChallenge ? (
                    <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                          🛡️ Ralentissement de sécurité (limitation de débit)
                        </span>
                        <button
                          type="button"
                          onClick={fetchCaptcha}
                          className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer"
                        >
                          Autre calcul
                        </button>
                      </div>
                      <p className="text-xs text-gray-200 font-medium">
                        {captchaChallenge.question}
                      </p>
                      <input
                        type="text"
                        required
                        placeholder="Votre réponse (ex: 12)"
                        value={captchaAnswer}
                        onChange={(e) => setCaptchaAnswer(e.target.value)}
                        className="w-full bg-[#09090B] border border-amber-500/40 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  ) : null
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#EC4899]/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Connexion en cours...' : 'Se connecter'}
                </button>
              </form>

              <div className="pt-2 text-center text-xs text-[#B8B4C0]">
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setSignupStep('account');
                    setErrorMessage(null);
                  }}
                  className="text-[#EC4899] font-bold hover:underline cursor-pointer"
                >
                  Créer un compte gratuitement
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODE INSCRIPTION — ÉTAPE 1 : IDENTIFIANTS */}
          {/* ========================================================================= */}
          {mode === 'signup' && signupStep === 'account' && (
            <div className="space-y-4">
              {/* Google Signup Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-bold text-xs flex items-center justify-center gap-2.5 transition-all shadow-sm border border-gray-200 cursor-pointer"
              >
                <GoogleIcon />
                <span>Continuer avec Google</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-[#232326] w-full" />
                <span className="bg-[#141417] px-3 text-[11px] text-[#8E8B99] uppercase tracking-wider shrink-0 font-medium">
                  ou avec votre adresse e-mail
                </span>
                <div className="border-t border-[#232326] w-full" />
              </div>

              <form onSubmit={handleProceedToPlanSelection} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-300">Pseudonyme</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: Cinéphile_99"
                      value={pseudo}
                      onChange={(e) => setPseudo(e.target.value)}
                      className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-300">Adresse e-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="votre.email@exemple.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-300">Mot de passe</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Minimum 10 car., 1 majuscule, 1 chiffre"
                      value={motDePasse}
                      onChange={(e) => setMotDePasse(e.target.value)}
                      className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-10 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-0.5 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-300">Confirmer le mot de passe</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Répétez votre mot de passe"
                      value={confirmationMotDePasse}
                      onChange={(e) => setConfirmationMotDePasse(e.target.value)}
                      className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-10 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-0.5 cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                    <span>Date de naissance</span>
                    <span className="text-[10px] text-gray-400 font-normal">Optionnel</span>
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      value={dateNaissance}
                      onChange={(e) => setDateNaissance(e.target.value)}
                      className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-[#EC4899]"
                    />
                  </div>
                </div>

                {/* Avatar Selection */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-medium text-gray-300">Choisissez votre avatar</label>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {PRESET_AVATARS.map((av, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setSelectedAvatar(av)}
                        className={`relative w-10 h-10 rounded-full overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                          selectedAvatar === av ? 'border-[#EC4899] scale-105 shadow-md shadow-[#EC4899]/30' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={av} alt="Avatar" className="w-full h-full object-cover" />
                      </button>
                    ))}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-10 h-10 rounded-full border border-dashed border-gray-600 hover:border-[#EC4899] flex items-center justify-center text-gray-400 hover:text-white shrink-0 cursor-pointer"
                      title="Téléverser une photo"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mandatory Custom Checkboxes */}
                <div className="pt-2 space-y-2.5">
                  <CustomCheckbox
                    checked={ageCertifie}
                    onChange={setAgeCertifie}
                    label="Je certifie sur l’honneur avoir 16 ans ou plus."
                    subtitle="Protection des mineurs : obligatoire pour accéder aux séances publiques et privées."
                    required
                  />

                  <CustomCheckbox
                    checked={conditionsAcceptees}
                    onChange={setConditionsAcceptees}
                    label={
                      <span>
                        J’accepte les{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenLegal('cgu');
                          }}
                          className="text-[#EC4899] underline hover:text-white cursor-pointer"
                        >
                          Conditions Générales
                        </button>{' '}
                        et la{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenLegal('confidentialite');
                          }}
                          className="text-[#EC4899] underline hover:text-white cursor-pointer"
                        >
                          Politique de Confidentialité
                        </button>
                        .
                      </span>
                    }
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#EC4899]/20 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <span>Continuer vers le choix du forfait</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="pt-1 text-center text-xs text-[#B8B4C0]">
                Déjà inscrit ?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                  }}
                  className="text-[#EC4899] font-bold hover:underline cursor-pointer"
                >
                  Se connecter
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODE INSCRIPTION — ÉTAPE 2 : CHOIX DU FORFAIT */}
          {/* ========================================================================= */}
          {mode === 'signup' && signupStep === 'plan' && (
            <div className="space-y-4">
              <div className="space-y-3">
                {/* Plan Gratuit */}
                <div
                  onClick={() => setSelectedForfait('GRATUIT')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none relative ${
                    selectedForfait === 'GRATUIT'
                      ? 'bg-[#EC4899]/10 border-[#EC4899] shadow-lg shadow-[#EC4899]/15'
                      : 'bg-[#09090B] border-[#232326] hover:border-[#3A3A44]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedForfait === 'GRATUIT'
                            ? 'border-[#EC4899] bg-[#EC4899] text-white'
                            : 'border-gray-500 bg-[#141417]'
                        }`}
                      >
                        {selectedForfait === 'GRATUIT' && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <h3 className="font-bold text-sm text-white">Kinoo Gratuit</h3>
                    </div>
                    <span className="text-xs font-extrabold text-white">0 FCFA</span>
                  </div>
                  <p className="text-[11px] text-[#B8B4C0] mt-1.5 ml-7">
                    3 séances / mois, jusqu’à 10 participants, lecteur web synchronisé et chat texte discret.
                  </p>
                </div>

                {/* Plan Standard */}
                <div
                  onClick={() => setSelectedForfait('STANDARD')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none relative ${
                    selectedForfait === 'STANDARD'
                      ? 'bg-[#EC4899]/10 border-[#EC4899] shadow-lg shadow-[#EC4899]/15'
                      : 'bg-[#09090B] border-[#232326] hover:border-[#3A3A44]'
                  }`}
                >
                  <div className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#EC4899] text-[10px] font-bold text-white shadow-sm">
                    Le plus populaire
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedForfait === 'STANDARD'
                            ? 'border-[#EC4899] bg-[#EC4899] text-white'
                            : 'border-gray-500 bg-[#141417]'
                        }`}
                      >
                        {selectedForfait === 'STANDARD' && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <h3 className="font-bold text-sm text-white">Kinoo Standard</h3>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-extrabold text-white">2 800 FCFA</span>
                      <span className="text-[10px] text-gray-400">/mois</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#B8B4C0] mt-1.5 ml-7">
                    25 séances / mois, 50 participants, import local, salon débrief micro et 100% sans pub.
                  </p>
                </div>

                {/* Plan Premium */}
                <div
                  onClick={() => setSelectedForfait('PREMIUM')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none relative ${
                    selectedForfait === 'PREMIUM'
                      ? 'bg-[#3B82F6]/10 border-[#3B82F6] shadow-lg shadow-[#3B82F6]/15'
                      : 'bg-[#09090B] border-[#232326] hover:border-[#3A3A44]'
                  }`}
                >
                  <div className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full bg-[#3B82F6] text-[10px] font-bold text-white shadow-sm">
                    Tout Illimité
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedForfait === 'PREMIUM'
                            ? 'border-[#3B82F6] bg-[#3B82F6] text-white'
                            : 'border-gray-500 bg-[#141417]'
                        }`}
                      >
                        {selectedForfait === 'PREMIUM' && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <h3 className="font-bold text-sm text-white">Kinoo Premium</h3>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-extrabold text-white">4 750 FCFA</span>
                      <span className="text-[10px] text-gray-400">/mois</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#B8B4C0] mt-1.5 ml-7">
                    Séances illimitées, 250 participants, assistant IA dédié, messagerie privée et débit prioritaire.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSignupStep('account')}
                  className="w-full sm:w-auto px-4 py-3 rounded-xl border border-[#232326] bg-[#1C1C22] hover:bg-[#232328] text-gray-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Retour</span>
                </button>

                <button
                  type="button"
                  onClick={handleFinalSignupSubmit}
                  disabled={isSubmitting}
                  className="w-full sm:flex-1 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#EC4899]/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    'Création du compte...'
                  ) : (
                    <span>
                      Valider mon inscription (
                      {selectedForfait === 'GRATUIT'
                        ? 'Forfait Gratuit'
                        : selectedForfait === 'STANDARD'
                        ? 'Forfait Standard'
                        : 'Forfait Premium'}
                      )
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODE ONBOARDING GOOGLE POUR NOUVEL UTILISATEUR */}
          {/* ========================================================================= */}
          {mode === 'google_onboarding' && googleOnboardingData && (
            <div className="space-y-4">
              {/* Profil Google Header : Email vérifié */}
              <div className="p-3 bg-[#1C1C22] border border-[#2B2B32] rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-white font-medium truncate">
                    {googleOnboardingData.profile.email}
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/30 shrink-0">
                  Compte Google vérifié
                </span>
              </div>

              {/* 1. Photo de profil (Aperçu + Remplacement + Importation) */}
              <div className="space-y-2.5 p-3.5 bg-[#09090B] border border-[#232326] rounded-xl">
                <label className="text-xs font-bold text-white block">
                  Photo de profil
                </label>
                <div className="flex items-center gap-3.5">
                  <img
                    src={onboardingAvatar || googleOnboardingData.profile.avatar}
                    alt="Aperçu profil"
                    className="w-14 h-14 rounded-full object-cover border-2 border-[#EC4899] shadow-md shadow-[#EC4899]/20 shrink-0"
                  />
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-[11px] text-[#B8B4C0]">
                      {onboardingAvatar === googleOnboardingData.profile.avatar
                        ? 'Photo officielle de votre compte Google.'
                        : 'Avatar personnalisé sélectionné.'}
                    </p>
                    {onboardingAvatar !== googleOnboardingData.profile.avatar && (
                      <button
                        type="button"
                        onClick={() => setOnboardingAvatar(googleOnboardingData.profile.avatar)}
                        className="text-[11px] text-[#EC4899] hover:underline font-semibold cursor-pointer block"
                      >
                        ↺ Rétablir ma photo Google
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-1.5">
                  <p className="text-[10px] text-gray-400 mb-1.5 font-medium">
                    Ou choisissez un avatar / importez votre photo :
                  </p>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {PRESET_AVATARS.map((av, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setOnboardingAvatar(av)}
                        className={`relative w-9 h-9 rounded-full overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                          onboardingAvatar === av
                            ? 'border-[#EC4899] scale-105 shadow-md shadow-[#EC4899]/30'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={av} alt="Avatar" className="w-full h-full object-cover" />
                      </button>
                    ))}
                    <input
                      type="file"
                      ref={onboardingFileInputRef}
                      onChange={handleOnboardingImageFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => onboardingFileInputRef.current?.click()}
                      className="w-9 h-9 rounded-full border border-dashed border-gray-600 hover:border-[#EC4899] flex items-center justify-center text-gray-400 hover:text-white shrink-0 cursor-pointer"
                      title="Importer une photo depuis vos fichiers"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Pseudonyme modifiable */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-white">Pseudonyme Kinoo</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="Votre pseudonyme"
                    value={onboardingPseudo}
                    onChange={(e) => setOnboardingPseudo(e.target.value)}
                    className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899] text-xs"
                  />
                </div>
                <p className="text-[10px] text-gray-400">Pré-rempli avec votre nom Google, modifiable à votre convenance.</p>
              </div>

              {/* 3. Choix du Forfait */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-white block">
                  Choisissez votre formule d'accès Kinoo :
                </label>

                {/* Plan Gratuit */}
                <div
                  onClick={() => setSelectedForfait('GRATUIT')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none relative ${
                    selectedForfait === 'GRATUIT'
                      ? 'bg-[#EC4899]/10 border-[#EC4899] shadow-md shadow-[#EC4899]/15'
                      : 'bg-[#09090B] border-[#232326] hover:border-[#3A3A44]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedForfait === 'GRATUIT'
                            ? 'border-[#EC4899] bg-[#EC4899] text-white'
                            : 'border-gray-500 bg-[#141417]'
                        }`}
                      >
                        {selectedForfait === 'GRATUIT' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <h4 className="font-bold text-xs text-white">Kinoo Gratuit</h4>
                    </div>
                    <span className="text-xs font-bold text-white">0 FCFA</span>
                  </div>
                  <p className="text-[10px] text-[#B8B4C0] mt-1 ml-6">
                    3 séances / mois, jusqu’à 10 participants, chat texte synchronisé.
                  </p>
                </div>

                {/* Plan Standard */}
                <div
                  onClick={() => setSelectedForfait('STANDARD')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none relative ${
                    selectedForfait === 'STANDARD'
                      ? 'bg-[#EC4899]/10 border-[#EC4899] shadow-md shadow-[#EC4899]/15'
                      : 'bg-[#09090B] border-[#232326] hover:border-[#3A3A44]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedForfait === 'STANDARD'
                            ? 'border-[#EC4899] bg-[#EC4899] text-white'
                            : 'border-gray-500 bg-[#141417]'
                        }`}
                      >
                        {selectedForfait === 'STANDARD' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <h4 className="font-bold text-xs text-white">Kinoo Standard</h4>
                    </div>
                    <span className="text-xs font-bold text-white">2 800 FCFA / mois</span>
                  </div>
                  <p className="text-[10px] text-[#B8B4C0] mt-1 ml-6">
                    25 séances / mois, 50 participants, import local, salon débrief micro.
                  </p>
                </div>

                {/* Plan Premium */}
                <div
                  onClick={() => setSelectedForfait('PREMIUM')}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none relative ${
                    selectedForfait === 'PREMIUM'
                      ? 'bg-[#3B82F6]/10 border-[#3B82F6] shadow-md shadow-[#3B82F6]/15'
                      : 'bg-[#09090B] border-[#232326] hover:border-[#3A3A44]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedForfait === 'PREMIUM'
                            ? 'border-[#3B82F6] bg-[#3B82F6] text-white'
                            : 'border-gray-500 bg-[#141417]'
                        }`}
                      >
                        {selectedForfait === 'PREMIUM' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <h4 className="font-bold text-xs text-white">Kinoo Premium</h4>
                    </div>
                    <span className="text-xs font-bold text-white">4 750 FCFA / mois</span>
                  </div>
                  <p className="text-[10px] text-[#B8B4C0] mt-1 ml-6">
                    Séances illimitées, 250 participants, IA dédiée, débit prioritaire.
                  </p>
                </div>
              </div>

              {/* 4. Cases obligatoires (16+ et CGU/Confidentialité) */}
              <div className="space-y-2 pt-1">
                <CustomCheckbox
                  checked={ageCertifie}
                  onChange={setAgeCertifie}
                  label="Je certifie sur l’honneur avoir 16 ans ou plus."
                  subtitle="Conformément aux règles de protection des mineurs, la certification d'âge est obligatoire avant le premier accès."
                  required
                />

                <CustomCheckbox
                  checked={conditionsAcceptees}
                  onChange={setConditionsAcceptees}
                  label={
                    <span>
                      J’accepte les{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenLegal('cgu');
                        }}
                        className="text-[#EC4899] underline hover:text-white cursor-pointer"
                      >
                        Conditions Générales
                      </button>{' '}
                      et la{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenLegal('confidentialite');
                        }}
                        className="text-[#EC4899] underline hover:text-white cursor-pointer"
                      >
                        Politique de Confidentialité
                      </button>
                      .
                    </span>
                  }
                  required
                />
              </div>

              {/* 5. Bouton de finalisation */}
              <button
                type="button"
                onClick={handleFinalizeGoogleOnboarding}
                disabled={isSubmitting || !ageCertifie || !conditionsAcceptees}
                className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#EC4899]/20 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  'Création de votre compte...'
                ) : (
                  <span>
                    Finaliser mon inscription (
                    {selectedForfait === 'GRATUIT'
                      ? 'Forfait Gratuit'
                      : selectedForfait === 'STANDARD'
                      ? 'Forfait Standard'
                      : 'Forfait Premium'}
                    )
                  </span>
                )}
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODE MOT DE PASSE OUBLIÉ (FORGOT) */}
          {/* ========================================================================= */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300">Adresse e-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="votre.email@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#EC4899]/20 transition-all cursor-pointer"
              >
                {isSubmitting ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                  }}
                  className="text-xs text-[#EC4899] hover:underline cursor-pointer"
                >
                  ← Retour à la connexion
                </button>
              </div>
            </form>
          )}

          {/* ========================================================================= */}
          {/* MODE RÉINITIALISATION (RESET AVEC TOKEN) */}
          {/* ========================================================================= */}
          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300">Code de réinitialisation</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="Collez le code reçu par email"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300">Nouveau mot de passe</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="Minimum 10 car., 1 majuscule, 1 chiffre"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#09090B] border border-[#232326] rounded-xl pl-10 pr-10 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-[#EC4899]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-0.5 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-95 shadow-md shadow-[#EC4899]/20 transition-all cursor-pointer"
              >
                {isSubmitting ? 'Mise à jour...' : 'Enregistrer le nouveau mot de passe'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
