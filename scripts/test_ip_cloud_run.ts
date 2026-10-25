import { getClientIp } from "../server/auth";
import assert from "assert";

console.log("========================================================================");
console.log("TEST DE VALIDATION DE L EXTRACTION D ADRESSE IP (GOOGLE CLOUD RUN)");
console.log("========================================================================");

function createMockReq(headers: any = {}, ip?: string, socketRemote = "127.0.0.1") {
  return {
    headers: { ...headers },
    ip,
    socket: { remoteAddress: socketRemote }
  } as any;
}

// 1. Scenario Cloud Run standard avec en-tete unique
const req1 = createMockReq({ "x-forwarded-for": "203.0.113.195" });
const ip1 = getClientIp(req1);
console.log("[Test 1] Requete Cloud Run standard (X-Forwarded-For: 203.0.113.195) :");
console.log("   -> IP extraite :", ip1);
assert.strictEqual(ip1, "203.0.113.195", "Doit extraire la seule IP presente");

// 2. Scenario Attaque Spoofing : le client injecte un faux XFF, Google ajoute la vraie IP a droite
const req2 = createMockReq({ "x-forwarded-for": "1.2.3.4, 198.51.100.42" });
const ip2 = getClientIp(req2);
console.log("[Test 2] Tentative de spoofing (Client envoie 1.2.3.4, GFE ajoute 198.51.100.42) :");
console.log("   -> IP extraite :", ip2);
assert.strictEqual(ip2, "198.51.100.42", "Doit ignorer l IP de gauche falsifiee et retenir la vraie IP ajoutee par GFE");

// 3. Scenario Multiple Sauts amont (ex: Utilisateur -> CDN Cloudflare -> Google Cloud Run)
const req3 = createMockReq({ "x-forwarded-for": "192.0.2.1, 198.51.100.5, 203.0.113.50" });
const ip3 = getClientIp(req3);
console.log("[Test 3] Multiples sauts de proxys (Client -> CDN -> GFE) :");
console.log("   -> IP extraite :", ip3);
assert.strictEqual(ip3, "203.0.113.50", "Doit retenir l entree certifiee par Google");

// 4. Scenario Rebond interne Cloud Run link-local (169.254.8.1)
const req4 = createMockReq({ "x-forwarded-for": "203.0.113.88, 169.254.8.1" });
const ip4 = getClientIp(req4);
console.log("[Test 4] Rebond interne Google link-local (169.254.8.1) :");
console.log("   -> IP extraite :", ip4);
assert.strictEqual(ip4, "203.0.113.88", "Doit retenir l IP client avant le rebond link-local interne");

// 5. Scenario Normalisation IPv4 encapsule dans IPv6
const req5 = createMockReq({ "x-forwarded-for": "::ffff:203.0.113.77" });
const ip5 = getClientIp(req5);
console.log("[Test 5] Normalisation IPv6 dual-stack (::ffff:203.0.113.77) :");
console.log("   -> IP extraite :", ip5);
assert.strictEqual(ip5, "203.0.113.77", "Doit normaliser l adresse IPv4 sans prefixe");

// 6. Scenario Connexion locale directe sans en-tete (developpement local)
const req6 = createMockReq({}, undefined, "127.0.0.1");
const ip6 = getClientIp(req6);
console.log("[Test 6] Connexion directe locale sans en-tete :");
console.log("   -> IP extraite :", ip6);
assert.strictEqual(ip6, "127.0.0.1", "Doit utiliser la socket de transport locale");

console.log("========================================================================");
console.log("TOUS LES TESTS UNITAIRES DE getClientIp ONT ETE VALIDES AVEC SUCCES !");
console.log("========================================================================");
