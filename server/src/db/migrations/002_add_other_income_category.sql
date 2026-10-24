-- FinTrack Database Migration 002: Add 'Other' income category
-- Ensures the 'Other' category is available for income transactions, matching frontend support

INSERT INTO categories (user_id, name, type, icon, is_system)
VALUES (NULL, 'Other', 'income', '🏷️', TRUE)
ON CONFLICT (name, type) WHERE user_id IS NULL DO NOTHING;
