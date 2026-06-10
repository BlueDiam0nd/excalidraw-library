import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { userFromReq, groupsFromReq, isAdmin, requireAdmin } from "./auth.js";
import { adminRouter } from "./admin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const app = express();

const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || "https://excalidraw.agenciabluediamond.com";
const PORT = parseInt(process.env.PORT || "8080", 10);

app.use(express.json({ limit: "32kb" }));
app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST", "DELETE", "PATCH", "PUT", "OPTIONS"],
    credentials: false,
  }),
);
// logging mínimo: método, caminho, status, origin
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const origin = req.header("origin") || "-";
    const dur = Date.now() - start;
    console.log(
      `[req] ${req.method} ${req.originalUrl} → ${res.statusCode} (${dur}ms) origin=${origin}`,
    );
  });
  next();
});

// extrai o roomId do fragmento #room=ID,KEY (ou #json=ID,KEY)
const parseRoomId = (url) => {
  const m = url?.match(/#(?:room|json)=([^,]+),/);
  return m?.[1] ?? null;
};

// ids dos workspaces dos quais o usuário é membro
const myWorkspaceIds = async (user) => {
  if (!user) return [];
  const rows = await prisma.workspaceMember.findMany({
    where: { username: user },
    select: { workspaceId: true },
  });
  return rows.map((r) => r.workspaceId);
};

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.get("/api/me", (req, res) => {
  res.json({
    user: userFromReq(req),
    groups: groupsFromReq(req),
    isAdmin: isAdmin(req),
  });
});

// workspaces visíveis pro usuário (pra UI da biblioteca); admin vê todos
app.get("/api/workspaces", async (req, res) => {
  const user = userFromReq(req);
  const where = isAdmin(req) ? {} : { members: { some: { username: user ?? "" } } };
  const list = await prisma.workspace.findMany({
    where,
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  res.json(list);
});

app.post("/api/drawings", async (req, res) => {
  const { url, title } = req.body ?? {};
  if (typeof url !== "string" || !url.includes("#")) {
    return res.status(400).json({ error: "url inválida (precisa do fragmento #room=)" });
  }
  if (url.length > 2000) {
    return res.status(400).json({ error: "url muito longa" });
  }
  const owner = userFromReq(req);
  const roomId = parseRoomId(url);

  // se já existe um desenho com mesmo roomId+owner, atualiza (não duplica)
  if (roomId) {
    const existing = await prisma.drawing.findFirst({
      where: { roomId, owner },
    });
    if (existing) {
      const updated = await prisma.drawing.update({
        where: { id: existing.id },
        data: { url, title: title ?? existing.title },
      });
      return res.json(updated);
    }
  }

  const drawing = await prisma.drawing.create({
    data: { url, title: title?.slice(0, 200) ?? null, owner, roomId },
  });
  res.status(201).json(drawing);
});

// visibilidade: meus desenhos + desenhos dos meus workspaces; admin vê tudo
app.get("/api/drawings", async (req, res) => {
  const user = userFromReq(req);
  let where = {};
  if (!isAdmin(req)) {
    const wsIds = await myWorkspaceIds(user);
    where = {
      OR: [
        { owner: user ?? "__none__" },
        ...(wsIds.length ? [{ workspaceId: { in: wsIds } }] : []),
      ],
    };
  }
  const list = await prisma.drawing.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 500,
    include: { workspace: { select: { id: true, name: true } } },
  });
  res.json(list);
});

// dono ou admin pode editar título e/ou mover de workspace
app.patch("/api/drawings/:id", async (req, res) => {
  const user = userFromReq(req);
  const admin = isAdmin(req);
  const { title, workspaceId } = req.body ?? {};

  const data = {};
  if (title !== undefined) {
    if (typeof title !== "string") {
      return res.status(400).json({ error: "title deve ser string" });
    }
    data.title = title.slice(0, 200);
  }
  if (workspaceId !== undefined) {
    if (workspaceId !== null) {
      if (typeof workspaceId !== "string") {
        return res.status(400).json({ error: "workspaceId inválido" });
      }
      // só pode mover para workspace do qual é membro (admin pode qualquer)
      if (!admin) {
        const ids = await myWorkspaceIds(user);
        if (!ids.includes(workspaceId)) {
          return res.status(403).json({ error: "você não é membro desse workspace" });
        }
      }
      const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (!ws) return res.status(404).json({ error: "workspace não encontrado" });
    }
    data.workspaceId = workspaceId;
  }
  if (!Object.keys(data).length) {
    return res.status(400).json({ error: "nada para atualizar" });
  }

  try {
    const drawing = await prisma.drawing.update({
      where: admin ? { id: req.params.id } : { id: req.params.id, owner: user },
      data,
    });
    res.json(drawing);
  } catch {
    res.status(404).json({ error: "não encontrado" });
  }
});

app.delete("/api/drawings/:id", async (req, res) => {
  const user = userFromReq(req);
  try {
    await prisma.drawing.delete({
      where: isAdmin(req)
        ? { id: req.params.id }
        : { id: req.params.id, owner: user },
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "não encontrado" });
  }
});

// ---------- Admin ----------

app.use("/api/admin", requireAdmin, adminRouter(prisma));

const indexHtml = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");
const adminHtml = readFileSync(join(__dirname, "..", "public", "admin.html"), "utf8");

app.get("/", (_req, res) => res.type("html").send(indexHtml));
app.get("/admin", (req, res) => {
  if (!isAdmin(req)) {
    return res
      .status(403)
      .type("html")
      .send("<h1>403</h1><p>Acesso restrito a administradores.</p>");
  }
  res.type("html").send(adminHtml);
});

// tratamento central de erros (inclui UsersUnavailableError → 503)
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error("[err]", err);
  res.status(status).json({ error: err.message || "erro interno" });
});

app.listen(PORT, () => {
  console.log(`excalidraw-library listening on ${PORT}, origin=${ALLOWED_ORIGIN}`);
});
