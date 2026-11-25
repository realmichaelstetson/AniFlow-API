import { NextRequest } from "next/server";
import { GET as playGET, OPTIONS as playOPTIONS } from "@/app/api/play/route";

export const dynamic = "force-dynamic";

export { playOPTIONS as OPTIONS };

export async function GET(request: NextRequest) {
  return playGET(request);
}
