-- Enlaces acortados
CREATE TABLE links (
  id           BIGSERIAL PRIMARY KEY,
  code         VARCHAR(32)  NOT NULL,
  target_url   TEXT         NOT NULL,
  title        VARCHAR(200),
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  expires_at   TIMESTAMPTZ,
  click_count  BIGINT       NOT NULL DEFAULT 0, -- clics humanos (sin bots), lo mantiene el worker
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Los códigos distinguen mayúsculas, pero no permitimos dos que solo difieran en ellas
-- (evita confusiones tipo "Promo" vs "promo").
CREATE UNIQUE INDEX links_code_lower_uidx ON links (lower(code));
CREATE INDEX links_created_at_idx ON links (created_at DESC);

-- Un registro por clic, ya enriquecido y anonimizado (no se guarda la IP).
CREATE TABLE clicks (
  id               BIGSERIAL PRIMARY KEY,
  link_id          BIGINT       NOT NULL REFERENCES links (id) ON DELETE CASCADE,
  clicked_at       TIMESTAMPTZ  NOT NULL,
  visitor_hash     CHAR(64)     NOT NULL,
  referrer         TEXT,
  referrer_domain  VARCHAR(255),
  country          CHAR(2),
  region           VARCHAR(64),
  city             VARCHAR(128),
  browser          VARCHAR(64),
  os               VARCHAR(64),
  device           VARCHAR(32),
  is_bot           BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX clicks_link_time_idx ON clicks (link_id, clicked_at DESC);
CREATE INDEX clicks_time_idx ON clicks (clicked_at DESC);
