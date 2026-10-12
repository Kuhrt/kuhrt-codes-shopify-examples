import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sessionTable = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    shop: text('shop').notNull(),
    state: text('state').notNull(),
    isOnline: integer('isOnline', { mode: 'boolean' }).notNull().default(false),
    scope: text('scope'),
    expires: text('expires'),
    accessToken: text('accessToken').notNull(),
    userId: blob('userId', { mode: 'bigint' }),
    firstName: text('firstName'),
    lastName: text('lastName'),
    email: text('email'),
    accountOwner: integer('accountOwner', { mode: 'boolean' }),
    locale: text('locale'),
    collaborator: integer('collaborator', { mode: 'boolean' }),
    emailVerified: integer('emailVerified', { mode: 'boolean' }),
    refreshToken: text('refreshToken'),
    refreshTokenExpires: text('refreshTokenExpires')
  },
  (table) => [index('session_shop_idx').on(table.shop)]
);
