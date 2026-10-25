const { chromium } = require("playwright");

async function testGoogleOauthCspFlow() {
  console.log("========================================================================");
  console.log("TEST DU POINT 2 : AUDIT CSP DU FLUX GOOGLE OAUTH, CALLBACK & SENTRY");
  console.log("========================================================================\n");

  const browser = await chromium.launch({
    executablePath: "/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  const violations = [];

  page.on("console", msg => {
    const text = msg.text();
    if (
      text.toLowerCase().includes("content security policy") ||
      text.toLowerCase().includes("violates the following") ||
      text.toLowerCase().includes("refused to")
    ) {
      if (!text.includes("24678")) {
        console.warn("  [CSP VIOLATION]:", text);
        violations.push(text);
      }
    }
  });

  // 1. Chargement de la page principale et ouverture de la modale de connexion
  console.log("[Étape 1 : Ouverture de la page et modale de connexion]");
  await page.goto("http://localhost:3000");
  await page.waitForTimeout(1000);

  const loginBtn = page.locator("button:has-text(\"Connexion\"), button:has-text(\"Se connecter\")").first();
  if (await loginBtn.isVisible()) {
    await loginBtn.click();
    await page.waitForTimeout(1000);
  }

  // Vérification de la présence du bouton Google
  const googleBtn = page.locator("button:has-text(\"Continuer avec Google\"), button:has-text(\"Google\")").first();
  console.log("  ↳ Bouton Google présent dans l'interface :", await googleBtn.isVisible());

  // 2. Test direct de la page de callback OAuth (/auth/callback) avec nonce
  console.log("\n[Étape 2 : Chargement de la page de callback serveur /auth/callback]");
  const mockState = "test_nonce_state_123";
  const callbackUrl = `http://localhost:3000/auth/callback?code=mock_google_code_xyz&state=${mockState}`;
  
  await page.goto(callbackUrl);
  await page.waitForTimeout(1500);

  const callbackBody = await page.textContent("body");
  console.log("  ↳ Contenu de la page /auth/callback :", callbackBody.trim());
  const hasNonce = await page.evaluate(() => {
    const script = document.querySelector("script[nonce]");
    return Boolean(script && script.getAttribute("nonce"));
  });
  console.log("  ↳ Balise script protégée par nonce cryptographique :", hasNonce);

  // 3. Vérification du chargement de la configuration Sentry
  console.log("\n[Étape 3 : Chargement de la configuration Sentry (API /api/config)]");
  const configRes = await page.evaluate(async () => {
    const r = await fetch("/api/config");
    return { status: r.status, data: await r.json() };
  });
  console.log("  ↳ Réponse /api/config : HTTP", configRes.status, configRes.data);

  console.log("\n--- BILAN DE L'AUDIT CSP ---");
  console.log("  • Violations détectées :", violations.length);
  if (violations.length === 0) {
    console.log("  ↳ SUCCÈS : ZÉRO VIOLATION CSP DÉTECTÉE SUR LE FLUX OAUTH & CALLBACK !");
  } else {
    violations.forEach(v => console.log("   -", v));
  }

  await browser.close();
}

testGoogleOauthCspFlow().catch(console.error);
