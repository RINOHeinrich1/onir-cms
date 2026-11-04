-- 0081_chat_messages_blocks.sql — ADR-0067 §5.
-- Migration ADDITIVE uniquement : blocs riches ordonnés d'un message.
-- `content` reste le texte de secours et la valeur indexable ; aucun backfill
-- métier (les messages existants reçoivent un tableau vide).

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS blocks jsonb;

UPDATE chat_messages
   SET blocks = '[]'::jsonb
 WHERE blocks IS NULL;

ALTER TABLE chat_messages
  ALTER COLUMN blocks SET DEFAULT '[]'::jsonb,
  ALTER COLUMN blocks SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_blocks_array'
  ) THEN
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_blocks_array
      CHECK (jsonb_typeof(blocks) = 'array');
  END IF;
END $$;
