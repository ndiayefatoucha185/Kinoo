-- Essai d'une séance offerte + nouveau forfait payant « Découverte ».
-- Les comptes déjà existants restent à essai_actif = false : leur comportement ne change pas.
ALTER TABLE users ADD COLUMN IF NOT EXISTS essai_actif boolean NOT NULL DEFAULT false;
