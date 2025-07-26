import OpenAI from 'openai';
import { ClusterRepository } from '../models/ClusterRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { v4 as uuidv4 } from 'uuid';
import type { 
  ClusteringRequest, 
  ClusterResult, 
  ClusterData, 
  CleanedText 
} from 'chicken-scratch-shared/types/processing';
import type { 
  Note, 
  CreateClusterInput 
} from 'chicken-scratch-shared/types/models';

// Import clustering algorithms
import { kmeans } from 'ml-kmeans';
import { agnes } from 'ml-hclust';

// Configuration for OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class ClusteringService {
  private clusterRepository: ClusterRepository;
  private noteRepository: NoteRepository;

  constructor() {
    this.clusterRepository = new ClusterRepository();
    this.noteRepository = new NoteRepository();
  }

  /**
   * Process clustering request and generate clusters
   */
  async processClustering(
    projectId: string, 
    request: ClusteringRequest
  ): Promise<ClusterResult> {
    try {
      // Validate request
      if (!request.textBlocks || request.textBlocks.length === 0) {
        throw new Error('No text blocks provided for clustering');
      }

      // Choose clustering method based on request
      let clusterResult: ClusterResult;
      switch (request.clusteringMethod) {
        case 'embeddings':
          clusterResult = await this.processEmbeddingClustering(projectId, request);
          break;
        case 'llm':
          clusterResult = await this.processLLMClustering(projectId, request);
          break;
        case 'hybrid':
          clusterResult = await this.processHybridClustering(projectId, request);
          break;
        default:
          throw new Error(`Unsupported clustering method: ${request.clusteringMethod}`);
      }

      // Save clusters to database
      await this.saveClustersToDatabase(projectId, clusterResult);

      return clusterResult;
    } catch (error) {
      console.error('Error in clustering service:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for text blocks using OpenAI API
   */
  async generateEmbeddings(textBlocks: CleanedText[]): Promise<Map<string, number[]>> {
    const embeddingMap = new Map<string, number[]>();
    const batchSize = 20; // Process in batches to avoid rate limits

    // Process in batches
    for (let i = 0; i < textBlocks.length; i += batchSize) {
      const batch = textBlocks.slice(i, i + batchSize);
      const texts = batch.map(block => block.cleanedText);

      try {
        const response = await openai.createEmbedding({
          model: "text-embedding-ada-002",
          input: texts,
        });

        // Map embeddings to original IDs
        response.data.data.forEach((item, index) => {
          embeddingMap.set(batch[index].originalId, item.embedding);
        });
      } catch (error) {
        console.error('Error generating embeddings:', error);
        throw error;
      }
    }

    return embeddingMap;
  }

  /**
   * Update note embeddings in the database
   */
  async updateNoteEmbeddings(embeddingMap: Map<string, number[]>): Promise<void> {
    const noteEmbeddings = Array.from(embeddingMap.entries()).map(([noteId, embedding]) => ({
      noteId,
      embedding
    }));

    await this.noteRepository.updateEmbeddings(noteEmbeddings);
  }

  /**
   * Process clustering using embeddings and K-means or hierarchical clustering
   */
  async processEmbeddingClustering(
    projectId: string, 
    request: ClusteringRequest
  ): Promise<ClusterResult> {
    // Generate embeddings for text blocks
    const embeddingMap = await this.generateEmbeddings(request.textBlocks);
    
    // Update note embeddings in database
    await this.updateNoteEmbeddings(embeddingMap);

    // Prepare data for clustering
    const noteIds = request.textBlocks.map(block => block.originalId);
    const embeddings = request.textBlocks.map(block => {
      const embedding = embeddingMap.get(block.originalId);
      if (!embedding) {
        throw new Error(`No embedding found for note ID: ${block.originalId}`);
      }
      return embedding;
    });

    // Determine number of clusters
    const targetClusters = request.targetClusters || 
      Math.max(2, Math.min(10, Math.ceil(Math.sqrt(request.textBlocks.length / 2))));

    // Perform K-means clustering
    const { clusters, centroids } = kmeans(embeddings, targetClusters, {
      initialization: 'kmeans++',
      seed: 42,
      maxIterations: 100
    });

    // Group notes by cluster
    const clusterGroups: Map<number, string[]> = new Map();
    clusters.forEach((clusterIndex, i) => {
      if (!clusterGroups.has(clusterIndex)) {
        clusterGroups.set(clusterIndex, []);
      }
      clusterGroups.get(clusterIndex)?.push(noteIds[i]);
    });

    // Generate cluster data
    const clusterData: ClusterData[] = Array.from(clusterGroups.entries()).map(([clusterIndex, textBlockIds]) => {
      // Calculate confidence based on distance to centroid
      const clusterEmbeddings = textBlockIds.map(id => embeddingMap.get(id)!);
      const centroid = centroids[clusterIndex];
      const confidence = this.calculateClusterConfidence(clusterEmbeddings, centroid);

      return {
        id: uuidv4(),
        label: `Cluster ${clusterIndex + 1}`,
        textBlocks: textBlockIds,
        centroid: centroid,
        confidence
      };
    });

    // Sort clusters by confidence
    clusterData.sort((a, b) => b.confidence - a.confidence);

    // Calculate overall confidence
    const overallConfidence = clusterData.reduce(
      (sum, cluster) => sum + cluster.confidence * cluster.textBlocks.length, 
      0
    ) / request.textBlocks.length;

    return {
      clusters: clusterData,
      unclustered: [],
      confidence: overallConfidence
    };
  }

  /**
   * Process clustering using hierarchical clustering (alternative to K-means)
   */
  async processHierarchicalClustering(
    projectId: string,
    request: ClusteringRequest,
    embeddingMap: Map<string, number[]>
  ): Promise<ClusterData[]> {
    // Prepare data for clustering
    const noteIds = request.textBlocks.map(block => block.originalId);
    const embeddings = request.textBlocks.map(block => {
      const embedding = embeddingMap.get(block.originalId);
      if (!embedding) {
        throw new Error(`No embedding found for note ID: ${block.originalId}`);
      }
      return embedding;
    });

    // Determine number of clusters
    const targetClusters = request.targetClusters || 
      Math.max(2, Math.min(10, Math.ceil(Math.sqrt(request.textBlocks.length / 2))));

    // Calculate distance matrix
    const distanceMatrix = this.calculateDistanceMatrix(embeddings);

    // Perform hierarchical clustering
    const hclust = agnes(distanceMatrix, {
      method: 'ward'
    });

    // Cut the dendrogram to get the desired number of clusters
    const clusterAssignments = hclust.group(targetClusters);

    // Group notes by cluster
    const clusterGroups: Map<number, string[]> = new Map();
    clusterAssignments.forEach((clusterIndex, i) => {
      if (!clusterGroups.has(clusterIndex)) {
        clusterGroups.set(clusterIndex, []);
      }
      clusterGroups.get(clusterIndex)?.push(noteIds[i]);
    });

    // Generate cluster data
    const clusterData: ClusterData[] = Array.from(clusterGroups.entries()).map(([clusterIndex, textBlockIds]) => {
      // Calculate centroid for the cluster
      const clusterEmbeddings = textBlockIds.map(id => embeddingMap.get(id)!);
      const centroid = this.calculateCentroid(clusterEmbeddings);
      const confidence = this.calculateClusterConfidence(clusterEmbeddings, centroid);

      return {
        id: uuidv4(),
        label: `Cluster ${clusterIndex + 1}`,
        textBlocks: textBlockIds,
        centroid: centroid,
        confidence
      };
    });

    // Sort clusters by confidence
    return clusterData.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Process clustering using LLM-based approach
   */
  async processLLMClustering(
    projectId: string, 
    request: ClusteringRequest
  ): Promise<ClusterResult> {
    // Extract text content for LLM processing
    const textContent = request.textBlocks.map((block, index) => 
      `Note ${index + 1}: "${block.cleanedText}"`
    ).join('\n');

    // Create few-shot prompt for clustering
    const prompt = this.createClusteringPrompt(textContent, request.targetClusters);

    try {
      // Call OpenAI API for clustering
      const response = await openai.createChatCompletion({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that specializes in semantic clustering of text."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 2000
      });

      // Parse the response to extract clusters
      const clusterResult = this.parseLLMClusteringResponse(
        response.data.choices[0].message?.content || "",
        request.textBlocks
      );

      return clusterResult;
    } catch (error) {
      console.error('Error in LLM clustering:', error);
      throw error;
    }
  }

  /**
   * Create prompt for LLM-based clustering
   */
  private createClusteringPrompt(textContent: string, targetClusters?: number): string {
    const clusterCountHint = targetClusters 
      ? `Try to create approximately ${targetClusters} clusters.`
      : 'Create an appropriate number of clusters based on the semantic similarity of the notes.';

    return `
I have a set of text notes that I need to cluster based on semantic similarity. 
${clusterCountHint}

Here are the notes:
${textContent}

Please analyze these notes and group them into clusters based on their semantic meaning.
For each cluster, provide:
1. A descriptive label that captures the theme
2. The note numbers that belong to this cluster
3. A confidence score between 0 and 1 indicating how cohesive this cluster is

Format your response as a JSON object with the following structure:
{
  "clusters": [
    {
      "label": "Descriptive theme label",
      "notes": [1, 2, 5],
      "confidence": 0.85
    },
    {
      "label": "Another theme label",
      "notes": [3, 4, 7],
      "confidence": 0.92
    }
  ],
  "unclustered": [6, 8],
  "overallConfidence": 0.88
}

Only respond with valid JSON that matches this structure.
`;
  }

  /**
   * Parse LLM response to extract clusters
   */
  private parseLLMClusteringResponse(
    response: string, 
    textBlocks: CleanedText[]
  ): ClusterResult {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/```json\n([\s\S]*)\n```/) || 
                       response.match(/```\n([\s\S]*)\n```/) ||
                       response.match(/{[\s\S]*}/);
      
      const jsonContent = jsonMatch ? jsonMatch[0].replace(/```json\n|```\n|```/g, '') : response;
      const result = JSON.parse(jsonContent);

      // Map note numbers to note IDs
      const clusterData: ClusterData[] = result.clusters.map((cluster: any) => {
        const textBlockIds = cluster.notes.map((noteNum: number) => {
          const index = noteNum - 1;
          return index >= 0 && index < textBlocks.length ? textBlocks[index].originalId : null;
        }).filter(Boolean);

        return {
          id: uuidv4(),
          label: cluster.label,
          textBlocks: textBlockIds,
          confidence: cluster.confidence
        };
      });

      // Map unclustered notes
      const unclustered = (result.unclustered || []).map((noteNum: number) => {
        const index = noteNum - 1;
        return index >= 0 && index < textBlocks.length ? textBlocks[index].originalId : null;
      }).filter(Boolean);

      return {
        clusters: clusterData,
        unclustered,
        confidence: result.overallConfidence || 0.7
      };
    } catch (error) {
      console.error('Error parsing LLM clustering response:', error, 'Response:', response);
      throw new Error('Failed to parse LLM clustering response');
    }
  }

  /**
   * Process clustering using hybrid approach (combining embeddings and LLM)
   */
  async processHybridClustering(
    projectId: string, 
    request: ClusteringRequest
  ): Promise<ClusterResult> {
    // Generate embeddings for text blocks
    const embeddingMap = await this.generateEmbeddings(request.textBlocks);
    
    // Update note embeddings in database
    await this.updateNoteEmbeddings(embeddingMap);

    // First, perform embedding-based clustering
    const embeddingClusters = await this.processHierarchicalClustering(
      projectId,
      request,
      embeddingMap
    );

    // Then, use LLM to refine cluster labels and confidence
    const refinedClusters = await this.refineClustersWithLLM(
      embeddingClusters,
      request.textBlocks
    );

    // Calculate overall confidence
    const overallConfidence = refinedClusters.reduce(
      (sum, cluster) => sum + cluster.confidence * cluster.textBlocks.length, 
      0
    ) / request.textBlocks.length;

    return {
      clusters: refinedClusters,
      unclustered: [],
      confidence: overallConfidence
    };
  }

  /**
   * Refine clusters using LLM for better labeling and confidence scoring
   */
  private async refineClustersWithLLM(
    clusters: ClusterData[],
    textBlocks: CleanedText[]
  ): Promise<ClusterData[]> {
    // Create a map of text block IDs to their content
    const textBlockMap = new Map<string, string>();
    textBlocks.forEach(block => {
      textBlockMap.set(block.originalId, block.cleanedText);
    });

    // Process each cluster to refine its label and confidence
    const refinedClusters: ClusterData[] = [];

    for (const cluster of clusters) {
      // Get text content for this cluster
      const clusterTexts = cluster.textBlocks
        .map(id => textBlockMap.get(id))
        .filter(Boolean) as string[];

      if (clusterTexts.length === 0) continue;

      // Create prompt for refining this cluster
      const prompt = `
I have a cluster of related text notes. Please analyze these notes and:
1. Provide a concise, descriptive label that captures the theme
2. Assign a confidence score between 0 and 1 indicating how cohesive this cluster is

Here are the notes in this cluster:
${clusterTexts.map((text, i) => `Note ${i + 1}: "${text}"`).join('\n')}

Format your response as a JSON object with the following structure:
{
  "label": "Descriptive theme label",
  "confidence": 0.85
}

Only respond with valid JSON that matches this structure.
`;

      try {
        // Call OpenAI API for cluster refinement
        const response = await openai.createChatCompletion({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that specializes in semantic analysis and labeling."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 500
        });

        // Parse the response
        const content = response.data.choices[0].message?.content || "";
        const jsonMatch = content.match(/```json\n([\s\S]*)\n```/) || 
                         content.match(/```\n([\s\S]*)\n```/) ||
                         content.match(/{[\s\S]*}/);
        
        const jsonContent = jsonMatch ? jsonMatch[0].replace(/```json\n|```\n|```/g, '') : content;
        const result = JSON.parse(jsonContent);

        // Create refined cluster
        refinedClusters.push({
          ...cluster,
          label: result.label || cluster.label,
          confidence: result.confidence || cluster.confidence
        });
      } catch (error) {
        console.error('Error refining cluster with LLM:', error);
        // If refinement fails, keep the original cluster
        refinedClusters.push(cluster);
      }
    }

    return refinedClusters;
  }

  /**
   * Save clusters to database and assign notes to clusters
   */
  private async saveClustersToDatabase(
    projectId: string, 
    clusterResult: ClusterResult
  ): Promise<void> {
    // Use transaction to ensure all operations succeed or fail together
    await this.clusterRepository.executeInTransaction(async (client) => {
      // Create clusters in database
      for (const cluster of clusterResult.clusters) {
        const clusterInput: CreateClusterInput = {
          projectId,
          label: cluster.label,
          textBlocks: cluster.textBlocks,
          centroid: cluster.centroid,
          confidence: cluster.confidence
        };

        // Create cluster
        const createdCluster = await this.clusterRepository.create(clusterInput);
        
        // Assign notes to cluster
        if (cluster.textBlocks.length > 0) {
          await this.noteRepository.assignToCluster(cluster.textBlocks, createdCluster.id);
        }
      }
    });
  }

  /**
   * Calculate distance matrix for hierarchical clustering
   */
  private calculateDistanceMatrix(vectors: number[][]): number[][] {
    const n = vectors.length;
    const distanceMatrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const distance = this.cosineSimilarityToDistance(
          this.calculateCosineSimilarity(vectors[i], vectors[j])
        );
        distanceMatrix[i][j] = distance;
        distanceMatrix[j][i] = distance;
      }
    }
    
    return distanceMatrix;
  }

  /**
   * Calculate centroid of a set of vectors
   */
  private calculateCentroid(vectors: number[][]): number[] {
    if (vectors.length === 0) {
      return [];
    }
    
    const dimensions = vectors[0].length;
    const centroid = new Array(dimensions).fill(0);
    
    for (const vector of vectors) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] += vector[i];
      }
    }
    
    for (let i = 0; i < dimensions; i++) {
      centroid[i] /= vectors.length;
    }
    
    return centroid;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Convert cosine similarity to distance (for clustering algorithms)
   */
  private cosineSimilarityToDistance(similarity: number): number {
    return 1 - similarity;
  }

  /**
   * Calculate cluster confidence based on distance to centroid
   */
  private calculateClusterConfidence(vectors: number[][], centroid: number[]): number {
    if (vectors.length === 0) {
      return 0;
    }
    
    // Calculate average similarity to centroid
    let totalSimilarity = 0;
    
    for (const vector of vectors) {
      totalSimilarity += this.calculateCosineSimilarity(vector, centroid);
    }
    
    const avgSimilarity = totalSimilarity / vectors.length;
    
    // Scale similarity to confidence (0.5-1.0 range)
    return 0.5 + (avgSimilarity * 0.5);
  }

  /**
   * Get clusters for a project
   */
  async getProjectClusters(projectId: string): Promise<ClusterData[]> {
    const clusters = await this.clusterRepository.findByProjectId(projectId);
    return clusters.map(cluster => ({
      id: cluster.id,
      label: cluster.label,
      textBlocks: cluster.textBlocks,
      centroid: cluster.centroid,
      confidence: cluster.confidence
    }));
  }

  /**
   * Get cluster with its notes
   */
  async getClusterWithNotes(clusterId: string): Promise<{
    cluster: ClusterData;
    notes: Array<{
      id: string;
      originalText: string;
      cleanedText: string;
      confidence: number;
    }>;
  } | null> {
    const result = await this.clusterRepository.getClusterWithNotes(clusterId);
    
    if (!result) {
      return null;
    }
    
    return {
      cluster: {
        id: result.cluster.id,
        label: result.cluster.label,
        textBlocks: result.cluster.textBlocks,
        centroid: result.cluster.centroid,
        confidence: result.cluster.confidence
      },
      notes: result.notes
    };
  }

  /**
   * Update cluster label
   */
  async updateClusterLabel(clusterId: string, label: string): Promise<ClusterData | null> {
    const updatedCluster = await this.clusterRepository.updateLabel(clusterId, label);
    
    if (!updatedCluster) {
      return null;
    }
    
    return {
      id: updatedCluster.id,
      label: updatedCluster.label,
      textBlocks: updatedCluster.textBlocks,
      centroid: updatedCluster.centroid,
      confidence: updatedCluster.confidence
    };
  }

  /**
   * Generate automatic theme labels for clusters using LLM
   */
  async generateThemeLabels(
    projectId: string,
    clusterIds?: string[]
  ): Promise<Array<{ clusterId: string; suggestedLabel: string; confidence: number }>> {
    try {
      // Get clusters to process
      let clusters: ClusterData[];
      if (clusterIds && clusterIds.length > 0) {
        clusters = [];
        for (const clusterId of clusterIds) {
          const clusterData = await this.getClusterWithNotes(clusterId);
          if (clusterData) {
            clusters.push(clusterData.cluster);
          }
        }
      } else {
        clusters = await this.getProjectClusters(projectId);
      }

      const suggestions: Array<{ clusterId: string; suggestedLabel: string; confidence: number }> = [];

      // Process each cluster for theme labeling
      for (const cluster of clusters) {
        const clusterWithNotes = await this.getClusterWithNotes(cluster.id);
        if (!clusterWithNotes || clusterWithNotes.notes.length === 0) {
          continue;
        }

        // Create prompt for theme labeling
        const noteTexts = clusterWithNotes.notes
          .map((note, index) => `${index + 1}. "${note.cleanedText}"`)
          .join('\n');

        const prompt = `
Analyze the following group of related text notes and generate a concise, descriptive theme label that captures the main topic or concept.

Guidelines:
- Keep the label between 2-5 words
- Make it specific and meaningful
- Avoid generic terms like "Notes" or "Text"
- Focus on the core theme or topic
- Use title case formatting

Notes in this cluster:
${noteTexts}

Provide your response as a JSON object with this structure:
{
  "label": "Descriptive Theme Label",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this label fits"
}

Only respond with valid JSON.`;

        try {
          const response = await openai.createChatCompletion({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: "You are an expert at analyzing text content and creating concise, meaningful theme labels."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.3,
            max_tokens: 300
          });

          const content = response.data.choices[0].message?.content || "";
          const result = this.parseThemeLabelResponse(content);
          
          suggestions.push({
            clusterId: cluster.id,
            suggestedLabel: result.label,
            confidence: result.confidence
          });
        } catch (error) {
          console.error(`Error generating theme label for cluster ${cluster.id}:`, error);
          // Provide fallback label
          suggestions.push({
            clusterId: cluster.id,
            suggestedLabel: `Theme ${suggestions.length + 1}`,
            confidence: 0.5
          });
        }
      }

      return suggestions;
    } catch (error) {
      console.error('Error in generateThemeLabels:', error);
      throw error;
    }
  }

  /**
   * Parse theme label response from LLM
   */
  private parseThemeLabelResponse(response: string): { label: string; confidence: number } {
    try {
      const jsonMatch = response.match(/```json\n([\s\S]*)\n```/) || 
                       response.match(/```\n([\s\S]*)\n```/) ||
                       response.match(/{[\s\S]*}/);
      
      const jsonContent = jsonMatch ? jsonMatch[0].replace(/```json\n|```\n|```/g, '') : response;
      const result = JSON.parse(jsonContent);
      
      return {
        label: result.label || 'Untitled Theme',
        confidence: Math.max(0, Math.min(1, result.confidence || 0.7))
      };
    } catch (error) {
      console.error('Error parsing theme label response:', error);
      return {
        label: 'Untitled Theme',
        confidence: 0.5
      };
    }
  }

  /**
   * Validate label uniqueness within a project
   */
  async validateLabelUniqueness(
    projectId: string, 
    label: string, 
    excludeClusterId?: string
  ): Promise<{ isUnique: boolean; suggestions?: string[] }> {
    try {
      const clusters = await this.getProjectClusters(projectId);
      const existingLabels = clusters
        .filter(cluster => cluster.id !== excludeClusterId)
        .map(cluster => cluster.label.toLowerCase());

      const isUnique = !existingLabels.includes(label.toLowerCase());

      if (isUnique) {
        return { isUnique: true };
      }

      // Generate alternative suggestions
      const suggestions = await this.generateLabelSuggestions(label, existingLabels);
      
      return { 
        isUnique: false, 
        suggestions 
      };
    } catch (error) {
      console.error('Error validating label uniqueness:', error);
      return { isUnique: true }; // Default to allowing the label if validation fails
    }
  }

  /**
   * Generate alternative label suggestions
   */
  private async generateLabelSuggestions(
    originalLabel: string, 
    existingLabels: string[]
  ): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Simple numeric variations
    for (let i = 2; i <= 5; i++) {
      const variation = `${originalLabel} ${i}`;
      if (!existingLabels.includes(variation.toLowerCase())) {
        suggestions.push(variation);
      }
    }

    // Synonym-based variations using LLM
    try {
      const prompt = `
Given the label "${originalLabel}" and these existing labels: ${existingLabels.join(', ')}, 
generate 3 alternative labels that convey similar meaning but are distinct.

Guidelines:
- Keep labels concise (2-5 words)
- Maintain the core meaning
- Avoid the existing labels
- Use title case

Respond with a JSON array of strings:
["Alternative Label 1", "Alternative Label 2", "Alternative Label 3"]`;

      const response = await openai.createChatCompletion({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are helpful at generating alternative labels and synonyms."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 200
      });

      const content = response.data.choices[0].message?.content || "";
      const llmSuggestions = JSON.parse(content);
      
      if (Array.isArray(llmSuggestions)) {
        suggestions.push(...llmSuggestions.slice(0, 3));
      }
    } catch (error) {
      console.error('Error generating LLM-based suggestions:', error);
    }

    return suggestions.slice(0, 5); // Return max 5 suggestions
  }

  /**
   * Get label history and version tracking for a cluster
   */
  async getClusterLabelHistory(clusterId: string): Promise<Array<{
    label: string;
    changedAt: Date;
    changedBy?: string;
    isAutoGenerated: boolean;
  }>> {
    // This would require a separate label_history table in a full implementation
    // For now, return current label as single history entry
    const cluster = await this.clusterRepository.findById(clusterId);
    if (!cluster) {
      return [];
    }

    return [{
      label: cluster.label,
      changedAt: cluster.updatedAt,
      isAutoGenerated: cluster.label.startsWith('Cluster ') || cluster.label.startsWith('Theme ')
    }];
  }

  /**
   * Move notes between clusters
   */
  async moveNotesToCluster(
    noteIds: string[], 
    targetClusterId: string | null
  ): Promise<boolean> {
    try {
      if (targetClusterId) {
        // Assign notes to target cluster
        await this.noteRepository.assignToCluster(noteIds, targetClusterId);
        
        // Update cluster text blocks
        const cluster = await this.clusterRepository.findById(targetClusterId);
        if (cluster) {
          const updatedTextBlocks = [...new Set([...cluster.textBlocks, ...noteIds])];
          await this.clusterRepository.updateById(targetClusterId, { textBlocks: updatedTextBlocks });
        }
      } else {
        // Remove notes from any cluster
        await this.noteRepository.removeFromCluster(noteIds);
      }
      
      return true;
    } catch (error) {
      console.error('Error moving notes between clusters:', error);
      return false;
    }
  }
}