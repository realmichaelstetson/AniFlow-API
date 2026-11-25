import { NextRequest, NextResponse } from "next/server";
import { handleTvPlay, CORS_HEADERS } from "@/lib/media-service";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  return handleTvPlay(request);
}
