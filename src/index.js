import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
    methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    credentials: false,
  }),
);

// Authelia/Authentik passa o user identificado no header Remote-User
// quando o ForwardAuth está ativo no Traefik. Sem auth → owner = null.
const ownerFromReq = (req) =>
  req.header("Remote-User") || req.header("X-Forwarded-User") || null;

// extrai o roomId do fragmento #room=ID,KEY (ou #json=ID,KEY)
const parseRoomId = (url) => {
  const m = url?.match(/#(?:room|json)=([^,]+),/);
  return m?.[1] ?? null;
};

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.post("/api/drawings", async (req, res) => {
  const { url, title } = req.body ?? {};
  if (typeof url !== "string" || !url.includes("#")) {
    return res.status(400).json({ error: "url inválida (precisa do fragmento #room=)" });
  }
  if (url.length > 2000) {
    return res.status(400).json({ error: "url muito longa" });
  }
  const owner = ownerFromReq(req);
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

app.get("/api/drawings", async (req, res) => {
  const owner = ownerFromReq(req);
  const list = await prisma.drawing.findMany({
    where: owner ? { owner } : {},
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  res.json(list);
});

app.patch("/api/drawings/:id", async (req, res) => {
  const owner = ownerFromReq(req);
  const { title } = req.body ?? {};
  if (typeof title !== "string") {
    return res.status(400).json({ error: "title obrigatório" });
  }
  try {
    const drawing = await prisma.drawing.update({
      where: owner
        ? { id: req.params.id, owner }
        : { id: req.params.id },
      data: { title: title.slice(0, 200) },
    });
    res.json(drawing);
  } catch {
    res.status(404).json({ error: "não encontrado" });
  }
});

app.delete("/api/drawings/:id", async (req, res) => {
  const owner = ownerFromReq(req);
  try {
    await prisma.drawing.delete({
      where: owner ? { id: req.params.id, owner } : { id: req.params.id },
    });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "não encontrado" });
  }
});

// página HTML estática (UI)
const indexHtml = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");
app.get("/", (_req, res) => res.type("html").send(indexHtml));

app.listen(PORT, () => {
  console.log(`excalidraw-library listening on ${PORT}, origin=${ALLOWED_ORIGIN}`);
});
