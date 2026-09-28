-- Test clients for the demo. Copy to seed.sql (gitignored, real phone numbers stay out of git),
-- fill in the phones added as recipients of the WhatsApp test number, then:
--   pnpm --filter @trener/worker db:seed:local
INSERT INTO client (id, phone, name) VALUES
  ('c-1', '+385910000001', 'Marko'),
  ('c-2', '+385910000002', 'Ana')
ON CONFLICT (id) DO UPDATE SET phone = excluded.phone, name = excluded.name;
