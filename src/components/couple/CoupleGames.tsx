import React, { useRef, useState } from 'react';
import { Dices, Users, RefreshCw, Flame } from 'lucide-react';
import { TRUTH_DARE, WHO_OF_US } from '../../data/coupleGames';

type Game = 'AV' | 'WHO';

/** Tire au hasard sans répéter tant que toutes les cartes n'ont pas été vues. */
function useDeck(items: string[]) {
  const seen = useRef<Set<number>>(new Set());
  return () => {
    if (seen.current.size >= items.length) seen.current.clear();
    let i = Math.floor(Math.random() * items.length);
    let guard = 0;
    while (seen.current.has(i) && guard++ < 50) i = Math.floor(Math.random() * items.length);
    seen.current.add(i);
    return items[i];
  };
}

export const CoupleGames: React.FC = () => {
  const [game, setGame] = useState<Game>('AV');
  const [level, setLevel] = useState(0);
  const [card, setCard] = useState<{ kind: 'Vérité' | 'Action' | 'Question'; text: string } | null>(null);
  const lvl = TRUTH_DARE[level];
  const nextTruth = useDeck(lvl.truths);
  const nextDare = useDeck(lvl.dares);
  const nextWho = useDeck(WHO_OF_US);

  return (
    <div className="space-y-3">
      <div className="kc-card-hero space-y-1">
        <p className="kc-eyebrow" style={{ color: 'rgba(255,255,255,0.85)' }}>La salle de jeux</p>
        <p className="kc-display" style={{ fontSize: '1.7rem', color: '#fff' }}>Rire, oser, se redécouvrir.</p>
        <p className="text-[12px] opacity-90">Posez le téléphone entre vous deux et tirez une carte chacun votre tour.</p>
      </div>

      <div className="kc-seg" role="tablist" aria-label="Choisir un jeu">
        <button role="tab" aria-selected={game === 'AV'} onClick={() => { setGame('AV'); setCard(null); }}>Action ou Vérité</button>
        <button role="tab" aria-selected={game === 'WHO'} onClick={() => { setGame('WHO'); setCard(null); }}>Qui de nous deux ?</button>
      </div>

      {game === 'AV' && (
        <>
          <div className="kc-scroll-x" role="group" aria-label="Niveau d’intensité">
            {TRUTH_DARE.map((l, i) => (
              <button key={l.id} onClick={() => { setLevel(i); setCard(null); }} className={`kc-chip ${i === level ? 'kc-chip-on' : ''}`} style={{ cursor: 'pointer', flexShrink: 0 }} aria-pressed={i === level}>
                <Flame className="w-3.5 h-3.5" /> {l.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] kc-faint -mt-1">Niveau {lvl.label} — {lvl.hint}.</p>

          <div className="kc-card text-center space-y-3" style={{ minHeight: '11rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {card ? (
              <>
                <p className="kc-eyebrow">{card.kind}</p>
                <p className="kc-display" style={{ fontSize: '1.4rem', lineHeight: 1.2 }}>{card.text}</p>
              </>
            ) : (
              <p className="kc-muted text-sm">Choisissez Vérité ou Action pour tirer votre première carte.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="kc-btn" onClick={() => setCard({ kind: 'Vérité', text: nextTruth() })}><Dices className="w-4 h-4" /> Vérité</button>
            <button className="kc-btn-ghost" onClick={() => setCard({ kind: 'Action', text: nextDare() })}><Dices className="w-4 h-4" /> Action</button>
          </div>
        </>
      )}

      {game === 'WHO' && (
        <>
          <div className="kc-card text-center space-y-3" style={{ minHeight: '11rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {card ? (
              <>
                <p className="kc-eyebrow flex items-center justify-center gap-1.5"><Users className="w-3.5 h-3.5" /> Montrez-vous du doigt en même temps</p>
                <p className="kc-display" style={{ fontSize: '1.4rem', lineHeight: 1.2 }}>{card.text}</p>
              </>
            ) : (
              <p className="kc-muted text-sm">Tirez une question, comptez jusqu’à trois, puis montrez-vous du doigt.</p>
            )}
          </div>
          <button className="kc-btn w-full" onClick={() => setCard({ kind: 'Question', text: nextWho() })}><RefreshCw className="w-4 h-4" /> {card ? 'Question suivante' : 'Tirer une question'}</button>
        </>
      )}
    </div>
  );
};
