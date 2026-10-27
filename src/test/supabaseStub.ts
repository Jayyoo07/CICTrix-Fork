/**
 * A Supabase client stand-in for component tests: every query chain
 * (`from().select().eq()...`) resolves to `{ data: rowsFor(table), error: null }`,
 * and auth/channel calls are inert.
 */
export function supabaseStub(rowsFor: (table: string) => unknown[] = () => []) {
  const chain = (table: string): unknown =>
    new Proxy(() => {}, {
      get: (_t, prop) => {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve({ data: rowsFor(table), error: null });
        }
        return () => chain(table);
      },
      apply: () => chain(table),
    });
  const channel = { on: () => channel, subscribe: () => channel, unsubscribe: () => {} };
  return {
    from: (table: string) => chain(table),
    rpc: () => chain('rpc'),
    channel: () => channel,
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  };
}
