-- Temps de lecture réellement écoulé par séance (secondes)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS lecture_totale_sec real NOT NULL DEFAULT 0;
