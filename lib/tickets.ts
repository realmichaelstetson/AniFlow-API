export interface TicketData {
  anilistId?: number;
  malId?: number;
  episode: number;
  audio: "sub" | "dub";
  server: string;
  startAt?: number;
  createdAt: number;
}

// Global in-memory ticket storage for `/embed?t={ticket}`
const globalTickets = global as unknown as { ticketStore?: Map<string, TicketData> };

export const ticketStore: Map<string, TicketData> =
  globalTickets.ticketStore || (globalTickets.ticketStore = new Map<string, TicketData>());
