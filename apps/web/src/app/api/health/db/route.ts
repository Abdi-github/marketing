import { NextResponse } from "next/server";
import { db } from "@marketing/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: String(error) },
      { status: 503 },
    );
  }
}
