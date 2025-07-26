// Repository exports
export { BaseRepository } from './BaseRepository.js';
export { UserRepository } from './UserRepository.js';
export { ProjectRepository } from './ProjectRepository.js';
export { ProcessedImageRepository } from './ProcessedImageRepository.js';
export { NoteRepository } from './NoteRepository.js';
export { ClusterRepository } from './ClusterRepository.js';

// Repository instances (singleton pattern)
let userRepository: UserRepository | null = null;
let projectRepository: ProjectRepository | null = null;
let processedImageRepository: ProcessedImageRepository | null = null;
let noteRepository: NoteRepository | null = null;
let clusterRepository: ClusterRepository | null = null;

export function getUserRepository(): UserRepository {
  if (!userRepository) {
    userRepository = new UserRepository();
  }
  return userRepository;
}

export function getProjectRepository(): ProjectRepository {
  if (!projectRepository) {
    projectRepository = new ProjectRepository();
  }
  return projectRepository;
}

export function getProcessedImageRepository(): ProcessedImageRepository {
  if (!processedImageRepository) {
    processedImageRepository = new ProcessedImageRepository();
  }
  return processedImageRepository;
}

export function getNoteRepository(): NoteRepository {
  if (!noteRepository) {
    noteRepository = new NoteRepository();
  }
  return noteRepository;
}

export function getClusterRepository(): ClusterRepository {
  if (!clusterRepository) {
    clusterRepository = new ClusterRepository();
  }
  return clusterRepository;
}

// Cleanup function for graceful shutdown
export async function closeRepositories(): Promise<void> {
  // Individual repositories don't need cleanup, but the database pool does
  // This is handled in the database configuration
}