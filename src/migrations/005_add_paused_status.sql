-- Add 'paused' to the campaign_status enum
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'paused';
