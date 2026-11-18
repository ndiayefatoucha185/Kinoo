export interface TruthDareLevel {
  id: 'DOUX' | 'COMPLICE' | 'PIQUANT' | 'AUDACIEUX';
  label: string;
  hint: string;
  truths: string[];
  dares: string[];
}

/** Action ou Vérité pour deux : quatre niveaux d'intensité, du plus tendre au plus audacieux (jamais explicite). */
export const TRUTH_DARE: TruthDareLevel[] = [
  {
    id: 'DOUX', label: 'Doux', hint: 'Tendre et rassurant',
    truths: [
      'Quel est ton premier souvenir de nous deux ?',
      'Qu’est-ce que tu as remarqué en premier chez moi ?',
      'Quel petit geste de ma part te fait toujours fondre ?',
      'Quel endroit rêves-tu de visiter avec moi ?',
      'Quelle chanson te fait penser à nous ?',
      'À quel moment as-tu su que j’étais quelqu’un de spécial ?',
      'Qu’est-ce que tu aimes le plus dans nos matins ensemble ?',
      'Quelle est ta plus belle journée passée avec moi ?',
    ],
    dares: [
      'Dis-moi trois choses que tu admires chez moi.',
      'Fais-moi un compliment sincère les yeux dans les yeux.',
      'Écris-moi un petit mot doux sur ton téléphone et lis-le à voix haute.',
      'Donne-moi un câlin de 20 secondes sans rien dire.',
      'Chante-moi un bout de notre chanson.',
      'Raconte-moi notre histoire en 30 secondes comme un conte.',
      'Choisis un surnom tendre pour moi pour toute la soirée.',
      'Envoie-moi un vocal où tu me dis pourquoi tu m’aimes.',
    ],
  },
  {
    id: 'COMPLICE', label: 'Complice', hint: 'Rires et confidences',
    truths: [
      'Quelle habitude de moi t’amuse en secret ?',
      'Quel est le moment le plus gênant que nous ayons vécu ensemble ?',
      'Quel mensonge innocent m’as-tu déjà dit ?',
      'Si tu devais changer une petite chose dans notre routine, laquelle ?',
      'Quelle est la chose la plus folle que tu aimerais qu’on fasse ensemble ?',
      'Quel est ton plus grand fou rire avec moi ?',
      'Qu’as-tu pensé de moi à notre toute première rencontre ?',
      'Quelle qualité de moi aimerais-tu avoir ?',
    ],
    dares: [
      'Imite-moi pendant 30 secondes.',
      'Fais ta meilleure danse sur la musique que je choisis.',
      'Fais-moi rire en moins de 30 secondes.',
      'Parle avec un accent de ton choix pendant les trois prochaines minutes.',
      'Montre-moi la photo de nous que tu préfères et dis-moi pourquoi.',
      'Prépare-moi une boisson ou un petit snack, comme un serveur chic.',
      'Fais-moi un massage des mains d’une minute.',
      'Dessine-moi en 30 secondes sans lever le crayon.',
    ],
  },
  {
    id: 'PIQUANT', label: 'Piquant', hint: 'Un peu de taquinerie',
    truths: [
      'Quelle tenue de moi te fait le plus craquer ?',
      'Quel est le moment où tu m’as trouvé(e) le plus séduisant(e) ?',
      'Quelle a été ta première impression romantique sur moi ?',
      'Quel est ton rendez-vous romantique idéal avec moi ?',
      'Qu’est-ce qui te donne le plus de papillons dans le ventre quand tu penses à moi ?',
      'Quelle est la chose la plus romantique que tu aies envie que je fasse pour toi ?',
      'À quel moment as-tu été jaloux(se) sans me le dire ?',
      'Quel est le message le plus charmant que tu m’aies envoyé ?',
    ],
    dares: [
      'Murmure-moi à l’oreille ce que tu préfères chez moi.',
      'Fais-moi un baiser dans le cou ou sur la joue, comme tu le sens.',
      'Décris-moi le rendez-vous romantique parfait, en détail.',
      'Fais-moi une déclaration comme dans un film.',
      'Regarde-moi dans les yeux 30 secondes sans rire.',
      'Prends-moi par la main et fais-moi danser un slow.',
      'Dis-moi le surnom que tu ne m’as encore jamais osé dire.',
      'Envoie-moi une photo de toi qui me donne envie de te retrouver.',
    ],
  },
  {
    id: 'AUDACIEUX', label: 'Audacieux', hint: 'Pour les plus complices',
    truths: [
      'Quel fantasme de voyage ou de week-end oses-tu m’avouer ?',
      'Quelle est la chose la plus audacieuse que tu aimerais que nous essayions ensemble ?',
      'Quel secret n’as-tu jamais osé me dire ?',
      'Qu’est-ce que tu aimerais que je te fasse plus souvent ?',
      'Quel est ton souvenir le plus intense avec moi ?',
      'Si on avait une soirée sans limites, que ferais-tu ?',
      'Quel moment de nous deux te donne encore des frissons ?',
      'Qu’est-ce qui te rend irrésistiblement amoureux(se) de moi ?',
    ],
    dares: [
      'Écris-moi un petit message très romantique que je lirai plus tard.',
      'Fais-moi un baiser d’une durée de ton choix.',
      'Laisse-moi choisir ta tenue pour notre prochain rendez-vous.',
      'Planifie une surprise romantique pour ce week-end et donne-moi un indice.',
      'Dis-moi, sans rougir, trois choses qui te font craquer chez moi.',
      'Raconte-moi la nuit parfaite à deux, version romantique.',
      'Fais-moi un massage du dos de deux minutes.',
      'Réserve-moi le dernier mot de la soirée : je choisis ton gage.',
    ],
  },
];

/** « Qui de nous deux ? » : on se montre du doigt en même temps. */
export const WHO_OF_US: string[] = [
  'Qui de nous deux s’endort le premier devant un film ?',
  'Qui de nous deux est le plus romantique ?',
  'Qui de nous deux est le plus têtu ?',
  'Qui de nous deux a dit « je t’aime » en premier ?',
  'Qui de nous deux est le plus en retard ?',
  'Qui de nous deux pleure le plus devant un film triste ?',
  'Qui de nous deux cuisine le mieux ?',
  'Qui de nous deux oublie le plus les dates importantes ?',
  'Qui de nous deux est le plus jaloux ?',
  'Qui de nous deux fait le premier pas après une dispute ?',
  'Qui de nous deux est le plus drôle ?',
  'Qui de nous deux est le plus dépensier ?',
  'Qui de nous deux ronfle le plus ?',
  'Qui de nous deux est le plus bavard ?',
  'Qui de nous deux planifie le mieux les sorties ?',
  'Qui de nous deux garde la télécommande trop longtemps ?',
  'Qui de nous deux aurait survécu seul sur une île ?',
  'Qui de nous deux est le plus gourmand ?',
  'Qui de nous deux ferait la meilleure surprise à l’autre ?',
  'Qui de nous deux est le plus câlin ?',
];
