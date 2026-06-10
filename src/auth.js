// Authelia (via Traefik ForwardAuth) injeta a identidade nos headers Remote-*.
// Esses headers só chegam pela rede overlay interna — o serviço não publica porta no host.

export const userFromReq = (req) =>
  req.header("Remote-User") || req.header("X-Forwarded-User") || null;

export const groupsFromReq = (req) =>
  (req.header("Remote-Groups") || "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

export const isAdmin = (req) => groupsFromReq(req).includes("admins");

export const requireAdmin = (req, res, next) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "acesso restrito a administradores" });
  }
  next();
};
