-- Lethe: Transcription cache table
-- Stores caption results keyed by file hash to avoid redundant API calls

CREATE TABLE IF NOT EXISTS transcription_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_hash VARCHAR(64) NOT NULL UNIQUE,
    file_name VARCHAR(255),
    duration_ms INTEGER,
    chunks JSONB NOT NULL DEFAULT '[]',
    full_text TEXT NOT NULL DEFAULT '',
    model VARCHAR(100) DEFAULT 'whisper-large-v3-turbo',
    language VARCHAR(10) DEFAULT 'id',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transcription_cache_hash ON transcription_cache(file_hash);
