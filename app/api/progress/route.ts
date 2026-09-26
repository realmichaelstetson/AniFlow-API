import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// In-memory progress cache (keyed by client IP / user identifier + anilistId + episode)
const progressStore = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { currentTime, duration, percent, anilistId, malId, episode, audio, completed } = body;

    const key = `${anilistId || malId || "unknown"}_${episode || 1}_${audio || "sub"}`;
    const record = {
      currentTime: Number(currentTime) || 0,
      duration: Number(duration) || 0,
      percent: Number(percent) || 0,
      anilistId: anilistId ? Number(anilistId) : null,
      malId: malId ? Number(malId) : null,
      episode: Number(episode) || 1,
      audio: audio || "sub",
      completed: Boolean(completed),
      updatedAt: Date.now(),
    };

    progressStore.set(key, record);

    return NextResponse.json(
      {
        success: true,
        saved: true,
        data: record,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save progress" },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const anilistId = searchParams.get("anilistId") || searchParams.get("anilist_id");
  const malId = searchParams.get("malId") || searchParams.get("mal_id");
  const episode = searchParams.get("episode") || "1";
  const audio = searchParams.get("audio") || "sub";

  const key = `${anilistId || malId || "unknown"}_${episode}_${audio}`;
  const record = progressStore.get(key);

  return NextResponse.json(
    {
      success: true,
      data: record || null,
    },
    { status: 200, headers: CORS_HEADERS }
  );
}
