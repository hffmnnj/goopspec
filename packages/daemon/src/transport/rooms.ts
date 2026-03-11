import type { ServerWebSocket } from "bun";

export class RoomManager<TData = unknown> {
  private readonly roomConnections = new Map<string, Set<ServerWebSocket<TData>>>();
  private readonly connectionRooms = new WeakMap<ServerWebSocket<TData>, Set<string>>();

  join(ws: ServerWebSocket<TData>, room: string): void {
    let connections = this.roomConnections.get(room);
    if (!connections) {
      connections = new Set<ServerWebSocket<TData>>();
      this.roomConnections.set(room, connections);
    }

    connections.add(ws);
    this.getOrCreateConnectionRooms(ws).add(room);
  }

  leave(ws: ServerWebSocket<TData>, room: string): void {
    const connections = this.roomConnections.get(room);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        this.roomConnections.delete(room);
      }
    }

    const rooms = this.connectionRooms.get(ws);
    if (rooms) {
      rooms.delete(room);
      if (rooms.size === 0) {
        this.connectionRooms.delete(ws);
      }
    }
  }

  leaveAll(ws: ServerWebSocket<TData>): void {
    const rooms = this.connectionRooms.get(ws);
    if (!rooms) {
      return;
    }

    for (const room of rooms) {
      const connections = this.roomConnections.get(room);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          this.roomConnections.delete(room);
        }
      }
    }

    this.connectionRooms.delete(ws);
  }

  broadcast(room: string, message: string, exclude?: ServerWebSocket<TData>): void {
    const connections = this.roomConnections.get(room);
    if (!connections) {
      return;
    }

    for (const ws of connections) {
      if (exclude && ws === exclude) {
        continue;
      }
      ws.send(message);
    }
  }

  getRooms(ws: ServerWebSocket<TData>): Set<string> {
    return new Set(this.connectionRooms.get(ws) ?? []);
  }

  getConnectionCount(room: string): number {
    return this.roomConnections.get(room)?.size ?? 0;
  }

  private getOrCreateConnectionRooms(ws: ServerWebSocket<TData>): Set<string> {
    let rooms = this.connectionRooms.get(ws);
    if (!rooms) {
      rooms = new Set<string>();
      this.connectionRooms.set(ws, rooms);
    }
    return rooms;
  }
}
