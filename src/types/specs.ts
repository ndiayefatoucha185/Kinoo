export type TabKey = 'architecture' | 'datamodel' | 'permissions' | 'security' | 'backlog' | 'brand';

export interface ArchitectureSection {
  id: string;
  title: string;
  category: string;
  summary: string;
  techChoices: {
    item: string;
    tech: string;
    rationale: string;
  }[];
  details: string[];
}

export interface EntityClass {
  name: string;
  type: 'Entité Racine' | 'Association' | 'Moteur Dédié' | 'Abstraction' | 'Valeur / Événement';
  description: string;
  attributes: {
    name: string;
    type: string;
    visibility: '+' | '-';
    description: string;
  }[];
  methods: {
    name: string;
    returns: string;
    description: string;
  }[];
  relations: string[];
}

export interface PermissionRow {
  resource: string;
  action: string;
  visitor: boolean;
  participant: boolean;
  coHost: boolean;
  host: boolean;
  admin: boolean;
  notes: string;
}

export interface ThreatItem {
  id: string;
  category: 'Spoofing' | 'Tampering' | 'Repudiation' | 'Information Disclosure' | 'Denial of Service' | 'Elevation of Privilege';
  scenario: string;
  target: string;
  impact: 'Critique' | 'Élevé' | 'Moyen';
  countermeasure: string;
  validationCheck: string;
}

export interface BacklogP0Item {
  id: string;
  code: string;
  title: string;
  userStory: string;
  scope: 'P0 - Obligatoire';
  acceptanceCriteria: string[];
  securityNote: string;
  status: 'Spécifié - En attente validation' | 'Prêt pour dev';
}
