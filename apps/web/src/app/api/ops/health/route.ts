import { NextResponse } from "next/server";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : "";
}

export async function GET(req: Request) {
  const required = String(process.env.OPS_HEALTH_TOKEN ?? "").trim();
  if (required) {
    const got = getBearer(req);
    if (!got || got !== required) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  const upstreamUrl = String(process.env.OPS_HEALTH_UPSTREAM_URL ?? "").trim();
  if (!upstreamUrl) {
    return NextResponse.json(
      { ok: false, error: "missing_upstream", hint: "set OPS_HEALTH_UPSTREAM_URL (Firebase opsHealth URL)" },
      { status: 500 }
    );
  }

  const upstreamSecret = String(process.env.OPS_HEALTH_UPSTREAM_SECRET ?? "").trim();
  const resp = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      ...(upstreamSecret ? { "X-Ops-Secret": upstreamSecret } : {})
    },
    // Avoid caching health checks at the edge.
    cache: "no-store"
  });

  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: {
      "content-type": resp.headers.get("content-type") ?? "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

