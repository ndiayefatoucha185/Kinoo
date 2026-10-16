import { ArchitectureSection, EntityClass, PermissionRow, ThreatItem, BacklogP0Item } from '../types/specs';

export const ARCHITECTURE_SECTIONS: ArchitectureSection[] = [
  {
    id: 'general',
    title: '1. Architecture Globale du Système',
    category: 'Système',
    summary: 'Architecture découplée orientée services, centrée sur la séparation étanche entre le client web/mobile réactif, l’API REST d’autorité métier, et la passerelle temps réel avec horodatage serveur.',
    techChoices: [
      {
        item: 'Frontend Web & Mobile',
        tech: 'React 19 + TypeScript + Vite + Tailwind CSS (PWA responsive)',
        rationale: 'Performance maximale, fluidité 60fps sur desktop/tablette/smartphone, zéro dépendance à des extensions lourdes, compatibilité navigateur native.'
      },
      {
        item: 'Architecture API Backend',
        tech: 'Node.js LTS + Express / Clean Architecture (Domain-Driven Layers)',
        rationale: 'Validation stricte des entrées via Zod/DTO, contrôle d’accès RBAC déclaratif, architecture en couches : Contrôleurs -> Services Métier -> Dépôts -> Modèles OO.'
      },
      {
        item: 'Moteur Temps Réel',
        tech: 'WebSockets avec protocole JSON horodaté & autorité serveur',
        rationale: 'Le serveur est la source de vérité absolue pour l’état de lecture, position T0, gestion des dérives (seuil > 1.2s), heartbeat et resynchronisation idempotente.'
      },
      {
        item: 'Persistance & Base de Données',
        tech: 'Base relationnelle avec migrations versionnées & pool de connexions',
        rationale: 'Garanties ACID pour la cohérence des droits, intégrité référentielle des invitations/participations, isolation des locataires et transactions sécurisées.'
      }
    ],
    details: [
      'Aucun secret ni clé d’API dans le code client : séparation rigoureuse client/serveur.',
      'Serveur d’autorité : les requêtes clientes d’action (play/pause/seek) sont des intentions soumises à validation de rôle, jamais des commandes directes appliquées unilatéralement.',
      'Horloge de synchronisation : calcul de dérive (RTT/2) pour calibrer la position temporelle de chaque client par rapport au temps universel serveur.',
      'Structure modulaire permettant la transition future vers conteneurs Kubernetes, Redis Pub/Sub pour le scaling multi-instances, et applications React Native / Capacitor sans refonte du domaine métier.'
    ]
  },
  {
    id: 'auth_session',
    title: '2. Authentification, Sessions & Sécurité des Accès',
    category: 'Sécurité & Auth',
    summary: 'Système d’authentification durci contre le credential stuffing, avec hashage moderne, sessions révocables et séparation stricte des privilèges.',
    techChoices: [
      {
        item: 'Hashage des Mots de Passe',
        tech: 'Argon2id ou Bcrypt (coût CPU/mémoire calibré)',
        rationale: 'Résistance optimale aux attaques GPU/ASIC, sel cryptographique unique par utilisateur, aucun mot de passe en clair.'
      },
      {
        item: 'Gestion des Sessions',
        tech: 'Jetons de session opaque côté serveur ou JWT signés à courte durée (15 min) + Refresh Tokens avec rotation',
        rationale: 'Révocation immédiate possible par session ou globale (« Déconnecter tous les appareils »), protection contre le vol de jeton.'
      },
      {
        item: 'Cookies de Transport',
        tech: 'HttpOnly, Secure, SameSite=Strict / Lax',
        rationale: 'Protection absolue contre l’exfiltration de jetons de session par scripts tiers ou failles XSS.'
      },
      {
        item: 'Récupération de Compte',
        tech: 'Tokens aléatoires 256 bits à usage unique, durée 15 min, stockés hachés SHA-256',
        rationale: 'Invalidation immédiate après utilisation, réponses génériques pour empêcher l’énumération d’adresses e-mail.'
      }
    ],
    details: [
      'Rate limiting strict sur les endpoints /api/auth/login (5 tentatives/15min par IP/compte) avec blocage exponentiel.',
      'Politique de mot de passe : minimum 10 caractères, au moins 1 majuscule, 1 chiffre, 1 caractère spécial.',
      'Contrôle horizontal (BOLA/IDOR) : chaque requête vérifie que user_id correspond à la ressource demandée ou dispose des droits RBAC explicites.'
    ]
  },
  {
    id: 'sync_engine',
    title: '3. Architecture du Moteur de Synchronisation',
    category: 'Temps Réel & Sync',
    summary: 'Conception orientée état de SessionSynchro avec calcul prédictif et correction de dérive sans à-coups audio/visuel.',
    techChoices: [
      {
        item: 'Modèle d’Autorité',
        tech: 'Serveur Maître / Client Esclave avec réconciliation d’état',
        rationale: 'Empêche toute tricherie ou désynchronisation chaotique entre spectateurs.'
      },
      {
        item: 'Seuils de Tolérance Dérive',
        tech: 'Delta <= 0.8s (toléré) | 0.8s < Delta <= 2s (ajustement vitesse playback 1.05x/0.95x) | Delta > 2s (seek dur)',
        rationale: 'Assure une expérience fluide sans saccades pour les petites fluctuations de réseau mobile.'
      },
      {
        item: 'Reprise après Déconnexion',
        tech: 'Snapshot d’état complet envoyé au client lors du handshake de reconnexion',
        rationale: 'Un participant qui verrouille son smartphone ou subit une perte 4G rattrape instantanément la seconde exacte de la salle.'
      }
    ],
    details: [
      'Protocole d’événements typés : ROOM_PLAY, ROOM_PAUSE, ROOM_SEEK, ROOM_SYNC_PULSE, ROOM_USER_JOINED, ROOM_USER_LEFT.',
      'Chaque paquet contient : serverTimestamp, playbackPosition, playbackState, emitterUserId, roomSequenceNumber.',
      'Protection anti-replay : rejet des paquets dont le sequenceNumber est inférieur ou égal au dernier validé.'
    ]
  },
  {
    id: 'content_strategy',
    title: '4. Gestion Prudente et Légale des Contenus',
    category: 'Contenu & Légalité',
    summary: 'Exclusion stricte de tout contournement DRM. Matrice de compatibilité explicite garantissant l’intégrité juridique du service.',
    techChoices: [
      {
        item: 'Sources Autorisées P0',
        tech: 'Lecteurs officiels via API IFrame / Embeds autorisés (ex: Dailymotion, Vimeo, démos Kinoo et flux publics conformes)',
        rationale: 'Respect des conditions d’utilisation des plateformes partenaires, zéro hébergement illégal de flux protégés.'
      },
      {
        item: 'Isolation des Sources (Pattern Strategy)',
        tech: 'Classe abstraite SourceContenu avec implémentations dédiées (SourceURL, SourceIntegration, SourceImportee)',
        rationale: 'Si une source tierce change son lecteur ou ses conditions, seule sa classe fille est ajustée sans impacter la logique de salle.'
      },
      {
        item: 'Import Vidéo Privé (P1/P2)',
        tech: 'Désactivé par défaut dans le MVP P0 ; spécifié avec quotas stricts, MIME sniffing et URLs signées temporaires',
        rationale: 'Évite les risques de coûts de bande passante non maîtrisés et les litiges de copyright dès le lancement.'
      }
    ],
    details: [
      'Validation stricte des URLs ajoutées en salle : liste blanche de protocoles (https uniquement), validation de domaine et rejet systématique des adresses IP locales/privées (anti-SSRF).',
      'Affichage d’un avertissement clair aux participants précisant la nature de la source et les éventuels prérequis.'
    ]
  },
  {
    id: 'observability',
    title: '5. Observabilité, Journalisation & Résilience',
    category: 'Exploitation & Monitoring',
    summary: 'Traçabilité de bout en bout des requêtes sans collecte excessive ni violation de la vie privée (conformité RGPD / Privacy-by-Design).',
    techChoices: [
      {
        item: 'Logs Structurés',
        tech: 'JSON logs avec Request-ID (X-Request-Id) corrélé',
        rationale: 'Permet de tracer une anomalie d’un participant à travers l’API et le WebSocket sans confusion.'
      },
      {
        item: 'Anonymisation des Données',
        tech: 'Masquage systématique des emails, IPs et mots de passe dans les logs',
        rationale: 'Garantie de non-exposition de données personnelles dans les outils de supervision.'
      },
      {
        item: 'Métriques Clés',
        tech: 'Taux de succès de synchro, RTT moyen, salles actives, échecs auth, signalements',
        rationale: 'Détection précoce des incidents de saturation ou des attaques de force brute.'
      }
    ],
    details: [
      'Gestion gracieuse des erreurs côté client : affichage de messages d’action sans détails techniques internes.',
      'Stratégie de sauvegarde : dumps quotidiens chiffrés avec conservation glissante de 14 jours, tests de restauration trimestriels.',
      'Stratégie de rollback : versionnage strict des livrables et migrations de base de données backward-compatible (pattern Expand-Contract).'
    ]
  }
];

export const ENTITY_CLASSES: EntityClass[] = [
  {
    name: 'Utilisateur',
    type: 'Entité Racine',
    description: 'Représente l’identité du compte, l’authentification et les préférences. Porte les relations vers les participations et les salles créées.',
    attributes: [
      { name: 'id', type: 'UUID', visibility: '-', description: 'Identifiant interne non devinable' },
      { name: 'pseudo', type: 'string (3-30 cars)', visibility: '+', description: 'Nom public affiché dans les salles et le chat' },
      { name: 'email', type: 'string (validé RFC5322)', visibility: '-', description: 'Adresse de contact unique et normalisée' },
      { name: 'motDePasseHash', type: 'string (Argon2id/Bcrypt)', visibility: '-', description: 'Empreinte sécurisée salée' },
      { name: 'statutCompte', type: 'ACTIF | SUSPENDU | EN_ATTENTE', visibility: '+', description: 'État du cycle de vie' },
      { name: 'dateInscription', type: 'DateTime UTC', visibility: '+', description: 'Date de création du profil' },
      { name: 'dernierAcces', type: 'DateTime UTC', visibility: '-', description: 'Horodatage de dernière connexion' }
    ],
    methods: [
      { name: 'creerCompte()', returns: 'Promise<Utilisateur>', description: 'Validation des contraintes et hashage' },
      { name: 'seConnecter(mdp)', returns: 'Promise<SessionToken>', description: 'Vérification à temps constant' },
      { name: 'creerSalle(params)', returns: 'Promise<Salle>', description: 'Instancie une salle dont il devient Hôte' },
      { name: 'rejoindreSalle(code)', returns: 'Promise<Participation>', description: 'Valide l’invitation et crée la participation' }
    ],
    relations: ['1 -> 0..* Salle (créées comme hôte)', '1 -> 0..* Participation', '1 -> 0..1 Abonnement', '1 -> 0..* Notification']
  },
  {
    name: 'Salle',
    type: 'Entité Racine',
    description: 'Cœur du domaine Kinoo. Encapsule une séance de visionnage privée, ses participants, ses règles et son cycle de vie.',
    attributes: [
      { name: 'id', type: 'UUID', visibility: '-', description: 'Identifiant interne système' },
      { name: 'codePublic', type: 'string (8 cars alphanum)', visibility: '+', description: 'Code de salle court pour invitation directe' },
      { name: 'nom', type: 'string (1-60 cars)', visibility: '+', description: 'Titre donné par l’hôte à la séance' },
      { name: 'statut', type: 'PROGRAMMEE | EN_COURS | TERMINEE', visibility: '+', description: 'État de la session' },
      { name: 'estPrivee', type: 'boolean (défaut: true)', visibility: '+', description: 'Indique l’accès restreint par invitation' },
      { name: 'estVerrouillee', type: 'boolean (défaut: false)', visibility: '+', description: 'Verrouillage par l’hôte empêchant de nouveaux entrants' },
      { name: 'maxParticipants', type: 'number (ex: 8 en gratuit)', visibility: '+', description: 'Quota selon le forfait' },
      { name: 'dateCreation', type: 'DateTime UTC', visibility: '+', description: 'Date de création' },
      { name: 'dateFinEffective', type: 'DateTime UTC | null', visibility: '+', description: 'Horodatage de fermeture définitive' }
    ],
    methods: [
      { name: 'demarrer()', returns: 'void', description: 'Passe la salle en statut EN_COURS et initialise la SessionSynchro' },
      { name: 'terminer()', returns: 'void', description: 'Ferme la séance, déconnecte les participants et archive' },
      { name: 'verrouiller(etat)', returns: 'void', description: 'Modifie l’accessibilité d’entrée' },
      { name: 'genererInvitation(params)', returns: 'Promise<Invitation>', description: 'Produit un token révocable' },
      { name: 'retirerParticipant(userId, motif)', returns: 'Promise<void>', description: 'Expulsion par l’hôte avec révocation de session' }
    ],
    relations: ['1 *-- 1..* Participation', '1 *-- 1 SessionSynchro', '1 o-- 1 SourceContenu', '1 *-- 1..* Invitation', '1 -- 1 ParametresSalle']
  },
  {
    name: 'Participation',
    type: 'Association',
    description: 'Modélise la présence d’un utilisateur dans une salle spécifique, son rôle contextuel et ses droits actifs.',
    attributes: [
      { name: 'id', type: 'UUID', visibility: '-', description: 'Identifiant unique de participation' },
      { name: 'role', type: 'HOTE | CO_HOTE | PARTICIPANT', visibility: '+', description: 'Rôle contextuel au sein de cette salle précise' },
      { name: 'dateRejoint', type: 'DateTime UTC', visibility: '+', description: 'Horodatage d’entrée' },
      { name: 'estActif', type: 'boolean', visibility: '+', description: 'Présence en ligne courante' },
      { name: 'estBanni', type: 'boolean', visibility: '-', description: 'Indique une exclusion par l’hôte' }
    ],
    methods: [
      { name: 'promouvoirCoHote()', returns: 'void', description: 'Délégation de modération par l’hôte' },
      { name: 'expulser()', returns: 'void', description: 'Marque estBanni = true et invalide l’accès' }
    ],
    relations: ['Salle * <-> 1 Utilisateur']
  },
  {
    name: 'SessionSynchro',
    type: 'Moteur Dédié',
    description: 'Isolé de Salle pour encapsuler l’état cinématique de la vidéo et garantir une autorité serveur irréfutable sur le temps.',
    attributes: [
      { name: 'id', type: 'UUID', visibility: '-', description: 'Identifiant de session de synchro' },
      { name: 'positionLectureSec', type: 'number (float)', visibility: '+', description: 'Temps courant en secondes' },
      { name: 'etatLecture', type: 'LECTURE | PAUSE | BUFFERING', visibility: '+', description: 'État cinématique en cours' },
      { name: 'vitesseLecture', type: 'number (1.0)', visibility: '+', description: 'Facteur de vitesse' },
      { name: 'dernierSyncAt', type: 'DateTime UTC (ms)', visibility: '+', description: 'Horodatage serveur du dernier repère' },
      { name: 'sequenceNumber', type: 'number (incrémental)', visibility: '+', description: 'Numéro séquentiel pour prévention du replay' }
    ],
    methods: [
      { name: 'appliquerPlay(userId, timestamp)', returns: 'SyncEvent', description: 'Démarre le flux si l’utilisateur a le droit' },
      { name: 'appliquerPause(userId, position)', returns: 'SyncEvent', description: 'Fige la lecture à la position exacte' },
      { name: 'appliquerSeek(userId, targetPos)', returns: 'SyncEvent', description: 'Recale la timeline partagée' },
      { name: 'calculerDerive(clientTime, clientPos)', returns: 'number', description: 'Mesure le delta avec le temps serveur calculé' },
      { name: 'obtenirSnapshot()', returns: 'SessionSnapshot', description: 'Retourne l’état complet pour reconnexion' }
    ],
    relations: ['Composant interne de Salle (1:1)']
  },
  {
    name: 'SourceContenu',
    type: 'Abstraction',
    description: 'Classe de base abstraite appliquant le pattern Strategy pour découpler le lecteur des spécificités techniques et juridiques de chaque fournisseur.',
    attributes: [
      { name: 'id', type: 'string', visibility: '+', description: 'Identifiant de la source' },
      { name: 'titre', type: 'string', visibility: '+', description: 'Titre du contenu' },
      { name: 'dureeSec', type: 'number', visibility: '+', description: 'Durée totale en secondes' },
      { name: 'typeSource', type: 'URL_DIRECTE | INTEGRATION_TIERCE | IMPORT_PRIVE', visibility: '+', description: 'Classification technique' },
      { name: 'estCompatibleWebMobile', type: 'boolean', visibility: '+', description: 'Validation responsive multi-plateformes' }
    ],
    methods: [
      { name: 'verifierCompatibilite(url)', returns: 'Promise<ValidationResult>', description: 'Contrôle légal et technique' },
      { name: 'chargerMetadonnees()', returns: 'Promise<Metadata>', description: 'Extrait titre, durée, vignette sans scraping interdit' }
    ],
    relations: ['Spécialisée par SourceURL, SourceIntegration, SourceImportee (P2)']
  },
  {
    name: 'Invitation',
    type: 'Entité Racine',
    description: 'Gère la création de liens et codes temporaires d’accès, garantissant la révocabilité et l’expiration.',
    attributes: [
      { name: 'id', type: 'UUID', visibility: '-', description: 'Identifiant interne' },
      { name: 'tokenAleatoire', type: 'string (crypto-secure 32 octets)', visibility: '-', description: 'Clé d’accès secrète dans l’URL' },
      { name: 'codeCourt', type: 'string (8 cars majuscules/chiffres)', visibility: '+', description: 'Code de partage manuel' },
      { name: 'dateExpiration', type: 'DateTime UTC', visibility: '+', description: 'Limite de validité' },
      { name: 'estRevocable', type: 'boolean (true)', visibility: '+', description: 'Autorise l’hôte à annuler le lien' },
      { name: 'estRevoquee', type: 'boolean (défaut: false)', visibility: '+', description: 'Indique si l’invitation a été invalidée' },
      { name: 'nbUtilisations', type: 'number', visibility: '+', description: 'Compteur d’entrées' }
    ],
    methods: [
      { name: 'validerToken(token)', returns: 'boolean', description: 'Vérifie non-expiration et non-révocation' },
      { name: 'revoquer(userId)', returns: 'void', description: 'Révocation immédiate par l’hôte' }
    ],
    relations: ['Liée à une Salle unique (1:1..*)']
  },
  {
    name: 'MessageChat & Reaction',
    type: 'Valeur / Événement',
    description: 'Véhicule les échanges textuels et réactions expressives en salle sans perturber le lecteur vidéo.',
    attributes: [
      { name: 'id', type: 'UUID', visibility: '-', description: 'Identifiant du message' },
      { name: 'auteurPseudo', type: 'string', visibility: '+', description: 'Nom de l’expéditeur' },
      { name: 'auteurId', type: 'UUID', visibility: '-', description: 'Lien vers l’utilisateur émetteur' },
      { name: 'contenu', type: 'string (1-300 cars)', visibility: '+', description: 'Texte assaini anti-XSS' },
      { name: 'horodatage', type: 'DateTime UTC (ms)', visibility: '+', description: 'Heure d’envoi' },
      { name: 'estMasque', type: 'boolean', visibility: '+', description: 'Statut de modération' }
    ],
    methods: [
      { name: 'assainirEtValider()', returns: 'boolean', description: 'Escape HTML, contrôle de longueur et fréquence' }
    ],
    relations: ['Appartient à une Salle donnée']
  },
  {
    name: 'Signalement',
    type: 'Entité Racine',
    description: 'Fondation de sécurité et conformité permettant aux participants de signaler un comportement abusif ou un contenu problématique.',
    attributes: [
      { name: 'id', type: 'UUID', visibility: '-', description: 'Identifiant du signalement' },
      { name: 'salleId', type: 'UUID', visibility: '+', description: 'Salle concernée' },
      { name: 'signaleurId', type: 'UUID', visibility: '-', description: 'Auteur du signalement' },
      { name: 'cibleType', type: 'PARTICIPANT | MESSAGE | CONTENU', visibility: '+', description: 'Nature de l’élément signalé' },
      { name: 'motif', type: 'string', visibility: '+', description: 'Description du problème' },
      { name: 'statut', type: 'OUVERT | EN_COURS | TRAITE | REJETE', visibility: '+', description: 'Suivi de traitement de sécurité' }
    ],
    methods: [
      { name: 'enregistrer()', returns: 'Promise<void>', description: 'Stocke avec journalisation d’audit' }
    ],
    relations: ['Lié à une Salle et un Utilisateur']
  }
];

export const PERMISSIONS_MATRIX: PermissionRow[] = [
  {
    resource: 'Salle',
    action: 'Créer une salle immédiate',
    visitor: false,
    participant: true,
    coHost: true,
    host: true,
    admin: true,
    notes: 'Requiert un compte actif dans la limite des quotas du plan'
  },
  {
    resource: 'Salle',
    action: 'Rejoindre via lien ou code',
    visitor: true,
    participant: true,
    coHost: true,
    host: true,
    admin: true,
    notes: 'Le visiteur accède à l’écran d’accueil de la salle et est invité à se connecter/nommer'
  },
  {
    resource: 'Salle',
    action: 'Verrouiller / Déverrouiller la salle',
    visitor: false,
    participant: false,
    coHost: true,
    host: true,
    admin: true,
    notes: 'Empêche tout nouvel arrivant d’entrer même avec le lien'
  },
  {
    resource: 'Salle',
    action: 'Expulser un participant',
    visitor: false,
    participant: false,
    coHost: true,
    host: true,
    admin: true,
    notes: 'Révocation immédiate de la session du participant expulsé'
  },
  {
    resource: 'Salle',
    action: 'Terminer définitivement la séance',
    visitor: false,
    participant: false,
    coHost: false,
    host: true,
    admin: true,
    notes: 'Action exclusive de l’hôte propriétaire'
  },
  {
    resource: 'Lecture',
    action: 'Contrôler la lecture (Play, Pause, Seek)',
    visitor: false,
    participant: false,
    coHost: true,
    host: true,
    admin: true,
    notes: 'Réservé par défaut à l’hôte pour éviter les conflits d’autorité'
  },
  {
    resource: 'Lecture',
    action: 'Demander une resynchronisation manuelle',
    visitor: false,
    participant: true,
    coHost: true,
    host: true,
    admin: true,
    notes: 'Recale le client local sur l’état officiel du serveur sans altérer les autres'
  },
  {
    resource: 'Chat & Réactions',
    action: 'Envoyer un message texte',
    visitor: false,
    participant: true,
    coHost: true,
    host: true,
    admin: true,
    notes: 'Soumis au rate limit (ex: max 1 msg/sec, 300 cars)'
  },
  {
    resource: 'Chat & Réactions',
    action: 'Désactiver le chat pour la salle',
    visitor: false,
    participant: false,
    coHost: true,
    host: true,
    admin: true,
    notes: 'Option hôte pour les séances de concentration'
  },
  {
    resource: 'Invitations',
    action: 'Générer ou copier le lien / code',
    visitor: false,
    participant: false,
    coHost: true,
    host: true,
    admin: true,
    notes: 'L’hôte choisit s’il partage le lien avec ses proches'
  },
  {
    resource: 'Invitations',
    action: 'Révoquer un lien d’invitation actif',
    visitor: false,
    participant: false,
    coHost: false,
    host: true,
    admin: true,
    notes: 'Invalide immédiatement le token existant'
  },
  {
    resource: 'Modération',
    action: 'Signaler un utilisateur ou contenu',
    visitor: true,
    participant: true,
    coHost: true,
    host: true,
    admin: true,
    notes: 'Accessible à tous pour protéger la communauté'
  }
];

export const THREAT_MODEL: ThreatItem[] = [
  {
    id: 'STRIDE-01',
    category: 'Elevation of Privilege',
    scenario: 'Un participant manipule la requête HTTP ou le message WebSocket pour s’octroyer le rôle Hôte ou envoyer des commandes de lecture.',
    target: 'API /rooms/:id et Passerelle WebSocket',
    impact: 'Critique',
    countermeasure: 'Le serveur résout l’identité à partir de la session signée et vérifie le rôle Hôte en base/mémoire sur chaque événement avant traitement. Le payload client est ignoré pour les attributs de rôle.',
    validationCheck: 'Test unitaire : injection de { role: "HOTE" } dans le payload -> rejet 403 Forbidden.'
  },
  {
    id: 'STRIDE-02',
    category: 'Tampering',
    scenario: 'Injection de scripts XSS dans les messages de chat pour voler des sessions de participants connectés.',
    target: 'Composant Chat & Stream WebSocket',
    impact: 'Élevé',
    countermeasure: 'Échappement et assainissement strict des caractères HTML côté serveur et rendu React sécurisé sans dangerouslySetInnerHTML. Cookies de session HttpOnly stricts.',
    validationCheck: 'Test d’intégration : envoi de <script>alert(1)</script> -> affiché comme chaîne brute désarmée.'
  },
  {
    id: 'STRIDE-03',
    category: 'Denial of Service',
    scenario: 'Spam massif de requêtes de création de salle ou inondation du chat par des bots.',
    target: 'Endpoints /api/rooms et sockets de salle',
    impact: 'Élevé',
    countermeasure: 'Rate limiting applicatif via Token Bucket (ex: 5 créations de salle/heure par utilisateur, 1 message/seconde/socket, 50 msg max par fenêtre).',
    validationCheck: 'Test de charge : 20 messages en 5 secondes -> statut 429 Too Many Requests déclenché.'
  },
  {
    id: 'STRIDE-04',
    category: 'Information Disclosure',
    scenario: 'Un attaquant force l’accès à une salle privée en devinant des identifiants séquentiels simples.',
    target: 'Génération des identifiants et liens d’invitation',
    impact: 'Élevé',
    countermeasure: 'Génération de tokens cryptographiques aléatoires (UUID v4 + token 256 bits URL-safe). Aucune clé séquentielle publique.',
    validationCheck: 'Audit d’entropie : espace de recherche > 2^128, impossibilité de deviner un lien valide.'
  },
  {
    id: 'STRIDE-05',
    category: 'Tampering',
    scenario: 'Rejeu d’anciens événements WebSocket (play/pause) pour désynchroniser les autres spectateurs.',
    target: 'Moteur SessionSynchro',
    impact: 'Moyen',
    countermeasure: 'Horodatage strict côté serveur et numérotation séquentielle monotone des paquets de contrôle. Rejet des numéros inférieurs.',
    validationCheck: 'Test de rejeu : réémission d’un paquet avec sequence_id antérieur -> drop silencieux et log sécurité.'
  },
  {
    id: 'STRIDE-06',
    category: 'Spoofing',
    scenario: 'Un participant expulsé par l’hôte tente de se reconnecter immédiatement avec son lien en mémoire cache.',
    target: 'Table Participation et contrôleur de connexion WebSocket',
    impact: 'Élevé',
    countermeasure: 'Lors de l’expulsion, le statut de participation passe à estBanni = true et le jeton de présence est révoqué côté serveur. Toute tentative de reconnexion est rejetée au handshake.',
    validationCheck: 'Test E2E : expulsion puis reconnexion WebSocket -> fermeture immédiate avec code 4003 (Kicked).'
  }
];

export const BACKLOG_P0: BacklogP0Item[] = [
  {
    id: 'P0-01',
    code: 'US-AUTH-01',
    title: 'Inscription et Connexion sécurisée',
    userStory: 'En tant qu’utilisateur, je veux créer un compte avec un pseudonyme, email et mot de passe robuste afin de pouvoir créer ou rejoindre des séances.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Formulaire avec validation en direct (pseudo 3-30 cars, email valide, mot de passe >= 10 cars)',
      'Hashage côté serveur (Argon2id/Bcrypt) avec zéro stockage en clair',
      'Session gérée via token sécurisé et déconnexion opérationnelle',
      'Affichage d’un message d’erreur générique en cas d’échec d’authentification'
    ],
    securityNote: 'Rate limiting anti-brute force activé.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-02',
    code: 'US-AUTH-02',
    title: 'Gestion minimale du Profil & Déconnexion',
    userStory: 'En tant qu’utilisateur connecté, je veux consulter mon pseudonyme, mon adresse email et me déconnecter proprement.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Visualisation du profil actif',
      'Action de déconnexion invalidant la session côté client et serveur',
      'Redirection automatique vers l’écran d’accueil'
    ],
    securityNote: 'Invalidation du jeton côté serveur lors du logout.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-03',
    code: 'US-ROOM-01',
    title: 'Création d’une Salle Privée Immédiate',
    userStory: 'En tant qu’hôte, je veux créer une salle en renseignant un titre et en sélectionnant un contenu compatible pour démarrer immédiatement une séance.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Parcours court : Titre de la séance, choix de la source compatible, options de confidentialité',
      'Génération d’un identifiant sécurisé non devinable et d’un code d’accès court',
      'L’utilisateur créateur est automatiquement assigné au rôle Hôte',
      'Application automatique du quota de participants (ex: 8)'
    ],
    securityNote: 'Rôle d’hôte assigné uniquement côté serveur lors de la persistance.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-04',
    code: 'US-ROOM-02',
    title: 'Génération et Révocation de Lien d’Invitation',
    userStory: 'En tant qu’hôte, je veux générer un lien d’invitation et un code de salle, et pouvoir le révoquer si nécessaire.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Bouton de copie du lien et du code en un clic avec confirmation visuelle',
      'Option de révocation immédiate du lien actif',
      'Un lien révoqué affiche un message explicatif clair sans fuite de données'
    ],
    securityNote: 'Token cryptographique 256 bits dans l’URL.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-05',
    code: 'US-ROOM-03',
    title: 'Rejoindre une Salle via Lien ou Code',
    userStory: 'En tant qu’invité, je veux cliquer sur un lien reçu ou saisir un code pour accéder directement à la salle de visionnage.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Écran d’accueil de salle affichant le titre, le nom de l’hôte, le statut et le nombre de participants',
      'Gestion claire si la salle est verrouillée ou pleine',
      'Ajout automatique à la liste des participants actifs'
    ],
    securityNote: 'Contrôle strict de capacité et de validité de token.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-06',
    code: 'US-SYNC-01',
    title: 'Lecture Synchronisée d’un Contenu Compatible',
    userStory: 'En tant que groupe dans une salle, nous voulons voir la vidéo démarrer, se mettre en pause et avancer au même moment.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Intégration d’une source vidéo officiellement compatible et légale',
      'Les commandes de l’hôte (Play, Pause, Seek) sont propagées en moins de 250ms',
      'Affichage de l’état de synchronisation en direct (En synchro / Recalage)'
    ],
    securityNote: 'Commandes de lecture réservées au rôle Hôte côté serveur.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-07',
    code: 'US-SYNC-02',
    title: 'Résynchronisation et Gestion des Retards',
    userStory: 'En tant que participant ayant subi un ralentissement ou une mise en veille, je veux être recalé automatiquement ou via un bouton dédié.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Détection automatique de dérive supérieure au seuil défini (> 1.5s)',
      'Bouton de resynchronisation manuelle en un clic',
      'Rattrapage instantané sur la position exacte du serveur'
    ],
    securityNote: 'Protection anti-tempête de requêtes de sync.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-08',
    code: 'US-ROOM-04',
    title: 'Contrôles de l’Hôte (Verrouillage, Retrait, Fin de Séance)',
    userStory: 'En tant qu’hôte, je veux garder la maîtrise totale de ma salle en pouvant la verrouiller, expulser un indésirable et clore la séance.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Interrupteur de verrouillage de salle',
      'Menu contextuel sur chaque participant avec option « Retirer »',
      'Bouton « Terminer la séance » fermant proprement la salle pour tout le monde'
    ],
    securityNote: 'Déconnexion immédiate du socket du participant banni.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-09',
    code: 'US-CHAT-01',
    title: 'Chat Texte Temps Réel en Salle',
    userStory: 'En tant que spectateur, je veux échanger des messages avec les autres participants sans masquer la vidéo.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Zone de discussion intégrée fluide sur desktop et smartphone',
      'Affichage du pseudo, du message assaini et de l’horodatage',
      'Limitation de longueur (300 caractères) et cadence (rate-limit)',
      'Option hôte pour désactiver ou limiter le chat si besoin'
    ],
    securityNote: 'Assainissement XSS obligatoire côté serveur.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-10',
    code: 'US-CHAT-02',
    title: 'Réactions Expressives Simples',
    userStory: 'En tant que spectateur, je veux envoyer une réaction rapide (emoji cœur, rire, applaudissement) qui apparaît brièvement à l’écran.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Barre de 4 à 6 réactions rapides prédéfinies',
      'Animation discrète au-dessus du chat ou du lecteur sans gêner le visionnage',
      'Limitation de fréquence pour éviter le spam visuel'
    ],
    securityNote: 'Rate limiting strict (max 2 réactions/sec).',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-11',
    code: 'US-SAFE-01',
    title: 'Signalement d’un Problème ou d’un Participant',
    userStory: 'En tant qu’utilisateur, je veux pouvoir signaler un message, un participant ou un contenu litigieux afin d’assurer la sécurité.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Bouton de signalement accessible dans la salle et sur les messages',
      'Formulaire simple de motif de signalement',
      'Confirmation de prise en charge et journalisation d’audit'
    ],
    securityNote: 'Journalisation sécurisée sans données bancaires ni secrets.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-12',
    code: 'US-PLAN-01',
    title: 'Page Tarifs et Quotas Transparents',
    userStory: 'En tant que visiteur ou utilisateur, je veux consulter clairement le forfait gratuit, les limites de participants et les fonctionnalités prévues.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Présentation claire du forfait gratuit et de ses limites explicites',
      'Transparence sur les futurs forfaits et fonctionnalités',
      'Aucun prix définitif trompeur avant validation'
    ],
    securityNote: 'Clarté légale et conformité aux règles de protection du consommateur.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-13',
    code: 'US-LEGAL-01',
    title: 'Pages Légales et Matrice de Compatibilité',
    userStory: 'En tant qu’utilisateur, je veux accéder aux CGU, à la politique de confidentialité et à la liste des sources officiellement compatibles.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Pages accessibles depuis le pied de page : CGU, Confidentialité, Mentions légales, Support',
      'Matrice des sources compatibles détaillant les prérequis techniques',
      'Engagement explicite de non-contournement des DRM'
    ],
    securityNote: 'Conformité RGPD et clarté contractuelle.',
    status: 'Spécifié - En attente validation'
  },
  {
    id: 'P0-14',
    code: 'US-RESP-01',
    title: 'Expérience Responsive Web & Mobile',
    userStory: 'En tant qu’utilisateur sur smartphone ou tablette, je veux une interface parfaitement adaptée à mon écran tactile.',
    scope: 'P0 - Obligatoire',
    acceptanceCriteria: [
      'Boutons tactiles avec cible minimale >= 44px',
      'Mode portrait (lecteur au-dessus, chat en dessous) et mode paysage immersif',
      'Temps de chargement optimisé sur réseau 4G standard'
    ],
    securityNote: 'Aucune dépendance d’extension tierce requise sur mobile.',
    status: 'Spécifié - En attente validation'
  }
];
