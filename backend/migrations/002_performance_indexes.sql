-- Performance optimization indexes for Chicken Scratch application
-- This migration adds indexes to improve query performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_user_created ON projects(user_id, created_at DESC);

-- Processed images table indexes
CREATE INDEX IF NOT EXISTS idx_processed_images_project_id ON processed_images(project_id);
CREATE INDEX IF NOT EXISTS idx_processed_images_uploaded_at ON processed_images(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_processed_images_processing_status ON processed_images(processing_status);
CREATE INDEX IF NOT EXISTS idx_processed_images_project_status ON processed_images(project_id, processing_status);

-- Notes table indexes
CREATE INDEX IF NOT EXISTS idx_notes_image_id ON notes(image_id);
CREATE INDEX IF NOT EXISTS idx_notes_cluster_id ON notes(cluster_id);
CREATE INDEX IF NOT EXISTS idx_notes_confidence ON notes(confidence);
CREATE INDEX IF NOT EXISTS idx_notes_image_cluster ON notes(image_id, cluster_id);

-- Bounding boxes table indexes
CREATE INDEX IF NOT EXISTS idx_bounding_boxes_image_id ON bounding_boxes(image_id);
CREATE INDEX IF NOT EXISTS idx_bounding_boxes_note_id ON bounding_boxes(note_id);

-- Clusters table indexes
CREATE INDEX IF NOT EXISTS idx_clusters_project_id ON clusters(project_id);
CREATE INDEX IF NOT EXISTS idx_clusters_confidence ON clusters(confidence);
CREATE INDEX IF NOT EXISTS idx_clusters_project_confidence ON clusters(project_id, confidence DESC);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_projects_user_status_created ON projects(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_image_confidence ON notes(image_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_processed_images_project_uploaded ON processed_images(project_id, uploaded_at DESC);

-- Full-text search indexes for text content
CREATE INDEX IF NOT EXISTS idx_notes_original_text_gin ON notes USING gin(to_tsvector('english', original_text));
CREATE INDEX IF NOT EXISTS idx_notes_cleaned_text_gin ON notes USING gin(to_tsvector('english', cleaned_text));
CREATE INDEX IF NOT EXISTS idx_clusters_label_gin ON clusters USING gin(to_tsvector('english', label));

-- Partial indexes for active/completed projects
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(user_id, updated_at DESC) WHERE status IN ('processing', 'completed');
CREATE INDEX IF NOT EXISTS idx_projects_completed ON projects(user_id, created_at DESC) WHERE status = 'completed';

-- Indexes for job queue performance (if using database for jobs)
CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority DESC, created_at) WHERE status IN ('waiting', 'active');
CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs(user_id, status, created_at DESC);

-- Statistics update for better query planning
ANALYZE users;
ANALYZE projects;
ANALYZE processed_images;
ANALYZE notes;
ANALYZE bounding_boxes;
ANALYZE clusters;