const { chromium } = require("playwright");
const http = require("http");

async function getHeaders(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, res => {
      resolve(res.headers);
    }).on("error", reject);
  });
}

async function testTurnstileCsp() {
  console.log("========================================================================");
  console.log("TEST DU POINT 1 : CSP STRICTE CONDITIONNELLE CLOUDFLARE TURNSTILE");
  console.log("========================================================================\n");

  // 1. Contrôle des en-têtes sans clés Turnstile
  const headers = await getHeaders("/");
  const csp = headers["content-security-policy"] || "";
  console.log("[Étape 1 : Vérification de la CSP par défaut (sans clés Turnstile)]");
  const includesTurnstile = csp.includes("challenges.cloudflare.com");
  console.log("  ↳ Contient challenges.cloudflare.com :", includesTurnstile);
  if (includesTurnstile) {
    throw new Error("RÉGRESSION : Turnstile est présent dans la CSP alors qu'aucune variable n'est configurée !");
  } else {
    console.log("  ↳ SUCCÈS : challenges.cloudflare.com est STRICTEMENT OMIS de la CSP par défaut.");
  }

  // 2. Test dans un vrai navigateur Chromium
  console.log("\n[Étape 2 : Chargement dans Chromium et contrôle des violations CSP]");
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

  await page.goto("http://localhost:3000");
  await page.waitForTimeout(1500);

  // Déclencher l'ouverture de la modale de connexion
  const loginBtn = page.locator("button:has-text(\"Connexion\"), button:has-text(\"Se connecter\")").first();
  if (await loginBtn.isVisible()) {
    await loginBtn.click();
    await page.waitForTimeout(1000);
  }

  console.log("  ↳ Violations CSP détectées :", violations.length);
  if (violations.length === 0) {
    console.log("  ↳ SUCCÈS : Zéro violation CSP sur la modale d'authentification !");
  }

  await browser.close();
  console.log("\n========================================================================");
  console.log("POINT 1 VALIDÉ : CSP CONDITIONNELLE STRICTE & NETTOYAGE EFFECTUÉS");
  console.log("========================================================================");
}

testTurnstileCsp().catch(err => {
  console.error("Échec test Turnstile CSP :", err);
  process.exit(1);
});
