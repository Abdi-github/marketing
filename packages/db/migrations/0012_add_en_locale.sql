-- Migration 0012: add English locale to the locale_code enum.
-- Supports English-speaking SME owners in Switzerland.

ALTER TYPE "locale_code" ADD VALUE IF NOT EXISTS 'en';
