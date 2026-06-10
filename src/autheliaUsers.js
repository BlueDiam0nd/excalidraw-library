// CRUD de usuários direto no users_database.yml do Authelia (única fonte de verdade).
// O container monta /opt/stacks/authelia/config; o Authelia recarrega o arquivo
// sozinho (authentication_backend.file.watch: true).
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import yaml from "js-yaml";
import argon2 from "argon2";

const USERS_FILE = process.env.AUTHELIA_USERS_FILE || null;

// mesmos parâmetros do hash já existente no users_database.yml
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export const USERNAME_RE = /^[a-z0-9_-]{2,32}$/;

export class UsersUnavailableError extends Error {
  constructor() {
    super("AUTHELIA_USERS_FILE não configurado ou arquivo inexistente");
    this.status = 503;
  }
}

const readDb = () => {
  if (!USERS_FILE || !existsSync(USERS_FILE)) throw new UsersUnavailableError();
  const db = yaml.load(readFileSync(USERS_FILE, "utf8")) || {};
  if (!db.users || typeof db.users !== "object") db.users = {};
  return db;
};

const writeDb = (db) => {
  const tmp = `${USERS_FILE}.tmp`;
  writeFileSync(tmp, yaml.dump(db, { lineWidth: -1, quotingType: "'" }), "utf8");
  renameSync(tmp, USERS_FILE);
};

export const listUsers = () =>
  Object.entries(readDb().users).map(([username, u]) => ({
    username,
    displayname: u.displayname ?? "",
    email: u.email ?? "",
    groups: u.groups ?? [],
  }));

export const userExists = (username) =>
  Object.hasOwn(readDb().users, username);

export const createUser = async ({ username, displayname, email, password, admin }) => {
  const db = readDb();
  if (Object.hasOwn(db.users, username)) {
    const err = new Error("usuário já existe");
    err.status = 409;
    throw err;
  }
  db.users[username] = {
    displayname: displayname || username,
    password: await argon2.hash(password, ARGON2_OPTS),
    email: email || "",
    groups: admin ? ["admins"] : ["users"],
  };
  writeDb(db);
};

export const deleteUser = (username) => {
  const db = readDb();
  if (!Object.hasOwn(db.users, username)) {
    const err = new Error("usuário não encontrado");
    err.status = 404;
    throw err;
  }
  delete db.users[username];
  writeDb(db);
};

export const setPassword = async (username, password) => {
  const db = readDb();
  if (!Object.hasOwn(db.users, username)) {
    const err = new Error("usuário não encontrado");
    err.status = 404;
    throw err;
  }
  db.users[username].password = await argon2.hash(password, ARGON2_OPTS);
  writeDb(db);
};
