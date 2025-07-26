// Processing and analysis types

export interface OCRRequest {
  imageUrl: string
  processingOptions: {
    detectHandwriting: boolean
    detectTables: boolean
    detectForms: boolean
  }
}

export interface OCRResponse {
  extractedText: TextBlock[]
  boundingBoxes: BoundingBox[]
  confidence: number
  processingTime: number
}

export interface TextBlock {
  id: string
  text: string
  confidence: number
  boundingBox: BoundingBox
  type: 'LINE' | 'WORD' | 'CELL'
}

export interface TextCleaningRequest {
  rawText: TextBlock[]
  cleaningOptions: {
    spellCheck: boolean
    removeArtifacts: boolean
    normalizeSpacing: boolean
  }
}

export interface CleanedText {
  originalId: string
  cleanedText: string
  corrections: TextCorrection[]
  confidence: number
}

export interface TextCorrection {
  original: string
  corrected: string
  confidence: number
  type: 'spelling' | 'artifact' | 'spacing'
}

export interface ClusteringRequest {
  textBlocks: CleanedText[]
  clusteringMethod: 'embeddings' | 'llm' | 'hybrid'
  targetClusters?: number
}

export interface ClusterResult {
  clusters: ClusterData[]
  unclustered: string[]
  confidence: number
}

export interface ClusterData {
  id: string
  label: string
  textBlocks: string[]
  centroid?: number[]
  confidence: number
}

export interface ProjectSummary {
  topThemes: ThemeSummary[]
  overallInsights: string
  distribution: ThemeDistribution[]
  representativeQuotes: Quote[]
  metadata: SummaryMetadata
}

export interface ThemeSummary {
  label: string
  noteCount: number
  percentage: number
  keyTerms: string[]
  representativeQuote: string
}

export interface ThemeDistribution {
  theme: string
  count: number
  percentage: number
}

export interface Quote {
  text: string
  theme: string
  confidence: number
  source: string
}

export interface SummaryMetadata {
  totalNotes: number
  processingTime: number
  clustersFound: number
  averageConfidence: number
  generatedAt: Date
}

export interface BoundingBox {
  left: number
  top: number
  width: number
  height: number
}