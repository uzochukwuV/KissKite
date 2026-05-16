import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { logger } from "./logger";
import type { Signal } from "@workspace/db";

interface AuthenticatedClient {
  ws: WebSocket;
  walletAddress: string;
  tier: string;
  sessionToken: string;
}

const clients = new Set<AuthenticatedClient>();

export function createWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
    const sessionToken = request.headers["x-kite-session-token"];

    if (!sessionToken || typeof sessionToken !== "string") {
      logger.warn("WebSocket connection rejected: missing session token");
      ws.close(4001, "Missing x-kite-session-token header");
      return;
    }

    const verification = await verifySession(sessionToken);

    if (!verification.valid) {
      logger.warn({ sessionToken: sessionToken.slice(0, 8) }, "WebSocket connection rejected: invalid session");
      ws.close(4001, "Unauthorized Kite Session Token");
      return;
    }

    const client: AuthenticatedClient = {
      ws,
      walletAddress: verification.walletAddress!,
      tier: verification.tier!,
      sessionToken,
    };

    clients.add(client);
    logger.info(
      { walletAddress: client.walletAddress, tier: client.tier, total: clients.size },
      "WebSocket subscriber connected"
    );

    ws.send(
      JSON.stringify({
        type: "connected",
        data: {
          walletAddress: client.walletAddress,
          tier: client.tier,
          message: "Connected to Kite Signal Stream",
        },
      })
    );

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; filter?: string };
        logger.debug({ walletAddress: client.walletAddress, msg }, "WS message received");

        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      clients.delete(client);
      logger.info(
        { walletAddress: client.walletAddress, total: clients.size },
        "WebSocket subscriber disconnected"
      );
    });

    ws.on("error", (err) => {
      logger.error({ err, walletAddress: client.walletAddress }, "WebSocket error");
      clients.delete(client);
    });
  });

  logger.info("WebSocket server initialized at /ws");
  return wss;
}

export function broadcastSignal(signal: Signal): void {
  const payload = JSON.stringify({
    type: "signal",
    data: signal,
    ts: Date.now(),
  });

  let sent = 0;
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
      sent++;
    }
  }

  logger.info({ signalId: signal.id, recipients: sent }, "Signal broadcast");
}

export function broadcastSettlement(signal: Signal): void {
  const payload = JSON.stringify({
    type: "settlement",
    data: signal,
    ts: Date.now(),
  });

  let sent = 0;
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
      sent++;
    }
  }

  logger.info({ signalId: signal.id, recipients: sent }, "Settlement broadcast");
}

export function getConnectedCount(): number {
  return clients.size;
}

// Internal verify — calls the /api/subscribers/verify endpoint internally via DB
async function verifySession(
  sessionToken: string
): Promise<{ valid: boolean; walletAddress?: string; tier?: string }> {
  try {
    const { db, subscribersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const rows = await db
      .select()
      .from(subscribersTable)
      .where(eq(subscribersTable.sessionToken, sessionToken));

    if (rows.length === 0) return { valid: false };

    const subscriber = rows[0];
    const now = new Date();
    if (subscriber.expiresAt <= now) return { valid: false };

    return {
      valid: true,
      walletAddress: subscriber.walletAddress,
      tier: subscriber.tier,
    };
  } catch (err) {
    logger.error({ err }, "Session verification failed");
    return { valid: false };
  }
}
