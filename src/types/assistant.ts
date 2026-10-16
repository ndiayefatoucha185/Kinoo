export type AssistantRole = 'user' | 'assistant' | 'system';

export type AdminActionType =
  | 'BLOCK_IP'
  | 'FORCE_CLOSE_ROOM'
  | 'SUSPEND_USER'
  | 'SET_MAINTENANCE'
  | 'RESTART_INTEGRATION'
  | 'DISMISS_ALERT';

export interface ProposedAdminAction {
  id: string;
  type: AdminActionType;
  title: string;
  description: string;
  impactNotice: string;
  targetId?: string;
  targetLabel?: string;
  payload?: any;
  confirmed?: boolean;
  rejected?: boolean;
  executedAt?: string;
  dangerLevel: 'low' | 'medium' | 'high';
}

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  text: string;
  timestamp: string;
  proposedAction?: ProposedAdminAction;
  suggestions?: string[];
  reportSummary?: {
    totalUsers: number;
    activeRooms: number;
    pendingReports: number;
    mrrAmount: number;
    integrationIssues: number;
  };
  exportableData?: {
    title: string;
    csvContent: string;
  };
}

export interface ProactiveAnomaly {
  id: string;
  type: 'INTEGRATION_ERROR' | 'HIGH_SYNC_DRIFT' | 'BRUTE_FORCE_ATTACK' | 'PENDING_REPORTS_SURGE';
  severity: 'INFO' | 'AVERTISSEMENT' | 'CRITIQUE';
  titre: string;
  description: string;
  recommandation: string;
  dateDetection: string;
  actionProposee?: ProposedAdminAction;
}
