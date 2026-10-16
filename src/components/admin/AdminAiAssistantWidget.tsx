import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Room,
  Participation,
  PaymentTransaction,
  Signalement,
  AuditLogEvent,
  ExternalIntegration,
  SystemConfig,
} from '../../types/kinoo';
import { AssistantMessage, ProposedAdminAction, ProactiveAnomaly } from '../../types/assistant';
import { AiAssistantService, AssistantContext } from '../../services/aiAssistantService';
import { KinooAiIcon } from './KinooAiIcon';
import {
  Send,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Server,
  CreditCard,
  Trash2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Download,
  FileText,
  Clock,
  RefreshCw,
  ShieldAlert,
  Activity,
  Lock,
  ChevronRight,
  Info,
  X,
} from 'lucide-react';

interface AdminAiAssistantWidgetProps {
  users: User[];
  rooms: Room[];
  participations: Participation[];
  transactions: PaymentTransaction[];
  reports: Signalement[];
  integrations: ExternalIntegration[];
  auditLogs: AuditLogEvent[];
  systemConfig: SystemConfig;
  currentUser: User | null;
  onRefreshAll?: () => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface QuickSuggestionItem {
  id: string;
  title: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
  tag: string;
  tagColor: string;
}

const QUICK_SUGGESTIONS: QuickSuggestionItem[] = [
  {
    id: 'daily-summary',
    title: 'Résumé de la journée',
    prompt: 'Générer un résumé complet de la journée',
    icon: Activity,
    tag: 'Quotidien',
    tagColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    id: 'sync-anomaly',
    title: 'Anomalies de synchronisation des salles',
    prompt: 'Salles avec anomalie de synchronisation',
    icon: Radio,
    tag: 'Technique',
    tagColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  {
    id: 'pending-reports',
    title: 'Signalements en attente à prioriser',
    prompt: 'Signalements en attente à prioriser',
    icon: ShieldAlert,
    tag: 'Modération',
    tagColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  {
    id: 'subscriptions-growth',
    title: 'Évolution des abonnements & conversions',
    prompt: 'Évolution des abonnements ce mois-ci',
    icon: CreditCard,
    tag: 'Finance',
    tagColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    id: 'external-integrations',
    title: 'État des intégrations & API externes',
    prompt: 'État des intégrations externes',
    icon: Server,
    tag: 'API',
    tagColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
];

const SHORT_WELCOME_TEXT = `Bonjour Super Admin. Je suis votre assistant d'aide à la décision connecté en temps réel aux métriques de la plateforme KINOO.

Posez vos questions en langage naturel ou cliquez sur une suggestion rapide à droite pour analyser vos KPI, inspecter l'infrastructure ou modérer les flux.`;

export const AdminAiAssistantWidget: React.FC<AdminAiAssistantWidgetProps> = ({
  users,
  rooms,
  participations,
  transactions,
  reports,
  integrations,
  auditLogs,
  systemConfig,
  currentUser,
  onRefreshAll,
  onToast,
}) => {
  const context: AssistantContext = {
    users,
    rooms,
    participations,
    transactions,
    reports,
    integrations,
    auditLogs,
    systemConfig,
    currentUser,
  };

  const [inputPrompt, setInputPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [actionPendingConfirm, setActionPendingConfirm] = useState<ProposedAdminAction | null>(null);
  const [isCharterModalOpen, setIsCharterModalOpen] = useState(false);

  // Short and airy welcome message (2-3 lines max)
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    {
      id: 'welcome-msg',
      role: 'assistant',
      text: SHORT_WELCOME_TEXT,
      timestamp: new Date().toISOString(),
    },
  ]);

  const [anomalies, setAnomalies] = useState<ProactiveAnomaly[]>([]);
  const topContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isInitialMountRef = useRef<boolean>(true);
  const previousMessagesCountRef = useRef<number>(messages.length);

  // Scan for proactive anomalies on mount and when dependencies update
  useEffect(() => {
    const detected = AiAssistantService.detectAnomalies(context);
    setAnomalies(detected);
  }, [integrations, rooms, reports, auditLogs]);

  // Always display the TOP of the page on initial navigation / mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    topContainerRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });

    const timer = setTimeout(() => {
      isInitialMountRef.current = false;
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll to bottom of chat ONLY when the admin actively sends a message or receives a response while on the page
  useEffect(() => {
    if (isInitialMountRef.current) {
      return;
    }

    if (messages.length > previousMessagesCountRef.current || isThinking) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    previousMessagesCountRef.current = messages.length;
  }, [messages, isThinking]);

  // Handler to submit question
  const handleSendMessage = (textToSend?: string) => {
    const prompt = (textToSend || inputPrompt).trim();
    if (!prompt || isThinking) return;

    // 1. Add user message
    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt('');
    setIsThinking(true);

    // Simulate rapid natural response with data grounding
    setTimeout(() => {
      const response = AiAssistantService.answerQuery(prompt, context);
      setMessages((prev) => [...prev, response]);
      setIsThinking(false);

      if (onToast) {
        onToast('Requête traitée et inscrite au journal d’audit.', 'info');
      }
    }, 450);
  };

  // Handler for explicit action execution with human confirmation
  const handleConfirmAction = (action: ProposedAdminAction) => {
    const result = AiAssistantService.executeConfirmedAction(action, context);
    if (result.success) {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.proposedAction?.id === action.id) {
            return {
              ...msg,
              proposedAction: {
                ...msg.proposedAction,
                confirmed: true,
                executedAt: new Date().toISOString(),
              },
            };
          }
          return msg;
        })
      );

      setActionPendingConfirm(null);
      if (onToast) onToast(result.message, 'success');
      if (onRefreshAll) onRefreshAll();
    }
  };

  const handleDismissAction = (actionId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.proposedAction?.id === actionId) {
          return {
            ...msg,
            proposedAction: {
              ...msg.proposedAction,
              rejected: true,
            },
          };
        }
        return msg;
      })
    );
    setActionPendingConfirm(null);
    if (onToast) onToast('Action ignorée par l’administrateur.', 'info');
  };

  const handleExport = (format: 'pdf' | 'csv', content: string, title?: string) => {
    AiAssistantService.exportReport(format, content, title || 'Rapport_Kinoo_Admin');
    if (onToast) onToast(`Rapport exporté en format ${format.toUpperCase()}.`, 'success');
  };

  const handleClearHistory = () => {
    if (window.confirm('Réinitialiser la conversation de l’Assistant IA ?')) {
      setMessages([
        {
          id: 'welcome-msg-reset',
          role: 'assistant',
          text: SHORT_WELCOME_TEXT,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const activeRoomsCount = rooms.filter((r) => r.statut === 'EN_COURS').length;
  const activeIntegrationsCount = integrations.filter((i) => i.statut === 'ACTIF').length;
  const openReportsCount = reports.filter((r) => r.statut === 'OUVERT').length;
  const totalMRR = transactions
    .filter((t) => t.statut === 'SUCCES')
    .reduce((acc, t) => acc + (t.montant || 0), 0);

  return (
    <div ref={topContainerRef} className="space-y-6">
      {/* Top Banner: Security & Read-Only Status Guarantee */}
      <div className="p-4 rounded-2xl bg-[#11121A] border border-[#202230] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#7C3AED] via-[#EC4899] to-[#3B82F6] p-[2px] shrink-0 shadow-md">
            <div className="w-full h-full rounded-[10px] bg-[#0C0D14] flex items-center justify-center">
              <KinooAiIcon size={20} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight font-['Poppins']">
                Assistant IA KINOO
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Mode Lecture Seule
              </span>
              <button
                type="button"
                onClick={() => setIsCharterModalOpen(true)}
                className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition-colors"
              >
                <ShieldCheck className="w-3 h-3 text-purple-400" />
                <span>Garanties & Capacités</span>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Supervision de maintenance, analyse statistique certifiée et aide à la décision pour Super Admin.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => handleSendMessage('Générer un résumé complet de la journée')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED]/20 to-[#EC4899]/20 hover:from-[#7C3AED]/30 hover:to-[#EC4899]/30 text-white border border-[#7C3AED]/40 transition-all shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#EC4899]" />
            <span>Synthèse du jour</span>
          </button>
          <button
            onClick={handleClearHistory}
            className="p-2 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-[#1C1D27] border border-[#262836] transition-all"
            title="Effacer l'historique de chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Proactive Anomalies Notification Bar */}
      {anomalies.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>
                {anomalies.length} anomalie{anomalies.length > 1 ? 's' : ''} proactive{anomalies.length > 1 ? 's' : ''} détectée{anomalies.length > 1 ? 's' : ''} par l’Assistant
              </span>
            </div>
            <span className="text-[11px] text-amber-400/80">Surveillance en temps réel</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {anomalies.map((anom) => (
              <div
                key={anom.id}
                className="p-3 rounded-xl bg-[#0D0E15]/80 border border-amber-500/20 text-xs flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {anom.titre}
                  </div>
                  <p className="text-gray-300 mt-1 leading-relaxed text-[11px]">{anom.description}</p>
                </div>
                {anom.actionProposee && (
                  <div className="pt-2 border-t border-[#222432] flex items-center justify-between gap-2">
                    <span className="text-[10px] text-amber-300 font-medium">Action suggérée disponible</span>
                    <button
                      onClick={() => {
                        handleSendMessage(`Analyse en détail l'anomalie : ${anom.titre}`);
                      }}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold transition-all"
                    >
                      Examiner
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Layout: Balanced proportions (Chat on 7 cols, Structured Panel on 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Chat Interface (7 cols) */}
        <div className="lg:col-span-7 flex flex-col h-[650px] bg-[#0C0D14] border border-[#1C1D28] rounded-3xl overflow-hidden shadow-2xl">
          {/* Chat Header Bar */}
          <div className="px-5 py-3.5 bg-[#12131D] border-b border-[#1E202E] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-white tracking-wide">
                Session Active • Connecté aux métriques réelles
              </span>
            </div>
            <div className="text-[11px] text-gray-400 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              <span>{new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] p-[1.5px] shrink-0 self-start shadow-md">
                    <div className="w-full h-full rounded-[10px] bg-[#0E0F17] flex items-center justify-center">
                      <KinooAiIcon size={16} />
                    </div>
                  </div>
                )}

                <div
                  className={`max-w-[90%] sm:max-w-[82%] rounded-2xl p-3.5 text-xs leading-relaxed space-y-2.5 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-[#7C3AED] to-[#9333EA] text-white rounded-br-none shadow-md'
                      : 'bg-[#141520] border border-[#242636] text-gray-200 rounded-bl-none shadow-md'
                  }`}
                >
                  {/* Markdown-like formatted content */}
                  <div className="whitespace-pre-wrap space-y-2 font-normal">
                    {msg.text.split('\n\n').map((block, idx) => {
                      if (block.startsWith('### ')) {
                        return (
                          <h4 key={idx} className="text-sm font-bold text-white pt-1 pb-0.5 border-b border-[#2C2E42]">
                            {block.replace('### ', '')}
                          </h4>
                        );
                      }
                      if (block.startsWith('> ')) {
                        return (
                          <blockquote
                            key={idx}
                            className="pl-3 border-l-2 border-[#EC4899] text-gray-300 italic text-[11px] my-1"
                          >
                            {block.replace('> ', '')}
                          </blockquote>
                        );
                      }
                      return <p key={idx}>{block}</p>;
                    })}
                  </div>

                  {/* Export action if report has exportable data */}
                  {msg.exportableData && (
                    <div className="pt-2.5 border-t border-[#27293A] flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-gray-400 font-medium">Export officiel certifié :</div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleExport('csv', msg.exportableData!.csvContent, msg.exportableData!.title)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#202232] hover:bg-[#2A2D42] text-white border border-[#31344B] font-semibold text-[11px] transition-all"
                        >
                          <Download className="w-3 h-3 text-[#3B82F6]" />
                          <span>Export CSV</span>
                        </button>
                        <button
                          onClick={() => handleExport('pdf', msg.text, msg.exportableData!.title)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#202232] hover:bg-[#2A2D42] text-white border border-[#31344B] font-semibold text-[11px] transition-all"
                        >
                          <FileText className="w-3 h-3 text-[#EC4899]" />
                          <span>Export PDF</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Proposed Sensitive Action with Explicit Confirmation Required */}
                  {msg.proposedAction && (
                    <div className="mt-3 p-3.5 rounded-xl bg-[#1A1B28] border-2 border-amber-500/40 text-amber-100 space-y-2.5 shadow-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Action Proposée • Validation requise</span>
                        </div>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {msg.proposedAction.dangerLevel === 'high' ? 'Impact Fort' : 'Impact Modéré'}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="font-semibold text-white text-xs">{msg.proposedAction.title}</div>
                        <p className="text-[11px] text-gray-300">{msg.proposedAction.description}</p>
                        <div className="text-[10px] text-amber-300/80 italic">
                          ⚠️ {msg.proposedAction.impactNotice}
                        </div>
                      </div>

                      {msg.proposedAction.confirmed ? (
                        <div className="pt-2 flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Action confirmée et appliquée le {new Date(msg.proposedAction.executedAt || '').toLocaleTimeString('fr-FR')}</span>
                        </div>
                      ) : msg.proposedAction.rejected ? (
                        <div className="pt-2 flex items-center gap-1.5 text-gray-400 text-xs italic">
                          <XCircle className="w-4 h-4" />
                          <span>Action déclinée par l'administrateur</span>
                        </div>
                      ) : (
                        <div className="pt-2 flex items-center gap-2">
                          <button
                            onClick={() => handleConfirmAction(msg.proposedAction!)}
                            className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-all shadow-md active:scale-95 text-center"
                          >
                            Confirmer et Exécuter
                          </button>
                          <button
                            onClick={() => handleDismissAction(msg.proposedAction!.id)}
                            className="py-1.5 px-3 rounded-lg text-xs font-medium bg-[#242636] hover:bg-[#2E3146] text-gray-300 transition-all"
                          >
                            Ignorer
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[9px] text-gray-500 pt-1 text-right">
                    {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {/* Smart Empty Space Filler: Instant Operational Snapshot shown when no conversation has started yet */}
            {messages.length === 1 && !isThinking && (
              <div className="p-4 rounded-2xl bg-[#11121C]/90 border border-[#232536] space-y-3 mt-2 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#EC4899]" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider font-['Poppins']">
                      Aperçu Opérationnel KINOO • Temps Réel
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                    Système Nominal
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#161724] border border-[#25273A] flex flex-col justify-between">
                    <span className="text-gray-400 text-[11px]">Salles actives</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-base font-bold text-white">{activeRoomsCount}</span>
                      <span className="text-[10px] text-emerald-400 font-medium">Flux direct</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#161724] border border-[#25273A] flex flex-col justify-between">
                    <span className="text-gray-400 text-[11px]">Passerelles API</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-base font-bold text-white">
                        {activeIntegrationsCount} / {integrations.length}
                      </span>
                      <span className="text-[10px] text-blue-400 font-medium">Opérationnelles</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#161724] border border-[#25273A] flex flex-col justify-between">
                    <span className="text-gray-400 text-[11px]">Modération</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-base font-bold text-white">{openReportsCount}</span>
                      <span className={`text-[10px] font-medium ${openReportsCount > 0 ? 'text-rose-400' : 'text-gray-400'}`}>
                        {openReportsCount > 0 ? 'À examiner' : 'À jour'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1F2133] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-400">
                    💡 Cliquez sur une suggestion à droite pour lancer une requête instantanée.
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSendMessage('Générer un résumé complet de la journée')}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-90 text-white transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Lancer le rapport complet</span>
                  </button>
                </div>
              </div>
            )}

            {isThinking && (
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] p-[1.5px] shrink-0">
                  <div className="w-full h-full rounded-[10px] bg-[#0E0F17] flex items-center justify-center">
                    <KinooAiIcon size={16} />
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#141520] border border-[#242636] flex items-center gap-2 text-xs text-gray-400">
                  <RefreshCw className="w-3.5 h-3.5 text-[#EC4899] animate-spin" />
                  <span>Analyse des métriques en lecture seule...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-4 bg-[#10111A] border-t border-[#1E202E]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="Posez une question en langage naturel (ex: Salles avec anomalie de synchro ?)..."
                className="flex-1 bg-[#171824] border border-[#282A3A] focus:border-[#7C3AED] rounded-xl px-4 py-3 text-xs text-white placeholder-gray-500 focus:outline-none transition-all"
                disabled={isThinking}
              />
              <button
                type="submit"
                disabled={!inputPrompt.trim() || isThinking}
                className="p-3 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#EC4899] hover:opacity-90 disabled:opacity-40 text-white font-bold transition-all shadow-md shrink-0 active:scale-95"
                title="Envoyer la requête"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2 px-1">
              <span>Chaque requête et action est journalisée dans le Journal d’audit.</span>
              <span className="font-semibold text-gray-400">Données réelles certifiées</span>
            </div>
          </div>
        </div>

        {/* Right Column: Reorganized into 3 distinct functional sections (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* SECTION 1 (TOP) : ACTION - Suggestions Rapides (Point d'entrée principal mis en avant) */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-b from-[#131422] to-[#0E0F18] border border-[#27293E] shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#EC4899]/15 via-[#7C3AED]/10 to-transparent rounded-bl-full pointer-events-none" />

            <div className="flex items-center justify-between pb-3 border-b border-[#202235]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] flex items-center justify-center shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-['Poppins']">
                    Suggestions Rapides
                  </h3>
                  <p className="text-[10px] text-purple-300/80">Point d'entrée pour démarrer une question</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#EC4899]/15 text-[#EC4899] border border-[#EC4899]/30">
                1 Clic
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {QUICK_SUGGESTIONS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSendMessage(item.prompt)}
                    disabled={isThinking}
                    className="w-full text-left p-2.5 rounded-xl bg-[#161725] hover:bg-[#202235] border border-[#23253A] hover:border-[#7C3AED]/60 text-white transition-all group flex items-center justify-between gap-3 shadow-sm hover:translate-x-0.5 disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#222438] group-hover:bg-[#7C3AED]/25 flex items-center justify-center shrink-0 transition-colors">
                        <Icon className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#EC4899] transition-colors" />
                      </div>
                      <span className="text-xs font-medium text-gray-200 group-hover:text-white truncate">
                        {item.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${item.tagColor}`}>
                        {item.tag}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 2 (MIDDLE) : MONITORING - Flux Lus par l'IA (Mini Dashboard en Temps Réel) */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#090A11] border border-[#1B1D2C] shadow-lg space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#1A1C2C]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#3B82F6]" />
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-['Poppins']">
                    Flux Lus par l'IA
                  </h3>
                  <p className="text-[10px] text-gray-400">Mini-tableau de bord de monitoring</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Direct</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Metric 1 */}
              <div className="p-2.5 rounded-xl bg-[#10121D] border border-[#1E2032] space-y-1">
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <div className="flex items-center gap-1">
                    <Radio className="w-3 h-3 text-emerald-400" />
                    <span>Salles actives</span>
                  </div>
                  <span className="text-emerald-400 font-semibold text-[9px]">Live</span>
                </div>
                <div className="text-sm font-bold text-white">{activeRoomsCount}</div>
              </div>

              {/* Metric 2 */}
              <div className="p-2.5 rounded-xl bg-[#10121D] border border-[#1E2032] space-y-1">
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <div className="flex items-center gap-1">
                    <Server className="w-3 h-3 text-[#3B82F6]" />
                    <span>Passerelles</span>
                  </div>
                  <span
                    className={`font-semibold text-[9px] ${
                      integrations.some((i) => i.statut === 'EN_ERREUR')
                        ? 'text-amber-400'
                        : 'text-blue-400'
                    }`}
                  >
                    {integrations.some((i) => i.statut === 'EN_ERREUR') ? 'Incident' : 'Nominal'}
                  </span>
                </div>
                <div className="text-sm font-bold text-white">
                  {activeIntegrationsCount} / {integrations.length}
                </div>
              </div>

              {/* Metric 3 */}
              <div className="p-2.5 rounded-xl bg-[#10121D] border border-[#1E2032] space-y-1">
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <div className="flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                    <span>Signalements</span>
                  </div>
                  <span
                    className={`font-semibold text-[9px] ${
                      openReportsCount > 0 ? 'text-rose-400' : 'text-gray-500'
                    }`}
                  >
                    {openReportsCount > 0 ? 'À traiter' : '0 ouvert'}
                  </span>
                </div>
                <div className="text-sm font-bold text-white">{openReportsCount}</div>
              </div>

              {/* Metric 4 */}
              <div className="p-2.5 rounded-xl bg-[#10121D] border border-[#1E2032] space-y-1">
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <div className="flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-amber-400" />
                    <span>MRR Total</span>
                  </div>
                  <span className="text-amber-400 font-semibold text-[9px]">Certifié</span>
                </div>
                <div className="text-sm font-bold text-white">{totalMRR} €</div>
              </div>
            </div>

            <div className="pt-1.5 flex items-center justify-between text-[9px] text-gray-500">
              <span>Lecture seule certifiée</span>
              <span className="font-mono">Sync: &lt; 1s</span>
            </div>
          </div>

          {/* SECTION 3 (BOTTOM) : NOTE DISCRÈTE & REPLIABLE - Protocole d'Intégrité Super Admin */}
          <div className="p-3 rounded-2xl bg-[#0D0E16] border border-[#1B1D28] flex items-center justify-between gap-3 text-gray-400">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <span className="text-[11px] truncate">
                Protocole d'Intégrité (Moindre privilège & RGPD)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsCharterModalOpen(true)}
              className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 hover:underline shrink-0 flex items-center gap-1 transition-colors"
            >
              <Info className="w-3 h-3" />
              <span>En savoir plus</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Full AI Capabilities & Integrity Protocol */}
      {isCharterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#0E0F17] border border-[#222436] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#202234]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7C3AED] to-[#EC4899] p-[1.5px] flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Garanties & Capacités de l'Assistant IA</h3>
                  <p className="text-[11px] text-gray-400">Console Super Admin KINOO</p>
                </div>
              </div>
              <button
                onClick={() => setIsCharterModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <div className="p-3 rounded-xl bg-[#141523] border border-[#222538] space-y-1">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  1. Mode Lecture Seule & Moindre Privilège
                </div>
                <p className="text-gray-400 text-[11px]">
                  L'assistant n'applique aucune modification de configuration sans une confirmation manuelle et explicite de votre part.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#141523] border border-[#222538] space-y-1">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  2. Confidentialité & Protection de la Vie Privée
                </div>
                <p className="text-gray-400 text-[11px]">
                  Aucun accès aux conversations privées entre utilisateurs. Seuls les flux de métriques agrégées et les signalements formels sont consultables.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#141523] border border-[#222538] space-y-1">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  3. Traçabilité & Registre d'Audit Immuable
                </div>
                <p className="text-gray-400 text-[11px]">
                  Chaque requête formulée, rapport généré ou action validée est immédiatement horodatée et consignée dans le journal d'audit de la console.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCharterModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#222436] hover:bg-[#2C2E44] text-white transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
