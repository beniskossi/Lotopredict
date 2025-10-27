import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// POST - Import data from JSON
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { data: importData } = await request.json()

    if (!Array.isArray(importData)) {
      return NextResponse.json({ success: false, error: "Invalid data format" }, { status: 400 })
    }

    // Validate data structure
    const validData = importData.filter(
      (item) =>
        item.draw_name && item.draw_date && Array.isArray(item.winning_numbers) && item.winning_numbers.length === 5,
    )

    if (validData.length === 0) {
      return NextResponse.json({ success: false, error: "No valid data to import" }, { status: 400 })
    }

    const { data, error } = await supabase.from("draw_results").upsert(validData, {
      onConflict: "draw_name,draw_date",
    })

    if (error) throw error

    return NextResponse.json({
      success: true,
      imported: validData.length,
      skipped: importData.length - validData.length,
    })
  } catch (error: any) {
    console.error("[v0] Import error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// GET - Export data to JSON
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const drawName = searchParams.get("drawName")
    const fromDate = searchParams.get("fromDate")
    const toDate = searchParams.get("toDate")

    let query = supabase.from("draw_results").select("*").order("draw_date", { ascending: false })

    if (drawName) {
      query = query.eq("draw_name", drawName)
    }

    if (fromDate) {
      query = query.gte("draw_date", fromDate)
    }

    if (toDate) {
      query = query.lte("draw_date", toDate)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data,
      exportDate: new Date().toISOString(),
      count: data?.length || 0,
    })
  } catch (error: any) {
    console.error("[v0] Export error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
