-- FinTrack Database Migration 003: Add password_hash column to users table
-- Prepares the schema for authentication while preserving all existing users and relationships.

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
