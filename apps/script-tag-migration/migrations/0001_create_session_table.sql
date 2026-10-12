CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL,
  shop TEXT NOT NULL,
  state TEXT NOT NULL,
  isOnline INTEGER NOT NULL DEFAULT 0,
  scope TEXT,
  expires TEXT,
  accessToken TEXT NOT NULL,
  userId BLOB,
  firstName TEXT,
  lastName TEXT,
  email TEXT,
  accountOwner INTEGER,
  locale TEXT,
  collaborator INTEGER,
  emailVerified INTEGER,
  refreshToken TEXT,
  refreshTokenExpires TEXT
);

CREATE INDEX session_shop_idx ON session (shop);
