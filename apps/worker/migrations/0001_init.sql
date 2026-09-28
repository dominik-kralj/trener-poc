-- POC schema. D1 is the source of truth; Google Calendar only mirrors confirmed holds.
-- Capacity is always 1 in the POC, so there's no capacity column yet.

CREATE TABLE client (
  id    TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE, -- E.164
  name  TEXT NOT NULL
);

CREATE TABLE slot (
  id           TEXT PRIMARY KEY,
  starts_at    TEXT NOT NULL,    -- ISO 8601 with offset
  duration_min INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('open', 'held', 'confirmed')),
  offered_at   TEXT,             -- NULL = draft, not sent to clients yet
  created_at   TEXT NOT NULL
);

CREATE TABLE hold (
  id                TEXT PRIMARY KEY,
  slot_id           TEXT NOT NULL REFERENCES slot (id),
  client_id         TEXT NOT NULL REFERENCES client (id),
  status            TEXT NOT NULL CHECK (status IN ('held', 'confirmed', 'rejected')),
  calendar_event_id TEXT,
  created_at        TEXT NOT NULL
);

-- Last line of defence for "a slot is never held by two clients at once":
-- two concurrent picks both pass core, but only one insert survives.
CREATE UNIQUE INDEX hold_one_active_per_slot ON hold (slot_id) WHERE status IN ('held', 'confirmed');

CREATE TABLE processed_message (
  id          TEXT PRIMARY KEY, -- WhatsApp message ID
  received_at TEXT NOT NULL
);
