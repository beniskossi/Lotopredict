// Service de compression optimisé pour la synchronisation
export interface CompressionResult {
  compressedData: string
  originalSize: number
  compressedSize: number
  compressionRatio: number
  algorithm: string
  compressionTime: number
}

export interface CompressionStats {
  totalCompressions: number
  totalOriginalSize: number
  totalCompressedSize: number
  averageCompressionRatio: number
  averageCompressionTime: number
  algorithmUsage: Record<string, number>
}

export class CompressionService {
  private static stats: CompressionStats = {
    totalCompressions: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    averageCompressionRatio: 0,
    averageCompressionTime: 0,
    algorithmUsage: {}
  }

  // Compression GZIP simplifiée pour le navigateur
  static async compressGzip(data: any): Promise<CompressionResult> {
    const startTime = performance.now()
    const jsonString = JSON.stringify(data)
    const originalSize = new Blob([jsonString]).size

    try {
      // Utiliser CompressionStream si disponible (navigateurs modernes)
      if ('CompressionStream' in window) {
        const stream = new CompressionStream('gzip')
        const writer = stream.writable.getWriter()
        const reader = stream.readable.getReader()

        const encoder = new TextEncoder()
        const chunks: Uint8Array[] = []

        // Écrire les données
        await writer.write(encoder.encode(jsonString))
        await writer.close()

        // Lire les données compressées
        let done = false
        while (!done) {
          const { value, done: readerDone } = await reader.read()
          done = readerDone
          if (value) chunks.push(value)
        }

        // Convertir en base64 pour le stockage
        const compressedArray = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
        let offset = 0
        for (const chunk of chunks) {
          compressedArray.set(chunk, offset)
          offset += chunk.length
        }

        const compressedData = btoa(String.fromCharCode(...compressedArray))
        const compressedSize = compressedArray.length
        const compressionTime = performance.now() - startTime

        CompressionService.updateStats({
          compressedData,
          originalSize,
          compressedSize,
          compressionRatio: compressedSize / originalSize,
          algorithm: 'gzip',
          compressionTime
        })

        return {
          compressedData,
          originalSize,
          compressedSize,
          compressionRatio: compressedSize / originalSize,
          algorithm: 'gzip',
          compressionTime
        }
      } else {
        // Fallback : compression LZ simple
        return CompressionService.compressLZ(data)
      }
    } catch (error) {
      console.warn('Compression GZIP échouée, fallback vers LZ:', error)
      return CompressionService.compressLZ(data)
    }
  }

  // Compression LZ simplifiée (fallback)
  static async compressLZ(data: any): Promise<CompressionResult> {
    const startTime = performance.now()
    const jsonString = JSON.stringify(data)
    const originalSize = new Blob([jsonString]).size

    // Algorithme LZ77 simplifié
    const compressed = CompressionService.lzCompress(jsonString)
    const compressedSize = new Blob([compressed]).size
    const compressionTime = performance.now() - startTime

    const result = {
      compressedData: compressed,
      originalSize,
      compressedSize,
      compressionRatio: compressedSize / originalSize,
      algorithm: 'lz-simple',
      compressionTime
    }

    CompressionService.updateStats(result)
    return result
  }

  // Décompression
  static async decompress(compressedResult: CompressionResult): Promise<any> {
    try {
      if (compressedResult.algorithm === 'gzip' && 'DecompressionStream' in window) {
        const stream = new DecompressionStream('gzip')
        const writer = stream.writable.getWriter()
        const reader = stream.readable.getReader()

        // Convertir de base64 vers Uint8Array
        const compressedArray = Uint8Array.from(atob(compressedResult.compressedData), c => c.charCodeAt(0))

        const chunks: Uint8Array[] = []

        // Écrire les données compressées
        await writer.write(compressedArray)
        await writer.close()

        // Lire les données décompressées
        let done = false
        while (!done) {
          const { value, done: readerDone } = await reader.read()
          done = readerDone
          if (value) chunks.push(value)
        }

        // Reconstruire la chaîne
        const decompressedArray = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
        let offset = 0
        for (const chunk of chunks) {
          decompressedArray.set(chunk, offset)
          offset += chunk.length
        }

        const decoder = new TextDecoder()
        const jsonString = decoder.decode(decompressedArray)
        return JSON.parse(jsonString)
      } else {
        // Fallback : décompression LZ
        const decompressed = CompressionService.lzDecompress(compressedResult.compressedData)
        return JSON.parse(decompressed)
      }
    } catch (error) {
      console.error('Erreur de décompression:', error)
      throw new Error('Impossible de décompresser les données')
    }
  }

  // Compression différentielle pour les mises à jour incrementales
  static async compressDifferential(oldData: any, newData: any): Promise<CompressionResult> {
    const startTime = performance.now()
    
    // Calculer les différences
    const diff = CompressionService.calculateDiff(oldData, newData)
    const diffString = JSON.stringify({
      type: 'differential',
      timestamp: Date.now(),
      diff
    })

    const originalSize = new Blob([JSON.stringify(newData)]).size
    const compressedSize = new Blob([diffString]).size
    const compressionTime = performance.now() - startTime

    const result = {
      compressedData: diffString,
      originalSize,
      compressedSize,
      compressionRatio: compressedSize / originalSize,
      algorithm: 'differential',
      compressionTime
    }

    CompressionService.updateStats(result)
    return result
  }

  // Algorithme LZ77 simplifié
  private static lzCompress(input: string): string {
    const dictionary: Record<string, number> = {}
    const result: string[] = []
    let dictSize = 256

    // Initialiser le dictionnaire avec les caractères ASCII
    for (let i = 0; i < 256; i++) {
      dictionary[String.fromCharCode(i)] = i
    }

    let w = ''
    for (const c of input) {
      const wc = w + c
      if (dictionary[wc] !== undefined) {
        w = wc
      } else {
        result.push(String.fromCharCode(dictionary[w]))
        dictionary[wc] = dictSize++
        w = c
      }
    }

    if (w) {
      result.push(String.fromCharCode(dictionary[w]))
    }

    return result.join('')
  }

  // Décompression LZ77 simplifiée
  private static lzDecompress(compressed: string): string {
    const dictionary: string[] = []
    let dictSize = 256

    // Initialiser le dictionnaire
    for (let i = 0; i < 256; i++) {
      dictionary[i] = String.fromCharCode(i)
    }

    const result: string[] = []
    let w = compressed[0]
    result.push(w)

    for (let i = 1; i < compressed.length; i++) {
      const k = compressed.charCodeAt(i)
      let entry: string

      if (dictionary[k] !== undefined) {
        entry = dictionary[k]
      } else if (k === dictSize) {
        entry = w + w[0]
      } else {
        throw new Error('Données compressées corrompues')
      }

      result.push(entry)
      dictionary[dictSize++] = w + entry[0]
      w = entry
    }

    return result.join('')
  }

  // Calculer les différences entre deux objets
  private static calculateDiff(oldData: any, newData: any): any {
    if (Array.isArray(oldData) && Array.isArray(newData)) {
      return CompressionService.calculateArrayDiff(oldData, newData)
    } else if (typeof oldData === 'object' && typeof newData === 'object') {
      return CompressionService.calculateObjectDiff(oldData, newData)
    } else {
      return newData !== oldData ? { type: 'replace', value: newData } : null
    }
  }

  private static calculateArrayDiff(oldArray: any[], newArray: any[]): any {
    const diff: any = { type: 'array', changes: [] }

    // Additions
    for (let i = oldArray.length; i < newArray.length; i++) {
      diff.changes.push({ type: 'add', index: i, value: newArray[i] })
    }

    // Modifications et suppressions
    for (let i = 0; i < Math.min(oldArray.length, newArray.length); i++) {
      const itemDiff = CompressionService.calculateDiff(oldArray[i], newArray[i])
      if (itemDiff) {
        diff.changes.push({ type: 'modify', index: i, diff: itemDiff })
      }
    }

    // Suppressions
    if (oldArray.length > newArray.length) {
      diff.changes.push({ type: 'remove', fromIndex: newArray.length, count: oldArray.length - newArray.length })
    }

    return diff.changes.length > 0 ? diff : null
  }

  private static calculateObjectDiff(oldObj: any, newObj: any): any {
    const diff: any = { type: 'object', changes: {} }

    // Nouvelles propriétés et modifications
    for (const key in newObj) {
      if (!(key in oldObj)) {
        diff.changes[key] = { type: 'add', value: newObj[key] }
      } else {
        const propDiff = CompressionService.calculateDiff(oldObj[key], newObj[key])
        if (propDiff) {
          diff.changes[key] = propDiff
        }
      }
    }

    // Propriétés supprimées
    for (const key in oldObj) {
      if (!(key in newObj)) {
        diff.changes[key] = { type: 'remove' }
      }
    }

    return Object.keys(diff.changes).length > 0 ? diff : null
  }

  // Mettre à jour les statistiques
  private static updateStats(result: CompressionResult): void {
    CompressionService.stats.totalCompressions++
    CompressionService.stats.totalOriginalSize += result.originalSize
    CompressionService.stats.totalCompressedSize += result.compressedSize

    // Recalculer les moyennes
    CompressionService.stats.averageCompressionRatio = 
      CompressionService.stats.totalCompressedSize / CompressionService.stats.totalOriginalSize

    CompressionService.stats.averageCompressionTime = 
      (CompressionService.stats.averageCompressionTime * (CompressionService.stats.totalCompressions - 1) + result.compressionTime) / 
      CompressionService.stats.totalCompressions

    // Compteur d'utilisation des algorithmes
    if (!CompressionService.stats.algorithmUsage[result.algorithm]) {
      CompressionService.stats.algorithmUsage[result.algorithm] = 0
    }
    CompressionService.stats.algorithmUsage[result.algorithm]++

    // Sauvegarder les stats
    try {
      localStorage.setItem('compression_stats', JSON.stringify(CompressionService.stats))
    } catch (e) {
      console.warn('Impossible de sauvegarder les stats de compression:', e)
    }
  }

  // Obtenir les statistiques
  static getStats(): CompressionStats {
    try {
      const saved = localStorage.getItem('compression_stats')
      if (saved) {
        CompressionService.stats = JSON.parse(saved)
      }
    } catch (e) {
      console.warn('Impossible de charger les stats de compression:', e)
    }
    return { ...CompressionService.stats }
  }

  // Réinitialiser les statistiques
  static resetStats(): void {
    CompressionService.stats = {
      totalCompressions: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      averageCompressionRatio: 0,
      averageCompressionTime: 0,
      algorithmUsage: {}
    }
    localStorage.removeItem('compression_stats')
  }

  // Estimer la taille compressée sans compresser réellement
  static estimateCompressionRatio(data: any): number {
    const jsonString = JSON.stringify(data)
    
    // Estimation basée sur l'entropie et la répétition
    const entropy = CompressionService.calculateEntropy(jsonString)
    const repetitionRatio = CompressionService.calculateRepetitionRatio(jsonString)
    
    // Formule empirique pour estimer le ratio de compression
    const estimatedRatio = Math.max(0.1, Math.min(1, entropy * (1 - repetitionRatio * 0.5)))
    
    return estimatedRatio
  }

  private static calculateEntropy(text: string): number {
    const freq: Record<string, number> = {}
    
    for (const char of text) {
      freq[char] = (freq[char] || 0) + 1
    }
    
    let entropy = 0
    const len = text.length
    
    for (const count of Object.values(freq)) {
      const p = count / len
      entropy -= p * Math.log2(p)
    }
    
    return entropy / 8 // Normaliser
  }

  private static calculateRepetitionRatio(text: string): number {
    const length = text.length
    let repetitions = 0
    
    // Chercher des patterns répétés simples
    for (let i = 1; i <= Math.min(10, length / 2); i++) {
      const pattern = text.slice(0, i)
      let pos = i
      
      while (pos + i <= length && text.slice(pos, pos + i) === pattern) {
        repetitions += i
        pos += i
      }
    }
    
    return repetitions / length
  }
}
