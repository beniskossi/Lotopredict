import { DrawLayout } from "@/components/draw-layout"

interface DrawPageProps {
  params: Promise<{
    drawName: string
  }>
}

export default async function DrawPage({ params }: DrawPageProps) {
  const { drawName } = await params
  const decodedDrawName = decodeURIComponent(drawName)

  return <DrawLayout drawName={decodedDrawName} />
}
