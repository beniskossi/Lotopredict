import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { operation, data } = await request.json()

    const supabase = await createClient()

    switch (operation) {
      case "fetch-all":
        const { data: allResults, error: fetchError } = await supabase
          .from("draw_results")
          .select("*")
          .order("draw_date", { ascending: false })

        if (fetchError) throw fetchError

        return NextResponse.json({ success: true, data: allResults })

      case "fetch-by-draw":
        const { data: drawResults, error: drawError } = await supabase
          .from("draw_results")
          .select("*")
          .eq("draw_name", data.drawName)
          .order("draw_date", { ascending: false })

        if (drawError) throw drawError

        return NextResponse.json({ success: true, data: drawResults })

      case "fetch-recent":
        const { data: recentResults, error: recentError } = await supabase
          .from("draw_results")
          .select("*")
          .gte("draw_date", data.fromDate)
          .order("draw_date", { ascending: false })

        if (recentError) throw recentError

        return NextResponse.json({ success: true, data: recentResults })

      default:
        return NextResponse.json({ success: false, error: "Invalid operation" }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[v0] Sync API error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
