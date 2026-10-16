import { sanitizeSubtitlesToPlainVtt, convertSrtToVtt, MAX_SUBTITLE_FILE_SIZE_BYTES } from '../src/utils/mediaHelper.ts';

async function runTest() {
  console.log('--- TEST POINT 3 : SOUS-TITRES EN TEXTE BRUT & SÉLECTEUR SÉCURISÉ ---');

  let passed = true;

  try {
    // 1. Test SRT input with HTML / XML tags & timing formatting
    const rawSrt = `1
00:00:01,500 --> 00:00:04,200
<b>Bienvenue</b> sur <font color="#FF0000">Kinoo</font> !

2
00:00:05,000 --> 00:00:08,700
<i>Profitez</i> de votre <script>alert("hack")</script>séance en direct.
`;

    const vttFromSrt = sanitizeSubtitlesToPlainVtt(rawSrt);
    console.log('VTT résultant depuis SRT :\n' + vttFromSrt);

    if (vttFromSrt.includes('<font') || vttFromSrt.includes('<b>') || vttFromSrt.includes('<script>') || vttFromSrt.includes('<i>')) {
      throw new Error('Des balises HTML ont été conservées dans le VTT produit depuis SRT !');
    }
    if (!vttFromSrt.includes('00:00:01.500 --> 00:00:04.200')) {
      throw new Error('Le formatage des millisecondes avec des points a échoué');
    }
    if (!vttFromSrt.includes('Bienvenue sur Kinoo !') || !vttFromSrt.includes('Profitez de votre séance en direct.')) {
      throw new Error('Le texte brut purifié est altéré');
    }
    console.log('✓ Nettoyage SRT vers texte brut sans HTML : SUCCÈS');

    // 2. Test direct WebVTT with HTML tags
    const rawVtt = `WEBVTT

00:00:10.000 --> 00:00:14.000
<v Narrateur><c.yellow>Sous-titres stylisés avec balises</c> &amp; <span style="display:none">cache</span></v>
`;

    const cleanedVtt = sanitizeSubtitlesToPlainVtt(rawVtt);
    console.log('VTT nettoyé :\n' + cleanedVtt);

    if (cleanedVtt.includes('<v') || cleanedVtt.includes('<c') || cleanedVtt.includes('<span') || cleanedVtt.includes('&amp;')) {
      throw new Error('Des balises ou entités HTML ont subsisté dans le VTT purifié !');
    }
    if (!cleanedVtt.includes('Sous-titres stylisés avec balises & cache')) {
      throw new Error('Le texte brut nettoyé du VTT est incomplet');
    }
    console.log('✓ Purge WebVTT vers texte brut sans HTML : SUCCÈS');

    // 3. Test File size limit constant
    console.log(`✓ Limite taille de fichier configurée : ${MAX_SUBTITLE_FILE_SIZE_BYTES} octets (soit ${MAX_SUBTITLE_FILE_SIZE_BYTES / (1024 * 1024)} Mo).`);
    if (MAX_SUBTITLE_FILE_SIZE_BYTES !== 2 * 1024 * 1024) {
      throw new Error('La limite de taille de sous-titres doit être exactement de 2 Mo');
    }

    // 4. Test convertSrtToVtt alias
    const aliasResult = convertSrtToVtt(rawSrt);
    if (aliasResult !== vttFromSrt) {
      throw new Error("L'alias convertSrtToVtt ne correspond pas à sanitizeSubtitlesToPlainVtt");
    }
    console.log('✓ Alias convertSrtToVtt rétrocompatible : SUCCÈS');

    console.log('✅ TEST POINT 3 RÉUSSI AVEC SUCCÈS.');
  } catch (err) {
    passed = false;
    console.error('❌ ERREUR TEST POINT 3 :', err);
  }

  process.exit(passed ? 0 : 1);
}

runTest();
