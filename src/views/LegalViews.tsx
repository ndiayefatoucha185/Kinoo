import React, { useState } from 'react';
import { COMPATIBLE_SOURCES } from '../data/mockContents';
import { ShieldCheck, Lock, FileText, CheckCircle2, AlertTriangle, ExternalLink, Download, Trash2, ShieldAlert, Scale, UserCheck } from 'lucide-react';

interface LegalViewsProps {
  initialTab?: string;
  onOpenCreateRoom: () => void;
}

export const LegalViews: React.FC<LegalViewsProps> = ({ initialTab = 'cgu', onOpenCreateRoom }) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6 sm:py-10">
      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#232326] scrollbar-none text-xs font-semibold">
        <button
          onClick={() => setActiveTab('cgu')}
          className={`px-4 py-2 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'cgu'
              ? 'bg-[#232326] text-white border border-[#EC4899]/50'
              : 'text-[#B8B4C0] hover:text-white'
          }`}
        >
          Conditions Générales (CGU)
        </button>
        <button
          onClick={() => setActiveTab('confidentialite')}
          className={`px-4 py-2 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'confidentialite'
              ? 'bg-[#232326] text-white border border-[#EC4899]/50'
              : 'text-[#B8B4C0] hover:text-white'
          }`}
        >
          Politique de Confidentialité (RGPD)
        </button>
        <button
          onClick={() => setActiveTab('compatibility')}
          className={`px-4 py-2 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'compatibility'
              ? 'bg-[#232326] text-white border border-[#EC4899]/50'
              : 'text-[#B8B4C0] hover:text-white'
          }`}
        >
          Matrice de Compatibilité
        </button>
        <button
          onClick={() => setActiveTab('gestion_contenus')}
          className={`px-4 py-2 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'gestion_contenus'
              ? 'bg-[#232326] text-white border border-[#EC4899]/50'
              : 'text-[#B8B4C0] hover:text-white'
          }`}
        >
          Gestion des Contenus & Droits
        </button>
        <button
          onClick={() => setActiveTab('mentions')}
          className={`px-4 py-2 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'mentions'
              ? 'bg-[#232326] text-white border border-[#EC4899]/50'
              : 'text-[#B8B4C0] hover:text-white'
          }`}
        >
          Mentions Légales
        </button>
      </div>

      {/* CGU */}
      {activeTab === 'cgu' && (
        <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 space-y-6 text-xs text-[#B8B4C0] leading-relaxed">
          <div className="border-b border-[#232326] pb-4 space-y-1">
            <h2 className="text-xl font-bold text-white">Conditions Générales d’Utilisation (CGU)</h2>
            <p className="text-[11px] text-gray-400">Dernière révision officielle : Septembre 2026 — En vigueur pour tous les utilisateurs de KINOO.</p>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#EC4899]" />
              <span>1. Objet et Cadre du Service</span>
            </h3>
            <p>
              KINOO est une plateforme technologique permettant la coordination et la synchronisation temporelle de lecture vidéo à distance
              exclusivement au sein de cercles privés (famille, amis, collègues). KINOO n’est en aucun cas un diffuseur de contenus protégés non autorisés
              ni un service public d'hébergement audiovisuel.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#EC4899]" />
              <span>2. Interdiction Formelle de Contournement de DRM et Mesures Techniques</span>
            </h3>
            <p>
              Il est expressément interdit à tout utilisateur de KINOO :
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-gray-300">
              <li>De tenter de contourner, désactiver ou altérer toute mesure technique de protection (MTP / DRM tels que Widevine, FairPlay, PlayReady) équipant une vidéo ou un service tiers.</li>
              <li>D'injecter des flux pirates, des liens de streaming illégaux ou des fichiers obtenus en violation du droit d'auteur.</li>
              <li>D'utiliser KINOO à des fins de rediffusion publique, commerciale ou payante sans accord des ayants droit.</li>
            </ul>
            <p>
              Seuls sont autorisés : les fichiers personnels détenus légitimement par l'utilisateur, les vidéos sous licences Creative Commons / Domaine Public, 
              les flux YouTube conformes à l'API publique et les sources officiellement vérifiées par KINOO.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#EC4899]" />
              <span>3. Règles de Contenu, Modération et Pouvoirs de l’Hôte</span>
            </h3>
            <p>
              Les salons KINOO sont des espaces privés mais soumis au respect absolu de la loi et de la dignité humaine :
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-gray-300">
              <li><strong>Tolérance zéro :</strong> Sont formellement prohibés tout propos ou média haineux, raciste, homophobe, diffamatoire, violent ou à caractère pédopornographique (CSAM).</li>
              <li><strong>Rôle de l'Hôte :</strong> L'utilisateur créateur du salon dispose du droit et du devoir de modérer son espace. Il peut verrouiller le salon par code PIN, expulser tout participant indésirable et couper la prise de parole.</li>
              <li><strong>Signalement communautaire :</strong> Tout participant peut émettre un signalement direct qui remonte en temps réel à l'équipe de modération de KINOO. Les signalements sont instruits sous un délai maximum de 24 heures.</li>
              <li><strong>Sanctions :</strong> Toute violation entraîne la suspension immédiate du salon et la clôture définitive du compte de l'auteur sans préavis.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#EC4899]" />
              <span>4. Âge Minimum Requis (16 ans révolus)</span>
            </h3>
            <p>
              L'utilisation des services de KINOO et la création d'un compte sont strictement réservées aux personnes âgées d'au moins <strong>16 ans révolus</strong>.
            </p>
            <div className="p-3 bg-[#09090B] border border-[#232326] rounded-xl text-gray-300 space-y-1">
              <strong className="text-white block">Justification légale et technique du seuil de 16 ans :</strong>
              <p>
                Ce seuil correspond au standard européen de consentement numérique autonome fixé par l'article 8 du Règlement Général sur la Protection des Données (RGPD). La combinaison de fonctionnalités interactives (communication vocale et vidéo en direct jusqu'à 250 participants en formule Premium) et de gestion d'abonnements justifie le respect rigoureux de ce cadre protecteur.
              </p>
            </div>
            <p className="text-gray-400">
              Lors de l'inscription, chaque utilisateur doit obligatoirement et explicitement certifier avoir 16 ans ou plus via une case dédiée. Tout compte créé par ou pour une personne n'ayant pas atteint l'âge de 16 ans révolus fera l'objet d'une résiliation immédiate et d'une purge irréversible des données associées.
            </p>
          </section>
        </div>
      )}

      {/* Privacy Policy */}
      {activeTab === 'confidentialite' && (
        <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 space-y-6 text-xs text-[#B8B4C0] leading-relaxed">
          <div className="border-b border-[#232326] pb-4 space-y-1">
            <h2 className="text-xl font-bold text-white">Politique de Confidentialité & Protection des Données Personnelles</h2>
            <p className="text-[11px] text-gray-400">
              Conformité stricte avec le Règlement Général sur la Protection des Données (RGPD 2016/679) et la Loi sénégalaise n° 2008-12.
            </p>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">1. Données Réellement Collectées</h3>
            <p>
              KINOO applique le principe fondamental de <strong>minimisation des données</strong>. Nous ne collectons que ce qui est techniquement indispensable :
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-[#09090B] border border-[#232326] rounded-xl space-y-1 col-span-full">
                <strong className="text-white block">Intégration YouTube & Mode Confidentialité Renforcée (youtube-nocookie.com)</strong>
                <p className="text-gray-400">Lorsqu'une séance implique une vidéo YouTube, l'API et le lecteur sont appelés exclusivement via le domaine à confidentialité renforcée <code>youtube-nocookie.com</code>, sans aucun chargement préalable sur le reste de la plateforme. Ce mode empêche YouTube de déposer des cookies de profilage tant que l'utilisateur ne rejoint pas la séance.</p>
              </div>
              <div className="p-3 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <strong className="text-white block">Données de Compte</strong>
                <p className="text-gray-400">Pseudonyme public, adresse e-mail valide, empreinte cryptographique de mot de passe salée (bcrypt cost 10), photo de profil ou avatar choisi.</p>
              </div>
              <div className="p-3 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <strong className="text-white block">Salons & Séances</strong>
                <p className="text-gray-400">Identifiant et nom de la séance, code d'accès à 6 caractères, URL ou référence du média synchronisé, statut hôte/spectateur.</p>
              </div>
              <div className="p-3 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <strong className="text-white block">Messages Éphémères</strong>
                <p className="text-gray-400">Messages textuels échangés pendant la séance, horodatés et supprimés lors de la clôture du salon.</p>
              </div>
              <div className="p-3 bg-[#09090B] border border-[#232326] rounded-xl space-y-1">
                <strong className="text-white block">Sécurité & Paiements</strong>
                <p className="text-gray-400">Jetons de session HttpOnly signés JWT. Aucun numéro complet de carte bancaire n'est jamais stocké ni transité sur nos serveurs.</p>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">2. Vos Droits Réellement Implémentés dans KINOO</h3>
            <p>
              Contrairement à de simples déclarations d'intention, KINOO dispose de fonctionnalités directes et autonomes pour exercer vos droits :
            </p>
            <ul className="space-y-2 pt-1">
              <li className="p-3 bg-[#09090B] border border-[#232326] rounded-xl flex items-start gap-3">
                <Download className="w-4 h-4 text-[#EC4899] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Droit d'Accès et de Portabilité (Art. 15 & 20 RGPD)</strong>
                  <span>Depuis vos paramètres de profil ou le bandeau de pied de page, vous pouvez télécharger en un clic l'intégralité de vos données personnelles au format structuré JSON (profil, salons créés, participations, tickets support).</span>
                </div>
              </li>
              <li className="p-3 bg-[#09090B] border border-[#232326] rounded-xl flex items-start gap-3">
                <Trash2 className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Droit à l'Effacement Définitif / Droit à l'Oubli (Art. 17 RGPD)</strong>
                  <span>Vous disposez d'un bouton de suppression immédiate de compte. Cette action purge irrémédiablement en cascade vos données de notre base PostgreSQL de production, révoque vos jetons d'accès et anonymise vos participations passées.</span>
                </div>
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">2b. Conservation Anonymisée des Sanctions de Modération (Art. 17.3.e RGPD)</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              En cas de suppression de compte par un utilisateur ayant fait l&apos;objet d&apos;une mesure formelle de modération (avertissement, suspension ou bannissement pour comportement abusif), l&apos;intégralité des données personnelles identifiantes (pseudo, adresse e-mail, messages) est immédiatement et irréversiblement détruite.
            </p>
            <div className="bg-[#09090B] border border-[#232326] p-3 rounded-xl text-xs text-gray-400 space-y-1">
              <p className="text-gray-200 font-semibold">Cadre d&apos;application strict (Art. 17.3.e RGPD) :</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Public concerné :</strong> Uniquement les utilisateurs ayant reçu une sanction disciplinaire avérée. Les utilisateurs non sanctionnés sont intégralement purgés sans aucune trace.</li>
                <li><strong>Données minimisées :</strong> Un identifiant non réversible calculé par HMAC avec clé secrète serveur (protégeant contre toute attaque par dictionnaire), la date, le motif générique et la mesure prise. Aucun pseudo, e-mail ou message n&apos;est conservé.</li>
                <li><strong>Notre durée de conservation :</strong> 12 mois (notre durée de conservation définie pour la prévention de la récidive et l'exercice des droits). Une tâche automatique purge définitivement toute archive dont l&apos;échéance est atteinte.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">3. Cookies et Traceurs</h3>
            <p>
              KINOO n'utilise aucun cookie publicitaire tiers ni dispositif invasif de pistage inter-sites. Seuls sont déposés :
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-gray-300">
              <li><strong>Cookies techniques essentiels :</strong> Maintien de votre session sécurisée (<code className="text-[#EC4899]">kinoo_auth_token</code>) et mémorisation de votre choix de consentement.</li>
              <li><strong>Mesure d'audience anonymisée (optionnelle) :</strong> Activée uniquement si vous l'acceptez explicitement sur le bandeau de consentement, sans transmission à des régies publicitaires.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">4. Contact du Délégué à la Protection des Données (DPO)</h3>
            <p>
              Pour toute question relative à vos données personnelles ou pour exercer vos droits par écrit : <br />
              <strong className="text-white">Email du DPO :</strong> <a href="mailto:dpo@kinoo.app" className="text-[#EC4899] underline">dpo@kinoo.app</a>
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">5. Protection des Personnes Mineures & Absence de Collecte</h3>
            <p>
              Conformément à nos CGU, les services KINOO sont formellement réservés aux personnes âgées de 16 ans et plus. KINOO ne traite ni ne conserve sciemment aucune donnée à caractère personnel relative à des personnes de moins de 16 ans. Si vous apprenez qu'un utilisateur n'ayant pas atteint cet âge a ouvert un compte sur la plateforme en fournissant de fausses déclarations, contactez sans délai <a href="mailto:dpo@kinoo.app" className="text-[#EC4899] underline">dpo@kinoo.app</a> afin que le profil et ses données soient immédiatement et définitivement purgés.
            </p>
          </section>
        </div>
      )}

      {/* Compatibility Matrix */}
      {activeTab === 'compatibility' && (
        <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white">Matrice Officielle de Compatibilité des Contenus</h2>
            <p className="text-xs text-[#B8B4C0] mt-1">
              Sources vérifiées et garanties compatibles pour la synchronisation multi-écrans Kinoo sans extension.
            </p>
          </div>

          <div className="overflow-x-auto border border-[#232326] rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#09090B] border-b border-[#232326] text-[#B8B4C0]">
                  <th className="p-3.5 font-semibold">Titre / Source</th>
                  <th className="p-3.5 font-semibold">Genre</th>
                  <th className="p-3.5 font-semibold">Fournisseur & Licence</th>
                  <th className="p-3.5 font-semibold">Statut MVP</th>
                  <th className="p-3.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232326]">
                {COMPATIBLE_SOURCES.map((c) => (
                  <tr key={c.id} className="hover:bg-[#1a1a1f] transition-colors">
                    <td className="p-3.5 font-bold text-white">{c.titre}</td>
                    <td className="p-3.5 text-[#EC4899]">{c.genre}</td>
                    <td className="p-3.5 text-[#B8B4C0]">{c.licence}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
                        Compatible 100%
                      </span>
                    </td>
                    <td className="p-3.5">
                      <button
                        onClick={onOpenCreateRoom}
                        className="text-[#EC4899] font-semibold hover:underline"
                      >
                        Lancer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-[#09090B] rounded-xl border border-[#232326] flex items-start gap-3 text-xs text-[#B8B4C0]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>
              Toutes les sources listées respectent les conditions de diffusion en streaming public ouvert et fonctionnent nativement sur Chrome, Safari, Firefox et Edge, sur smartphone et ordinateur.
            </p>
          </div>
        </div>
      )}

      {/* Content policy */}
      {activeTab === 'gestion_contenus' && (
        <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 space-y-5 text-xs text-[#B8B4C0] leading-relaxed">
          <h2 className="text-xl font-bold text-white">Politique de Gestion des Contenus & Droits d’Auteur</h2>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">1. Principe de légalité intégrale</h3>
            <p>
              Kinoo ne propose aucun catalogue piraté, aucun lecteur clandestin et ne réalise aucun hébergement illicite de flux protégés.
              Le service agit comme une couche de synchronisation temporelle coordonnée au-dessus de sources autorisées.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">2. Procédure de retrait de contenu (Notice & Takedown)</h3>
            <p>
              Tout ayant droit constatant la présence d’une URL ou d’une intégration non conforme peut demander le retrait immédiat via le formulaire de signalement ou par e-mail à <span className="text-white font-mono">legal@kinoo.app</span>. Le lien est désactivé sous 24h ouvrées.
            </p>
          </section>
        </div>
      )}

      {/* Mentions Légales */}
      {activeTab === 'mentions' && (
        <div className="bg-[#141417] border border-[#232326] rounded-2xl p-6 sm:p-8 space-y-5 text-xs text-[#B8B4C0] leading-relaxed">
          <h2 className="text-xl font-bold text-white">Mentions Légales</h2>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">1. Éditeur de la plateforme</h3>
            <p>
              <strong>Plateforme KINOO</strong> — Service de visionnage collectif synchronisé.<br />
              <strong>Contact général :</strong> <a href="mailto:contact@kinoo.app" className="text-[#EC4899] underline">contact@kinoo.app</a><br />
              <strong>Délégué à la Protection des Données (DPO) :</strong> <a href="mailto:dpo@kinoo.app" className="text-[#EC4899] underline">dpo@kinoo.app</a><br />
              <strong>Signalements de droits d'auteur & abus :</strong> <a href="mailto:legal@kinoo.app" className="text-[#EC4899] underline">legal@kinoo.app</a>
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">2. Hébergement & Infrastructure</h3>
            <p>
              L'application et sa base de données sont hébergées sur l'infrastructure européenne de :<br />
              <strong>Google Ireland Limited</strong> (Google Cloud Platform)<br />
              Gordon House, Barrow Street, Dublin 4, Irlande.<br />
              Région de déploiement des données : Europe-West (chiffrement de bout en bout HTTPS/TLS 1.3, certificats SSL automatiques).
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white">3. Droit Applicable & Juridiction Compétente</h3>
            <p>
              Les présentes conditions sont régies par les lois applicables en République du Sénégal, 
              complétées par les standards internationaux de protection des données (RGPD / Convention 108+). 
              En cas de litige, une solution amiable sera systématiquement recherchée avant toute action juridictionnelle.
            </p>
          </section>
        </div>
      )}
    </div>
  );
};
