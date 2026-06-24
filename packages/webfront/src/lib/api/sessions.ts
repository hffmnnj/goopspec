import type { CreateSessionOptions, OpenCodeClient, Session } from './types.js';

function sortByUpdatedAtDesc(a: Session, b: Session): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export async function fetchSessions(client: OpenCodeClient): Promise<Session[]> {
  const sessions = await client.listSessions();
  return [...sessions].sort(sortByUpdatedAtDesc);
}

export async function createSession(
  client: OpenCodeClient,
  opts: CreateSessionOptions = {}
): Promise<Session> {
  return client.createSession(opts);
}

export async function deleteSession(client: OpenCodeClient, id: string): Promise<void> {
  return client.deleteSession(id);
}

export async function renameSession(
  client: OpenCodeClient,
  id: string,
  title: string
): Promise<Session> {
  return client.renameSession(id, title);
}
