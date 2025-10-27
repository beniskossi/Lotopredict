// Service d'optimisation et compression des données
export interface CompressionMetrics {
 originalSize: number
 compressedSize: number
 compressionRatio: number
 compressionTime: number
 algorithm: 'lzstring' | 'gzip' | 'brotli' | 'custom'
}

export interface OptimizationResult {
 optimizedData: any
 metrics: CompressionMetrics
 recommendedAlgorithm: string
 savings: number
}

export class CompressionOptimizer {
 private static algorithms = ['lzstring', 'gzip', 'custom']

 // Compression LZ-String (rapide, bon pour JSON)
 static compressLZString(data: any): Promise<{compressed: string; metrics: CompressionMetrics}> {
  return new Promise(resolve => {
   const startTime = performance.now()
   const jsonString = JSON.stringify(data)
   const originalSize = new Blob([jsonString]).size

   // Implémentation LZ-String simplifiée
   const compressed = CompressionOptimizer.simpleLZCompress(jsonString)
   const compressedSize = new Blob([compressed]).size
   const compressionTime = performance.now() - startTime

   resolve({
    compressed,
    metrics: {
     originalSize,
     compressedSize,
     compressionRatio: ((originalSize - compressedSize) / originalSize) * 100,
     compressionTime,
     algorithm: 'lzstring'
    }
   })
  })
 }

 // Compression personnalisée pour données de loterie
 static compressLotteryData(data: any): Promise<{compressed: string; metrics: CompressionMetrics}> {
  return new Promise(resolve => {
   const startTime = performance.now()
   const jsonString = JSON.stringify(data)
   const originalSize = new Blob([jsonString]).size

   let compressed: string

   if (Array.isArray(data)) {
    // Optimisation spéciale pour les arrays de résultats
    compressed = CompressionOptimizer.compressDrawResultsArray(data)
   } else if (data.gagnants && Array.isArray(data.gagnants)) {
    // Optimisation pour un seul résultat
    compressed = CompressionOptimizer.compressDrawResult(data)
   } else {
    // Compression générique
    compressed = CompressionOptimizer.simpleLZCompress(jsonString)
   }

   const compressedSize = new Blob([compressed]).size
   const compressionTime = performance.now() - startTime

   resolve({
    compressed,
    metrics: {
     originalSize,
     compressedSize,
     compressionRatio: ((originalSize - compressedSize) / originalSize) * 100,
     compressionTime,
     algorithm: 'custom'
    }
   })
  })
 }

 // Décompression LZ-String
 static decompressLZString(compressed: string): Promise<any> {
  return new Promise(resolve => {
   const decompressed = CompressionOptimizer.simpleLZDecompress(compressed)
   resolve(JSON.parse(decompressed))
  })
 }

 // Décompression personnalisée
 static decompressLotteryData(compressed: string): Promise<any> {
  return new Promise(resolve => {
   try {
    // Vérifier le format
    if (compressed.startsWith('DR:')) {
     // Format de résultat unique
     resolve(CompressionOptimizer.decompressDrawResult(compressed))
    } else if (compressed.startsWith('DRA:')) {
     // Format d'array de résultats
     resolve(CompressionOptimizer.decompressDrawResultsArray(compressed))
    } else {
     // Format LZ générique
     const decompressed = CompressionOptimizer.simpleLZDecompress(compressed)
     resolve(JSON.parse(decompressed))
    }
   } catch (error) {
    // Fallback vers JSON normal
    resolve(JSON.parse(compressed))
   }
  })
 }

 // Trouver le meilleur algorithme de compression
 static async findBestCompression(data: any): Promise<OptimizationResult> {
  const results: Array<{algorithm: string; metrics: CompressionMetrics; compressed: string}> = []

  // Tester LZ-String
  try {
   const lzResult = await CompressionOptimizer.compressLZString(data)
   results.push({
    algorithm: 'lzstring',
    metrics: lzResult.metrics,
    compressed: lzResult.compressed
   })
  } catch (error) {
   console.warn('LZ-String compression failed:', error)
  }

  // Tester compression personnalisée
  try {
   const customResult = await CompressionOptimizer.compressLotteryData(data)
   results.push({
    algorithm: 'custom',
    metrics: customResult.metrics,
    compressed: customResult.compressed
   })
  } catch (error) {
   console.warn('Custom compression failed:', error)
  }

  // Trouver le meilleur ratio
  const best = results.reduce((best, current) => 
   current.metrics.compressionRatio > best.metrics.compressionRatio ? current : best
  )

  return {
   optimizedData: best.compressed,
   metrics: best.metrics,
   recommendedAlgorithm: best.algorithm,
   savings: best.metrics.originalSize - best.metrics.compressedSize
  }
 }

 // Compression spécialisée pour array de résultats de tirage
 private static compressDrawResultsArray(results: any[]): string {
  const compressed = {
   type: 'draw_results_array',
   count: results.length,
   data: results.map(result => ({
    n: result.draw_name,
    d: result.date,
    g: result.gagnants,
    m: result.machine || null
   }))
  }

  return 'DRA:' + CompressionOptimizer.simpleLZCompress(JSON.stringify(compressed))
 }

 // Décompression array de résultats
 private static decompressDrawResultsArray(compressed: string): any[] {
  const data = JSON.parse(CompressionOptimizer.simpleLZDecompress(compressed.substring(4)))
  
  return data.data.map((item: any) => ({
   draw_name: item.n,
   date: item.d,
   gagnants: item.g,
   machine: item.m
  }))
 }

 // Compression spécialisée pour un résultat de tirage
 private static compressDrawResult(result: any): string {
  const compressed = {
   n: result.draw_name,
   d: result.date,
   g: result.gagnants,
   m: result.machine || null
  }

  return 'DR:' + CompressionOptimizer.simpleLZCompress(JSON.stringify(compressed))
 }

 // Décompression résultat unique
 private static decompressDrawResult(compressed: string): any {
  const data = JSON.parse(CompressionOptimizer.simpleLZDecompress(compressed.substring(3)))
  
  return {
   draw_name: data.n,
   date: data.d,
   gagnants: data.g,
   machine: data.m
  }
 }

 // Implémentation LZ simple
 private static simpleLZCompress(input: string): string {
  if (!input) return ''
  
  const dictionary: Record<string, number> = {}
  const result: number[] = []
  let w = ''
  let dictSize = 256

  for (let i = 0; i < input.length; i++) {
   const c = input.charAt(i)
   const wc = w + c

   if (dictionary[wc] !== undefined) {
    w = wc
   } else {
    if (w !== '') {
     if (dictionary[w] !== undefined) {
      result.push(dictionary[w])
     } else {
      result.push(w.charCodeAt(0))
     }
    }
    dictionary[wc] = dictSize++
    w = c
   }
  }

  if (w !== '') {
   if (dictionary[w] !== undefined) {
    result.push(dictionary[w])
   } else {
    result.push(w.charCodeAt(0))
   }
  }

  return JSON.stringify(result)
 }

 // Décompression LZ simple
 private static simpleLZDecompress(compressed: string): string {
  try {
   const codes = JSON.parse(compressed)
   if (!Array.isArray(codes)) return compressed

   const dictionary: Record<number, string> = {}
   let w = String.fromCharCode(codes[0])
   let result = w
   let dictSize = 256

   for (let i = 1; i < codes.length; i++) {
    const k = codes[i]
    let entry: string

    if (dictionary[k] !== undefined) {
     entry = dictionary[k]
    } else if (k === dictSize) {
     entry = w + w.charAt(0)
    } else {
     return compressed // Fallback
    }

    result += entry
    dictionary[dictSize++] = w + entry.charAt(0)
    w = entry
   }

   return result
  } catch (error) {
   return compressed // Fallback
  }
 }

 // Optimiser automatiquement selon le type de données
 static async autoOptimize(data: any): Promise<OptimizationResult> {
  // Analyser le type de données
  const dataType = CompressionOptimizer.analyzeDataType(data)
  
  switch (dataType) {
   case 'lottery_array':
    return CompressionOptimizer.optimizeLotteryArray(data)
   case 'lottery_single':
    return CompressionOptimizer.optimizeLotterySingle(data)
   case 'json_generic':
   default:
    return CompressionOptimizer.optimizeGeneric(data)
  }
 }

 // Analyser le type de données
 private static analyzeDataType(data: any): string {
  if (Array.isArray(data) && data.length > 0 && data[0].gagnants) {
   return 'lottery_array'
  }
  if (data.gagnants && Array.isArray(data.gagnants)) {
   return 'lottery_single'
  }
  return 'json_generic'
 }

 // Optimisation spécifique pour array de loterie
 private static async optimizeLotteryArray(data: any[]): Promise<OptimizationResult> {
  const customResult = await CompressionOptimizer.compressLotteryData(data)
  
  return {
   optimizedData: customResult.compressed,
   metrics: customResult.metrics,
   recommendedAlgorithm: 'custom',
   savings: customResult.metrics.originalSize - customResult.metrics.compressedSize
  }
 }

 // Optimisation pour résultat unique
 private static async optimizeLotterySingle(data: any): Promise<OptimizationResult> {
  const customResult = await CompressionOptimizer.compressLotteryData(data)
  
  return {
   optimizedData: customResult.compressed,
   metrics: customResult.metrics,
   recommendedAlgorithm: 'custom',
   savings: customResult.metrics.originalSize - customResult.metrics.compressedSize
  }
 }

 // Optimisation générique
 private static async optimizeGeneric(data: any): Promise<OptimizationResult> {
  return CompressionOptimizer.findBestCompression(data)
 }

 // Obtenir les statistiques de compression
 static getCompressionStats(): {
  totalCompressed: number
  totalOriginal: number
  averageRatio: number
  algorithmUsage: Record<string, number>
 } {
  try {
   const stats = localStorage.getItem('compression_stats')
   if (stats) {
    return JSON.parse(stats)
   }
  } catch (error) {
   console.warn('Error loading compression stats:', error)
  }

  return {
   totalCompressed: 0,
   totalOriginal: 0,
   averageRatio: 0,
   algorithmUsage: {}
  }
 }

 // Enregistrer les statistiques
 static recordCompressionStats(metrics: CompressionMetrics): void {
  try {
   const currentStats = CompressionOptimizer.getCompressionStats()
   
   const newStats = {
    totalCompressed: currentStats.totalCompressed + metrics.compressedSize,
    totalOriginal: currentStats.totalOriginal + metrics.originalSize,
    averageRatio: 0, // Sera calculé
    algorithmUsage: {
     ...currentStats.algorithmUsage,
     [metrics.algorithm]: (currentStats.algorithmUsage[metrics.algorithm] || 0) + 1
    }
   }

   newStats.averageRatio = ((newStats.totalOriginal - newStats.totalCompressed) / newStats.totalOriginal) * 100

   localStorage.setItem('compression_stats', JSON.stringify(newStats))
  } catch (error) {
   console.warn('Error recording compression stats:', error)
  }
 }
}
