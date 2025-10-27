import { type NextRequest, NextResponse } from "next/server"
import { fetchLotteryResults, NetworkError, ValidationError, SyncError } from "@/lib/api/fetch-results"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { month } = body

    console.log(`[v0] Fetching results${month ? ` for month: ${month}` : ""}...`)

    const results = await fetchLotteryResults(month)
    console.log(`[v0] Fetched and synced ${results.length} results`)

    return NextResponse.json({
      success: true,
      data: results,
      count: results.length,
    })
  } catch (error: any) {
    console.error("[v0] Error in fetch-results API:", error)

    let statusCode = 500
    if (error instanceof NetworkError) {
      statusCode = error.status || 502
    } else if (error instanceof ValidationError) {
      statusCode = 400
    } else if (error instanceof SyncError) {
      statusCode = 503
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch results",
        errorType: error.name || "Error",
      },
      { status: statusCode },
    )
  }
}

export async function GET() {
  try {
    console.log("[v0] Fetching latest results via GET...")

    const results = await fetchLotteryResults()
    console.log(`[v0] Fetched and synced ${results.length} results`)

    return NextResponse.json({
      success: true,
      data: results,
      count: results.length,
    })
  } catch (error: any) {
    console.error("[v0] Error in fetch-results API:", error)

    let statusCode = 500
    if (error instanceof NetworkError) {
      statusCode = error.status || 502
    } else if (error instanceof ValidationError) {
      statusCode = 400
    } else if (error instanceof SyncError) {
      statusCode = 503
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch results",
        errorType: error.name || "Error",
      },
      { status: statusCode },
    )
  }
}
