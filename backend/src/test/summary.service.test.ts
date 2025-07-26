import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SummaryService } from '../services/summary.js';
import type { 
  Cluster, 
  Note, 
  ProjectSummary,
  ThemeSummary,
  ThemeDistribution 
} from 'chicken-scratch-shared/types/models';

// Mock dependencies
vi.mock('../models/ClusterRepository.js');
vi.mock('../models/NoteRepository.js');
vi.mock('../models/ProjectRepository.js');
vi.mock('openai');

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-api-key';

// Mock data
const mockClusters: Cluster[] = [
  {
    id: 'cluster-1',
    projectId: 'project-1',
    label: 'Learning Objectives',
    textBlocks: ['note-1', 'note-2', 'note-3'],
    confidence: 0.85,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 'cluster-2',
    projectId: 'project-1',
    label: 'Assessment Methods',
    textBlocks: ['note-4', 'note-5'],
    confidence: 0.78,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 'cluster-3',
    projectId: 'project-1',
    label: 'Student Engagement',
    textBlocks: ['note-6'],
    confidence: 0.92,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }
];

const mockNotes: Note[] = [
  {
    id: 'note-1',
    imageId: 'image-1',
    originalText: 'Students should understand basic concepts',
    cleanedText: 'Students should understand basic concepts',
    boundingBox: { left: 0, top: 0, width: 100, height: 20 },
    confidence: 0.9,
    clusterId: 'cluster-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 'note-2',
    imageId: 'image-1',
    originalText: 'Learning goals must be clear and measurable',
    cleanedText: 'Learning goals must be clear and measurable',
    boundingBox: { left: 0, top: 25, width: 100, height: 20 },
    confidence: 0.88,
    clusterId: 'cluster-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 'note-3',
    imageId: 'image-1',
    originalText: 'Objectives should align with curriculum standards',
    cleanedText: 'Objectives should align with curriculum standards',
    boundingBox: { left: 0, top: 50, width: 100, height: 20 },
    confidence: 0.85,
    clusterId: 'cluster-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 'note-4',
    imageId: 'image-2',
    originalText: 'Use formative assessments regularly',
    cleanedText: 'Use formative assessments regularly',
    boundingBox: { left: 0, top: 0, width: 100, height: 20 },
    confidence: 0.82,
    clusterId: 'cluster-2',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 'note-5',
    imageId: 'image-2',
    originalText: 'Rubrics help standardize grading',
    cleanedText: 'Rubrics help standardize grading',
    boundingBox: { left: 0, top: 25, width: 100, height: 20 },
    confidence: 0.87,
    clusterId: 'cluster-2',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: 'note-6',
    imageId: 'image-3',
    originalText: 'Interactive activities increase participation',
    cleanedText: 'Interactive activities increase participation',
    boundingBox: { left: 0, top: 0, width: 100, height: 20 },
    confidence: 0.91,
    clusterId: 'cluster-3',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }
];

describe('SummaryService', () => {
  let summaryService: SummaryService;
  let mockClusterRepository: any;
  let mockNoteRepository: any;
  let mockProjectRepository: any;
  let mockOpenAI: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock repositories
    const ClusterRepositoryModule = await import('../models/ClusterRepository.js');
    const NoteRepositoryModule = await import('../models/NoteRepository.js');
    const ProjectRepositoryModule = await import('../models/ProjectRepository.js');
    
    const { ClusterRepository } = vi.mocked(ClusterRepositoryModule);
    const { NoteRepository } = vi.mocked(NoteRepositoryModule);
    const { ProjectRepository } = vi.mocked(ProjectRepositoryModule);
    
    mockClusterRepository = {
      findByProjectId: vi.fn(),
    };
    mockNoteRepository = {
      findByProjectId: vi.fn(),
    };
    mockProjectRepository = {
      findById: vi.fn(),
      updateById: vi.fn(),
    };

    ClusterRepository.prototype.findByProjectId = mockClusterRepository.findByProjectId;
    NoteRepository.prototype.findByProjectId = mockNoteRepository.findByProjectId;
    ProjectRepository.prototype.findById = mockProjectRepository.findById;
    ProjectRepository.prototype.updateById = mockProjectRepository.updateById;

    // Mock OpenAI
    const OpenAIModule = await import('openai');
    const MockedOpenAI = vi.mocked(OpenAIModule.default);
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    };
    MockedOpenAI.mockImplementation(() => mockOpenAI);

    summaryService = new SummaryService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateProjectSummary', () => {
    beforeEach(() => {
      mockClusterRepository.findByProjectId.mockResolvedValue(mockClusters);
      mockNoteRepository.findByProjectId.mockResolvedValue(mockNotes);
      mockProjectRepository.updateById.mockResolvedValue(true);
    });

    it('should generate a complete project summary', async () => {
      // Mock OpenAI responses
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '["learning", "objectives", "curriculum", "standards", "goals"]'
            }
          }]
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '["assessment", "formative", "rubrics", "grading", "evaluation"]'
            }
          }]
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: '["engagement", "interactive", "activities", "participation", "involvement"]'
            }
          }]
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'The analysis reveals three key focus areas in educational planning. Learning objectives dominate the discussion at 50% of all notes, indicating a strong emphasis on goal-setting and curriculum alignment. Assessment methods and student engagement represent important secondary themes, suggesting a balanced approach to teaching effectiveness.'
            }
          }]
        });

      const result = await summaryService.generateProjectSummary({
        projectId: 'project-1'
      });

      expect(result).toBeDefined();
      expect(result.topThemes).toHaveLength(3);
      expect(result.topThemes[0].label).toBe('Learning Objectives');
      expect(result.topThemes[0].percentage).toBe(50);
      expect(result.topThemes[0].noteCount).toBe(3);
      expect(result.metadata.totalNotes).toBe(6);
      expect(result.metadata.clustersFound).toBe(3);
      expect(result.overallInsights).toContain('educational planning');
    });

    it('should calculate theme distribution correctly', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: '["test", "terms"]'
          }
        }]
      });

      const result = await summaryService.generateProjectSummary({
        projectId: 'project-1'
      });

      const distribution = result.distribution;
      expect(distribution).toHaveLength(3);
      expect(distribution[0].theme).toBe('Learning Objectives');
      expect(distribution[0].percentage).toBe(50);
      expect(distribution[1].theme).toBe('Assessment Methods');
      expect(distribution[1].percentage).toBe(33.33);
      expect(distribution[2].theme).toBe('Student Engagement');
      expect(distribution[2].percentage).toBe(16.67);
    });

    it('should filter themes by minimum percentage', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: '["test"]'
          }
        }]
      });

      const result = await summaryService.generateProjectSummary({
        projectId: 'project-1',
        summaryOptions: {
          minThemePercentage: 20,
          includeQuotes: true,
          includeDistribution: true,
          maxThemes: 10
        }
      });

      // Only themes with >= 20% should be included
      expect(result.topThemes).toHaveLength(2);
      expect(result.topThemes.every(theme => theme.percentage >= 20)).toBe(true);
    });

    it('should limit themes by maxThemes option', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: '["test"]'
          }
        }]
      });

      const result = await summaryService.generateProjectSummary({
        projectId: 'project-1',
        summaryOptions: {
          maxThemes: 2,
          minThemePercentage: 0,
          includeQuotes: true,
          includeDistribution: true
        }
      });

      expect(result.topThemes).toHaveLength(2);
    });

    it('should extract representative quotes when enabled', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: '["test"]'
          }
        }]
      });

      const result = await summaryService.generateProjectSummary({
        projectId: 'project-1',
        summaryOptions: {
          includeQuotes: true,
          includeDistribution: true,
          maxThemes: 10,
          minThemePercentage: 0
        }
      });

      expect(result.representativeQuotes.length).toBeGreaterThan(0);
      expect(result.representativeQuotes[0]).toHaveProperty('text');
      expect(result.representativeQuotes[0]).toHaveProperty('theme');
      expect(result.representativeQuotes[0]).toHaveProperty('confidence');
      expect(result.representativeQuotes[0]).toHaveProperty('source');
    });

    it('should skip quotes when disabled', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: '["test"]'
          }
        }]
      });

      const result = await summaryService.generateProjectSummary({
        projectId: 'project-1',
        summaryOptions: {
          includeQuotes: false,
          includeDistribution: true,
          maxThemes: 10,
          minThemePercentage: 0
        }
      });

      expect(result.representativeQuotes).toHaveLength(0);
    });

    it('should handle empty clusters gracefully', async () => {
      mockClusterRepository.findByProjectId.mockResolvedValue([]);
      mockNoteRepository.findByProjectId.mockResolvedValue([]);

      await expect(summaryService.generateProjectSummary({
        projectId: 'project-1'
      })).rejects.toThrow('No clusters or notes found for project');
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await summaryService.generateProjectSummary({
        projectId: 'project-1'
      });

      // Should still generate summary with fallback methods
      expect(result).toBeDefined();
      expect(result.topThemes).toHaveLength(3);
      expect(result.overallInsights).toContain('Analysis of 6 notes');
    });
  });

  describe('getProjectSummary', () => {
    it('should return existing project summary', async () => {
      const mockSummary: ProjectSummary = {
        topThemes: [],
        overallInsights: 'Test insights',
        distribution: [],
        representativeQuotes: [],
        metadata: {
          totalNotes: 5,
          processingTime: 1000,
          clustersFound: 2,
          averageConfidence: 0.8,
          generatedAt: new Date()
        }
      };

      mockProjectRepository.findById.mockResolvedValue({
        id: 'project-1',
        summary: mockSummary
      });

      const result = await summaryService.getProjectSummary('project-1');
      expect(result).toEqual(mockSummary);
    });

    it('should return null when no summary exists', async () => {
      mockProjectRepository.findById.mockResolvedValue({
        id: 'project-1',
        summary: null
      });

      const result = await summaryService.getProjectSummary('project-1');
      expect(result).toBeNull();
    });

    it('should return null when project does not exist', async () => {
      mockProjectRepository.findById.mockResolvedValue(null);

      const result = await summaryService.getProjectSummary('project-1');
      expect(result).toBeNull();
    });
  });

  describe('updateThemeImportance', () => {
    const mockSummary: ProjectSummary = {
      topThemes: [
        {
          label: 'Theme A',
          noteCount: 3,
          percentage: 50,
          keyTerms: ['term1', 'term2'],
          representativeQuote: 'Quote A'
        },
        {
          label: 'Theme B',
          noteCount: 2,
          percentage: 33.33,
          keyTerms: ['term3', 'term4'],
          representativeQuote: 'Quote B'
        }
      ],
      overallInsights: 'Test insights',
      distribution: [
        { theme: 'Theme A', count: 3, percentage: 50 },
        { theme: 'Theme B', count: 2, percentage: 33.33 }
      ],
      representativeQuotes: [],
      metadata: {
        totalNotes: 5,
        processingTime: 1000,
        clustersFound: 2,
        averageConfidence: 0.8,
        generatedAt: new Date()
      }
    };

    beforeEach(() => {
      mockProjectRepository.findById.mockResolvedValue({
        id: 'project-1',
        summary: mockSummary
      });
      mockProjectRepository.updateById.mockResolvedValue(true);
    });

    it('should update theme importance and normalize percentages', async () => {
      const themeUpdates = [
        { theme: 'Theme A', importance: 70 },
        { theme: 'Theme B', importance: 30 }
      ];

      const result = await summaryService.updateThemeImportance('project-1', themeUpdates);

      expect(result).toBeDefined();
      expect(result!.topThemes[0].percentage).toBe(70);
      expect(result!.topThemes[1].percentage).toBe(30);
      expect(result!.distribution[0].percentage).toBe(70);
      expect(result!.distribution[1].percentage).toBe(30);
    });

    it('should handle missing themes gracefully', async () => {
      const themeUpdates = [
        { theme: 'Non-existent Theme', importance: 50 }
      ];

      const result = await summaryService.updateThemeImportance('project-1', themeUpdates);

      expect(result).toBeDefined();
      // Original themes should remain unchanged
      expect(result!.topThemes[0].percentage).toBe(50);
      expect(result!.topThemes[1].percentage).toBe(50); // Normalized
    });
  });

  describe('generateSummaryDigest', () => {
    const mockSummary: ProjectSummary = {
      topThemes: [
        {
          label: 'Learning Objectives',
          noteCount: 3,
          percentage: 50,
          keyTerms: ['learning', 'objectives', 'goals'],
          representativeQuote: 'Students should understand basic concepts'
        }
      ],
      overallInsights: 'The analysis reveals strong focus on learning objectives.',
      distribution: [
        { theme: 'Learning Objectives', count: 3, percentage: 50 }
      ],
      representativeQuotes: [
        {
          text: 'Students should understand basic concepts',
          theme: 'Learning Objectives',
          confidence: 0.9,
          source: 'Note abc123'
        }
      ],
      metadata: {
        totalNotes: 6,
        processingTime: 1000,
        clustersFound: 3,
        averageConfidence: 0.85,
        generatedAt: new Date()
      }
    };

    beforeEach(() => {
      mockProjectRepository.findById.mockResolvedValue({
        id: 'project-1',
        summary: mockSummary
      });
    });

    it('should generate brief digest', async () => {
      const result = await summaryService.generateSummaryDigest('project-1', 'brief');

      expect(result).toContain('Analysis of 6 notes');
      expect(result).toContain('Learning Objectives (50%)');
      expect(result).toContain('strong focus on learning objectives');
    });

    it('should generate detailed digest', async () => {
      const result = await summaryService.generateSummaryDigest('project-1', 'detailed');

      expect(result).toContain('# Summary Analysis');
      expect(result).toContain('**Total Notes:** 6');
      expect(result).toContain('**Analysis Confidence:** 85.0%');
      expect(result).toContain('## Top Themes');
      expect(result).toContain('### 1. Learning Objectives (50%)');
      expect(result).toContain('**Key Terms:** learning, objectives, goals');
      expect(result).toContain('## Notable Quotes');
    });

    it('should generate executive digest', async () => {
      const result = await summaryService.generateSummaryDigest('project-1', 'executive');

      expect(result).toContain('## Executive Summary');
      expect(result).toContain('Analysis of 6 notes reveals');
      expect(result).toContain('"Learning Objectives" as the primary focus area');
      expect(result).toContain('**Key Findings:**');
      expect(result).toContain('**Primary Focus Areas:**');
      expect(result).toContain('*Analysis completed with 85.0% confidence*');
    });

    it('should throw error when summary not found', async () => {
      mockProjectRepository.findById.mockResolvedValue({
        id: 'project-1',
        summary: null
      });

      await expect(summaryService.generateSummaryDigest('project-1', 'brief'))
        .rejects.toThrow('No summary found for project');
    });
  });

  describe('key term extraction', () => {
    it('should extract key terms using frequency analysis as fallback', async () => {
      // Test the private method indirectly through generateProjectSummary
      mockClusterRepository.findByProjectId.mockResolvedValue([mockClusters[0]]);
      mockNoteRepository.findByProjectId.mockResolvedValue(mockNotes.slice(0, 3));
      mockProjectRepository.updateById.mockResolvedValue(true);

      // Mock OpenAI to fail for key terms but succeed for insights
      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: 'Test insights'
            }
          }]
        });

      const result = await summaryService.generateProjectSummary({
        projectId: 'project-1'
      });

      expect(result.topThemes[0].keyTerms.length).toBeGreaterThan(0);
      // Should contain words from the notes
      expect(result.topThemes[0].keyTerms.some(term => 
        ['students', 'learning', 'objectives', 'curriculum'].includes(term.toLowerCase())
      )).toBe(true);
    });
  });

  describe('quote scoring and selection', () => {
    it('should select high-quality quotes', async () => {
      const notesWithVariedQuality = [
        ...mockNotes,
        {
          id: 'note-7',
          imageId: 'image-4',
          originalText: 'Short',
          cleanedText: 'Short',
          boundingBox: { left: 0, top: 0, width: 50, height: 20 },
          confidence: 0.5,
          clusterId: 'cluster-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01')
        },
        {
          id: 'note-8',
          imageId: 'image-4',
          originalText: 'This is a well-formed sentence with good length and high confidence.',
          cleanedText: 'This is a well-formed sentence with good length and high confidence.',
          boundingBox: { left: 0, top: 25, width: 200, height: 20 },
          confidence: 0.95,
          clusterId: 'cluster-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01')
        }
      ];

      mockClusterRepository.findByProjectId.mockResolvedValue(mockClusters);
      mockNoteRepository.findByProjectId.mockResolvedValue(notesWithVariedQuality);
      mockProjectRepository.updateById.mockResolvedValue(true);

      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: '["test"]'
          }
        }]
      });

      const result = await summaryService.generateProjectSummary({
        projectId: 'project-1'
      });

      // Should prefer the high-quality quote
      const learningObjectivesQuotes = result.representativeQuotes.filter(
        quote => quote.theme === 'Learning Objectives'
      );
      
      expect(learningObjectivesQuotes.length).toBeGreaterThan(0);
      // The high-confidence, well-formed sentence should be preferred
      expect(learningObjectivesQuotes.some(quote => 
        quote.text.includes('well-formed sentence')
      )).toBe(true);
    });
  });
});