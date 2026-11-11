import { PayBridgeError } from "../errors";
import type { ExpressLikeRequest } from "../types";

export async function readWebhookBody(req: ExpressLikeRequest): Promise<string> {
  if (typeof req.rawBody === "string") {
    return req.rawBody;
  }

  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.toString("utf8");
  }

  if (typeof req.body === "string") {
    return req.body;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }

  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }

  if (req.readableEnded) {
    return "";
  }

  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (error) => {
      reject(
        new PayBridgeError({
          code: "INVALID_REQUEST",
          message: "Unable to read the webhook request body.",
          originalError: error
        })
      );
    });
  });
}
