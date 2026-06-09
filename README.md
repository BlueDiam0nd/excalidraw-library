# excalidraw-library

Backend + UI minimalista para listar/gerenciar URLs de cenas do Excalidraw self-hosted da BlueDiamond.

Roda em https://excalidraw-library.agenciabluediamond.com.

## Endpoints

- `POST /api/drawings` — `{ url, title? }` (chamado pelo frontend do Excalidraw quando uma share-URL é gerada)
- `GET /api/drawings` — lista (filtra por owner se `Remote-User` for setado pelo ForwardAuth)
- `PATCH /api/drawings/:id` — renomeia
- `DELETE /api/drawings/:id` — remove da biblioteca (não apaga o desenho em si)
- `GET /` — UI
- `GET /healthz` — healthcheck

## Vars

- `DATABASE_URL` — postgres://...
- `ALLOWED_ORIGIN` — origin do frontend (default `https://excalidraw.agenciabluediamond.com`)
- `PORT` — default 8080
