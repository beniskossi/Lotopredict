import type { DrawResult } from "@/lib/types"

export async function fetchResults(page = 1, limit = 50, drawName?: string) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  })

  if (drawName) {
    params.append("drawName", drawName)
  }

  const response = await fetch(`/api/admin/results?${params}`)
  return response.json()
}

export async function createResult(result: Omit<DrawResult, "id" | "created_at" | "updated_at">) {
  const response = await fetch("/api/admin/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  })
  return response.json()
}

export async function updateResult(result: DrawResult) {
  const response = await fetch("/api/admin/results", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  })
  return response.json()
}

export async function deleteResult(id: string) {
  const response = await fetch(`/api/admin/results?id=${id}`, {
    method: "DELETE",
  })
  return response.json()
}

export async function importData(data: any[]) {
  const response = await fetch("/api/import-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  })
  return response.json()
}

export async function exportData(filters?: { drawName?: string; fromDate?: string; toDate?: string }) {
  const params = new URLSearchParams()

  if (filters?.drawName) params.append("drawName", filters.drawName)
  if (filters?.fromDate) params.append("fromDate", filters.fromDate)
  if (filters?.toDate) params.append("toDate", filters.toDate)

  const response = await fetch(`/api/import-export?${params}`)
  return response.json()
}
