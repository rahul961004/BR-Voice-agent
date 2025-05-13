import { SquareClient, Environment } from "@square/square";
const client = new SquareClient({
  environment: Environment.Production,
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

export async function handler(event) {
  try {
    const { idempotency_key, checkout } = JSON.parse(event.body || '{}');
    const resp = await client.terminalApi.createTerminalCheckout({
      idempotencyKey: idempotency_key,
      checkout
    });
    return {
      statusCode: 200,
      body: JSON.stringify(resp.result)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}

