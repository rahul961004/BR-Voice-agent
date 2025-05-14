import { Client, Environment } from "square";

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
  additionalHeaders: { 'Square-Version': '2025-04-16' }
});

export async function handler(event) {
  try {
    const { idempotency_key, checkout } = JSON.parse(event.body || '{}');
    const response = await client.terminalApi.createTerminalCheckout({
      idempotencyKey: idempotency_key,
      checkout
    });
    return {
      statusCode: 200,
      body: JSON.stringify(response.result)
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
}

