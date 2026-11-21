import React, { useEffect, useState } from 'react';
import { CoupleChat } from './CoupleChat';
import { CoupleGames } from './CoupleGames';
import { CoupleMemories } from './CoupleMemories';

export type MomentsSub = 'chat' | 'games' | 'memories';

interface Props {
  myId: string;
  myName: string;
  partnerName: string;
  partnerOnline?: boolean;
  initialSub?: MomentsSub;
}

export const CoupleMoments: React.FC<Props> = ({ myId, myName, partnerName, partnerOnline, initialSub }) => {
  const [sub, setSub] = useState<MomentsSub>(initialSub || 'chat');
  useEffect(() => { if (initialSub) setSub(initialSub); }, [initialSub]);
  return (
    <div className="kc-page">
      <header>
        <p className="kc-eyebrow">Votre lien à deux</p>
        <h1 className="kc-display" style={{ fontSize: '2rem' }}>Moments</h1>
      </header>
      <div className="kc-seg" role="tablist" aria-label="Moments">
        <button role="tab" aria-selected={sub === 'chat'} onClick={() => setSub('chat')}>Discussion</button>
        <button role="tab" aria-selected={sub === 'games'} onClick={() => setSub('games')}>Jeux</button>
        <button role="tab" aria-selected={sub === 'memories'} onClick={() => setSub('memories')}>Souvenirs</button>
      </div>
      {sub === 'chat' && <CoupleChat myId={myId} myName={myName} partnerName={partnerName} partnerOnline={partnerOnline} />}
      {sub === 'games' && <CoupleGames />}
      {sub === 'memories' && <CoupleMemories />}
    </div>
  );
};
