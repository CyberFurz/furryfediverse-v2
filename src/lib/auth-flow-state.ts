import crypto from "crypto";
import { prisma } from "./prisma";

const DEFAULT_TTL_SECONDS = 10 * 60;

export type AuthFlowStateRecord<T> = {
  state: string;
  kind: string;
  payload: T;
  expiresAt: Date;
  createdAt: Date;
};

export async function createAuthFlowState<T>(
  kind: string,
  payload: T,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const state = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await prisma.authFlowState.create({
    data: {
      state,
      kind,
      payload: JSON.stringify(payload),
      expiresAt,
    },
  });

  return state;
}

async function getAuthFlowStateRow(state: string) {
  const row = await prisma.authFlowState.findUnique({
    where: { state },
  });

  if (!row) {
    return null;
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.authFlowState.delete({ where: { state } }).catch(() => null);
    return null;
  }

  if (row.consumedAt) {
    return null;
  }

  return row;
}

export async function readAuthFlowState<T>(
  kind: string,
  state: string,
): Promise<AuthFlowStateRecord<T> | null> {
  const row = await getAuthFlowStateRow(state);
  if (!row || row.kind !== kind) {
    return null;
  }

  try {
    return {
      state: row.state,
      kind: row.kind,
      payload: JSON.parse(row.payload) as T,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  } catch {
    await prisma.authFlowState.delete({ where: { state } }).catch(() => null);
    return null;
  }
}

export async function consumeAuthFlowState<T>(
  kind: string,
  state: string,
): Promise<AuthFlowStateRecord<T> | null> {
  const now = new Date();
  const result = await prisma.authFlowState.updateMany({
    where: {
      state,
      kind,
      consumedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      consumedAt: now,
    },
  });

  if (result.count !== 1) {
    return null;
  }

  const row = await prisma.authFlowState.findUnique({
    where: { state },
  });

  if (!row) {
    return null;
  }

  try {
    return {
      state: row.state,
      kind: row.kind,
      payload: JSON.parse(row.payload) as T,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  } catch {
    return null;
  }
}
