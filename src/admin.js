// API de administração — montada sob /api/admin com requireAdmin no index.js
import { Router } from "express";
import { userFromReq } from "./auth.js";
import {
  USERNAME_RE,
  listUsers,
  userExists,
  createUser,
  deleteUser,
  setPassword,
} from "./autheliaUsers.js";

export const adminRouter = (prisma) => {
  const r = Router();

  // ---------- Usuários (Authelia users_database.yml) ----------

  r.get("/users", (_req, res, next) => {
    try {
      res.json(listUsers());
    } catch (e) {
      next(e);
    }
  });

  r.post("/users", async (req, res, next) => {
    try {
      const { username, displayname, email, password, admin } = req.body ?? {};
      if (typeof username !== "string" || !USERNAME_RE.test(username)) {
        return res.status(400).json({
          error: "username inválido (minúsculas, números, _ ou -, 2-32 chars)",
        });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "senha precisa de ao menos 8 caracteres" });
      }
      await createUser({ username, displayname, email, password, admin: !!admin });
      res.status(201).json({ ok: true, username });
    } catch (e) {
      next(e);
    }
  });

  r.delete("/users/:username", async (req, res, next) => {
    try {
      const { username } = req.params;
      if (username === userFromReq(req)) {
        return res.status(400).json({ error: "você não pode excluir o próprio usuário" });
      }
      deleteUser(username);
      await prisma.workspaceMember.deleteMany({ where: { username } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  r.post("/users/:username/password", async (req, res, next) => {
    try {
      const { password } = req.body ?? {};
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "senha precisa de ao menos 8 caracteres" });
      }
      await setPassword(req.params.username, password);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---------- Workspaces ----------

  r.get("/workspaces", async (_req, res, next) => {
    try {
      const list = await prisma.workspace.findMany({
        orderBy: { name: "asc" },
        include: { members: true, _count: { select: { drawings: true } } },
      });
      res.json(
        list.map((w) => ({
          id: w.id,
          name: w.name,
          members: w.members.map((m) => m.username),
          drawings: w._count.drawings,
        })),
      );
    } catch (e) {
      next(e);
    }
  });

  r.post("/workspaces", async (req, res, next) => {
    try {
      const { name } = req.body ?? {};
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name obrigatório" });
      }
      const w = await prisma.workspace.create({ data: { name: name.trim().slice(0, 120) } });
      res.status(201).json(w);
    } catch (e) {
      next(e);
    }
  });

  r.patch("/workspaces/:id", async (req, res, next) => {
    try {
      const { name } = req.body ?? {};
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name obrigatório" });
      }
      const w = await prisma.workspace.update({
        where: { id: req.params.id },
        data: { name: name.trim().slice(0, 120) },
      });
      res.json(w);
    } catch {
      res.status(404).json({ error: "workspace não encontrado" });
    }
  });

  r.delete("/workspaces/:id", async (req, res, next) => {
    try {
      await prisma.workspace.delete({ where: { id: req.params.id } });
      res.status(204).end();
    } catch {
      res.status(404).json({ error: "workspace não encontrado" });
    }
  });

  // substitui a lista de membros do workspace
  r.put("/workspaces/:id/members", async (req, res, next) => {
    try {
      const { usernames } = req.body ?? {};
      if (!Array.isArray(usernames) || usernames.some((u) => typeof u !== "string")) {
        return res.status(400).json({ error: "usernames deve ser uma lista de strings" });
      }
      const invalid = usernames.filter((u) => !userExists(u));
      if (invalid.length) {
        return res.status(400).json({ error: `usuários inexistentes: ${invalid.join(", ")}` });
      }
      const workspaceId = req.params.id;
      const w = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (!w) return res.status(404).json({ error: "workspace não encontrado" });

      await prisma.$transaction([
        prisma.workspaceMember.deleteMany({ where: { workspaceId } }),
        prisma.workspaceMember.createMany({
          data: [...new Set(usernames)].map((username) => ({ workspaceId, username })),
        }),
      ]);
      res.json({ ok: true, members: [...new Set(usernames)] });
    } catch (e) {
      next(e);
    }
  });

  return r;
};
