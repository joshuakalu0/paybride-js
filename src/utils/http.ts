import http from "node:http";
import https from "node:https";

import type { GatewayName } from "../constants";
import { PayBridgeError, toPayBridgeError } from "../errors";
import { buildFormPayload } from "./form";

type HttpMethod = "GET" | "POST";

interface RequestOptions {
  form?: Record<string, unknown>;
  gateway: GatewayName;
  headers?: Record<string, string>;
  json?: unknown;
  method: HttpMethod;
  timeoutMs?: number;
  url: string;
}

interface HttpResponse {
  body: string;
  headers: http.IncomingHttpHeaders;
  statusCode: number;
}

export async function requestJson<T>(options: RequestOptions): Promise<T> {
  const response = await requestText(options);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new PayBridgeError({
      code: "GATEWAY_ERROR",
      gateway: options.gateway,
      message: `Gateway request failed with status ${response.statusCode}.`,
      originalError: response.body
    });
  }

  if (!response.body) {
    return {} as T;
  }

  try {
    return JSON.parse(response.body) as T;
  } catch (error) {
    throw toPayBridgeError(error, {
      code: "PARSE_ERROR",
      gateway: options.gateway,
      message: "Gateway response could not be parsed as JSON."
    });
  }
}

export async function requestText(options: RequestOptions): Promise<HttpResponse> {
  const url = new URL(options.url);
  const transport = url.protocol === "https:" ? https : http;

  const body =
    options.json !== undefined
      ? JSON.stringify(options.json)
      : options.form !== undefined
        ? buildFormPayload(options.form).toString()
        : undefined;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers
  };

  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = options.json !== undefined ? "application/json" : "application/x-www-form-urlencoded";
  }

  if (body !== undefined) {
    headers["Content-Length"] = Buffer.byteLength(body).toString();
  }

  return await new Promise<HttpResponse>((resolve, reject) => {
    const request = transport.request(
      url,
      {
        headers,
        method: options.method
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            statusCode: response.statusCode ?? 500
          });
        });
      }
    );

    request.on("error", (error) => {
      reject(
        toPayBridgeError(error, {
          code: "NETWORK_ERROR",
          gateway: options.gateway,
          message: `Gateway request to ${url.origin} failed.`
        })
      );
    });

    request.setTimeout(options.timeoutMs ?? 10_000, () => {
      request.destroy(
        new PayBridgeError({
          code: "NETWORK_ERROR",
          gateway: options.gateway,
          message: `Gateway request to ${url.origin} timed out.`
        })
      );
    });

    if (body !== undefined) {
      request.write(body);
    }

    request.end();
  });
}
