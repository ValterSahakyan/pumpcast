function createTokenStateStore(pool) {
  async function readState(client, address) {
    const { rows } = await client.query(
      `SELECT
         token_address,
         token,
         market,
         last_observed_at,
         last_event_type,
         last_event_priority,
         last_comment_at,
         last_comment_text
       FROM token_states
       WHERE token_address = $1`,
      [address]
    );

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    return {
      token: row.token || null,
      market: row.market || null,
      lastObservedAt: Number(row.last_observed_at || 0),
      lastEventType: row.last_event_type || null,
      lastEventPriority: row.last_event_priority || null,
      lastCommentAt: Number(row.last_comment_at || 0),
      lastCommentText: row.last_comment_text || "",
    };
  }

  async function writeState(client, address, nextState) {
    await client.query(
      `INSERT INTO token_states (
         token_address,
         token,
         market,
         last_observed_at,
         last_event_type,
         last_event_priority,
         last_comment_at,
         last_comment_text
       ) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8)
       ON CONFLICT (token_address) DO UPDATE SET
         token = EXCLUDED.token,
         market = EXCLUDED.market,
         last_observed_at = EXCLUDED.last_observed_at,
         last_event_type = EXCLUDED.last_event_type,
         last_event_priority = EXCLUDED.last_event_priority,
         last_comment_at = EXCLUDED.last_comment_at,
         last_comment_text = EXCLUDED.last_comment_text`,
      [
        address,
        JSON.stringify(nextState.token || null),
        JSON.stringify(nextState.market || null),
        Number(nextState.lastObservedAt || 0),
        nextState.lastEventType || null,
        nextState.lastEventPriority || null,
        Number(nextState.lastCommentAt || 0),
        nextState.lastCommentText || "",
      ]
    );
  }

  async function withLockedState(address, handler) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [address]);

      const previousState = await readState(client, address);
      const { response, nextState } = await handler(previousState);

      if (nextState) {
        await writeState(client, address, nextState);
      }

      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    withLockedState,
  };
}

module.exports = {
  createTokenStateStore,
};
