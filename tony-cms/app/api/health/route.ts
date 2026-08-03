import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ service: "tony-cms", status: "ok", version: "0.1.0" });
}
