with open('server/auth.ts', 'r') as f:
    text = f.read()

# 1. Replace getClientIp
idx_fwd = text.find("// Extraction sécurisée de la véritable adresse IP cliente (première IP de x-forwarded-for)")
if idx_fwd == -1:
    idx_fwd = text.find("export function getClientIp(req: Request): string {")
idx_fwd_end = text.find("export function rateLimitAntiSpam", idx_fwd)

new_get_client_ip = """// Extraction sécurisée de la véritable adresse IP cliente (protégée contre l'usurpation de X-Forwarded-For)
export function getClientIp(req: Request): string {
  const rawFwd = req.headers['x-forwarded-for'];
  if (typeof rawFwd === 'string') {
    const parts = rawFwd.split(',').map((p) => p.trim()).filter(Boolean);
    // Dans l'infrastructure Google Cloud Run + Nginx conteneur :
    // GFE (Google Front End) accole systématiquement la véritable IP du client à la fin de X-Forwarded-For.
    // Nginx local peut ensuite ajouter l'adresse de loopback (127.0.0.1).
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (last === '127.0.0.1' || last === '::1' || last.startsWith('169.254.') || last.startsWith('10.')) {
        return parts[parts.length - 2];
      }
      return last;
    }
    // Si une seule entrée est fournie et que la requête provient authentiquement de Cloud Run (en-tête interne)
    if (parts.length === 1 && (req.headers['x-cloud-trace-context'] || req.headers['x-appengine-user-ip'])) {
      return parts[0];
    }
  }

  // Si connexion TCP directe (sans proxy intermédiaire Cloud Run) ou test local :
  // L'adresse de socket est l'unique source de vérité immuable non falsifiable par le client.
  const socketAddr = req.socket?.remoteAddress;
  if (socketAddr) {
    return socketAddr.replace(/^.*:/, ''); // normalise ::ffff:127.0.0.1 -> 127.0.0.1
  }

  return req.ip || 'unknown-ip';
}

"""
text = text[:idx_fwd] + new_get_client_ip + text[idx_fwd_end:]

# 2. Update rateLimitRoomSearch maxAttempts to 5
text = text.replace("const maxAttempts = 10; // Max 10 requêtes par minute et par IP réelle", "const maxAttempts = 5; // Limite stricte : 5 tentatives par minute et par IP réelle")

with open('server/auth.ts', 'w') as f:
    f.write(text)

print("Updated server/auth.ts getClientIp & rateLimitRoomSearch")

# 3. Update server/routes.ts to apply rateLimitRoomSearch on GET /rooms/:idOrCode
with open('server/routes.ts', 'r') as f:
    r_text = f.read()

r_text = r_text.replace(
    "apiRouter.get('/rooms/:idOrCode', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {",
    "apiRouter.get('/rooms/:idOrCode', rateLimitRoomSearch, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {"
)

# Replace the login rawFwd read with getClientIp(req)
idx_login_fwd = r_text.find("const rawFwd = req.headers['x-forwarded-for'];")
if idx_login_fwd != -1:
    idx_login_fwd_end = r_text.find("resetRateLimit(clientIp);", idx_login_fwd)
    old_login_chunk = r_text[idx_login_fwd:idx_login_fwd_end]
    new_login_chunk = "const clientIp = getClientIp(req);\n    "
    r_text = r_text[:idx_login_fwd] + new_login_chunk + r_text[idx_login_fwd_end:]
    print("Replaced rawFwd in login with getClientIp(req)")

with open('server/routes.ts', 'w') as f:
    f.write(r_text)

print("Updated server/routes.ts with rateLimitRoomSearch on GET /rooms/:idOrCode")
